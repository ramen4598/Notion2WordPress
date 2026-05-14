import axios from 'axios';
import * as cheerio from 'cheerio';
import type { LookupAddress } from 'node:dns';
import { lookup as dnsLookup } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

import { logger } from '../../../lib/logger.js';
import { retryWithBackoff } from '../../../lib/retry.js';
import { asError } from '../../../lib/utils.js';
import { LinkPreviewException } from '../error/linkPreview.error.js';
import type { ILinkPreviewMetadataFetcher, LinkPreviewMetadata } from '../interface/linkPreviewMetadata.js';

const MAX_REDIRECTS = 5;
const LINK_PREVIEW_FETCH_TIMEOUT_MS = 5000;
const LINK_PREVIEW_FETCH_MAX_ATTEMPTS = 1;
const LINK_PREVIEW_MAX_BODY_BYTES = 512 * 1024;
const HTML_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'application/xml', 'text/xml']);

type RedirectOptions = {
  protocol?: string;
  hostname?: string;
  host?: string;
  port?: string | number;
  path?: string;
  href?: string;
};

type RedirectResult = {
  finalUrl: URL;
  html: string;
};

type SafeLookupFunction = NonNullable<http.AgentOptions['lookup']>;

class LinkPreviewMetadataFetcherImpl implements ILinkPreviewMetadataFetcher {
  private readonly lookupSafeAddress: SafeLookupFunction = (hostname, options, callback) => {
    const lookupOptions = typeof options === 'function' ? {} : options;
    const done = typeof options === 'function' ? options : callback;
    if (!done) throw new LinkPreviewException('Missing DNS lookup callback');

    const allLookupOptions = { ...lookupOptions, all: true as const, verbatim: false };
    const requestedAll = typeof lookupOptions === 'object' && 'all' in lookupOptions && lookupOptions.all === true;

    void dnsLookup(hostname, allLookupOptions)
      .then((addresses: LookupAddress[]) => {
        for (const { address } of addresses) {
          if (this.isBlockedIpAddress(address)) {
            throw new LinkPreviewException(`Blocked internal address: ${address}`);
          }
        }

        if (requestedAll) {
          (done as (error: Error | null, addresses: LookupAddress[]) => void)(null, addresses);
          return;
        }

        const [firstAddress] = addresses;
        (done as (error: Error | null, address: string, family: number) => void)(
          null,
          firstAddress.address,
          firstAddress.family
        );
      })
      .catch((error: Error) => {
        (done as (error: Error, address?: string, family?: number) => void)(error);
      });
  };

  private readonly httpAgent = new http.Agent({ lookup: this.lookupSafeAddress });
  private readonly httpsAgent = new https.Agent({ lookup: this.lookupSafeAddress });

  async fetchMetadata(url: string): Promise<LinkPreviewMetadata> {
    const fetchedAt = new Date().toISOString();

    try {
      const safeUrl = await this.validateFetchableUrl(url);
      const { html, finalUrl } = await retryWithBackoff(() => this.getWithSafeRedirects(safeUrl), {
        maxAttempts: LINK_PREVIEW_FETCH_MAX_ATTEMPTS,
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoffMultiplier: 1,
      });

      const $ = cheerio.load(html);
      const assetBaseUrl = this.getAssetBaseUrl($, finalUrl);
      const title = this.getMetaContent($, 'property', 'og:title') || $('title').first().text().trim() || url;
      const description = this.getMetaContent($, 'property', 'og:description') || undefined;
      const ogImage = this.getMetaContent($, 'property', 'og:image');
      const favicon = ogImage ? undefined : this.getFaviconUrl($);

      logger.debug('linkPreviewMetadataFetcher - Fetched metadata', { url, title });

      return {
        url,
        title,
        description,
        featuredImage: ogImage
          ? this.resolveUrl(ogImage, assetBaseUrl)
          : this.resolveFaviconUrl(favicon, assetBaseUrl),
        fetchedAt,
      };
    } catch (error: unknown) {
      const fetchError = asError(error);

      logger.warn('Failed to fetch link preview metadata', {
        url,
        error: fetchError.message,
      });

      return {
        url,
        title: url,
        description: undefined,
        featuredImage: undefined,
        fetchedAt,
        error: fetchError.message,
      };
    }
  }

  private getMetaContent($: cheerio.CheerioAPI, attribute: string, value: string): string | undefined {
    return $(`meta[${attribute}="${value}"]`).attr('content')?.trim() || undefined;
  }

  private getFaviconUrl($: cheerio.CheerioAPI): string | undefined {
    return $('link[rel~="icon"]').first().attr('href')?.trim() || undefined;
  }

  private getAssetBaseUrl($: cheerio.CheerioAPI, finalUrl: URL): string {
    const baseHref = $('base[href]').first().attr('href')?.trim();
    if (!baseHref) return finalUrl.toString();

    try {
      return new URL(baseHref, finalUrl).toString();
    } catch {
      return finalUrl.toString();
    }
  }

  private resolveUrl(value: string, baseUrl: string): string {
    return new URL(value, baseUrl).toString();
  }

  private resolveFaviconUrl(value: string | undefined, baseUrl: string): string | undefined {
    if (!value) return undefined;
    return new URL(value, baseUrl).toString();
  }

  private async getWithSafeRedirects(initialUrl: URL): Promise<RedirectResult> {
    let currentUrl = initialUrl;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await axios.get(currentUrl.toString(), {
        timeout: LINK_PREVIEW_FETCH_TIMEOUT_MS,
        maxRedirects: 0,
        proxy: false,
        responseType: 'stream',
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        validateStatus: (status) => status >= 200 && status < 400,
        beforeRedirect: (options: RedirectOptions) => this.validateRedirectOptions(options),
        headers: {
          'User-Agent': 'Notion2WordPress link preview fetcher',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        this.destroyResponseStream(response.data);

        const location = response.headers?.location;
        if (!location) throw new LinkPreviewException('Redirect response missing Location header');
        if (redirectCount === MAX_REDIRECTS) throw new LinkPreviewException('Too many redirects');

        currentUrl = await this.validateFetchableUrl(new URL(String(location), currentUrl).toString());
        continue;
      }

      try {
        this.validateHtmlResponseHeaders(response.headers ?? {});
      } catch (error) {
        this.destroyResponseStream(response.data);
        throw error;
      }

      return {
        finalUrl: currentUrl,
        html: await this.readLimitedResponseBody(response.data),
      };
    }

    throw new LinkPreviewException('Too many redirects');
  }

  private validateHtmlResponseHeaders(headers: Record<string, unknown>): void {
    const contentType = String(headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType && !HTML_CONTENT_TYPES.has(contentType)) {
      throw new LinkPreviewException(`Unsupported content-type for link preview: ${contentType}`);
    }

    const contentLength = Number(headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > LINK_PREVIEW_MAX_BODY_BYTES) {
      throw new LinkPreviewException(`Link preview content-length exceeds limit: ${contentLength} bytes`);
    }
  }

  private async readLimitedResponseBody(stream: unknown): Promise<string> {
    if (!(stream instanceof Readable)) {
      throw new LinkPreviewException('Link preview response body is not readable');
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      totalBytes += buffer.byteLength;

      if (totalBytes > LINK_PREVIEW_MAX_BODY_BYTES) {
        stream.destroy();
        throw new LinkPreviewException(`Response body exceeded link preview byte limit: ${totalBytes} bytes`);
      }

      chunks.push(buffer);
    }

    return Buffer.concat(chunks).toString('utf8');
  }

  private destroyResponseStream(stream: unknown): void {
    if (stream instanceof Readable) stream.destroy();
  }

  private validateRedirectOptions(options: RedirectOptions): void {
    const redirectHost = options.hostname
      ? `${options.hostname}${options.port ? `:${options.port}` : ''}`
      : options.host ?? '';
    const redirectUrl = options.href
      ? new URL(options.href)
      : new URL(`${options.protocol ?? 'https:'}//${redirectHost}${options.path ?? '/'}`);

    this.validateUrlParts(redirectUrl);
  }

  private async validateFetchableUrl(value: string): Promise<URL> {
    const parsedUrl = new URL(value);
    this.validateUrlParts(parsedUrl);

    const hostname = this.normalizeHostname(parsedUrl.hostname);
    if (isIP(hostname) === 0) {
      const addresses = await dnsLookup(hostname, { all: true, verbatim: false });
      for (const { address } of addresses) {
        if (this.isBlockedIpAddress(address)) {
          throw new LinkPreviewException(`Blocked internal address: ${address}`);
        }
      }
    }

    return parsedUrl;
  }

  private validateUrlParts(parsedUrl: URL): void {
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new LinkPreviewException(`Unsupported URL protocol: ${parsedUrl.protocol}`);
    }

    const hostname = this.normalizeHostname(parsedUrl.hostname);
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new LinkPreviewException(`Blocked local hostname: ${hostname}`);
    }

    if (this.isBlockedIpAddress(hostname)) {
      throw new LinkPreviewException(`Blocked internal address: ${hostname}`);
    }
  }

  private normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  }

  private isBlockedIpAddress(address: string): boolean {
    const normalizedAddress = this.normalizeHostname(address);
    const ipVersion = isIP(normalizedAddress);
    if (ipVersion === 4) return this.isBlockedIpv4Address(normalizedAddress);
    if (ipVersion === 6) return this.isBlockedIpv6Address(normalizedAddress);
    return false;
  }

  private isBlockedIpv4Address(address: string): boolean {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19 || (second === 51 && octets[2] === 100))) ||
      (first === 203 && second === 0 && octets[2] === 113) ||
      first >= 224
    );
  }

  private isBlockedIpv6Address(address: string): boolean {
    const normalizedAddress = address.toLowerCase().split('%')[0];
    const mappedIpv4 = normalizedAddress.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) return this.isBlockedIpv4Address(mappedIpv4[1]);

    const mappedIpv4Hex = normalizedAddress.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedIpv4Hex) return this.isBlockedMappedIpv4HexAddress(mappedIpv4Hex[1], mappedIpv4Hex[2]);
    if (normalizedAddress === '::' || normalizedAddress === '::1') return true;

    const hextets = normalizedAddress.split(':');
    const first = Number.parseInt(hextets[0] || '0', 16);
    const second = Number.parseInt(hextets[1] || '0', 16);

    return (
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      (first === 0x2001 && second === 0x0db8)
    );
  }

  private isBlockedMappedIpv4HexAddress(high: string, low: string): boolean {
    const highBits = Number.parseInt(high, 16);
    const lowBits = Number.parseInt(low, 16);
    const ipv4Address = [highBits >> 8, highBits & 0xff, lowBits >> 8, lowBits & 0xff].join('.');

    return this.isBlockedIpv4Address(ipv4Address);
  }
}

export const linkPreviewMetadataFetcher: ILinkPreviewMetadataFetcher = new LinkPreviewMetadataFetcherImpl();
