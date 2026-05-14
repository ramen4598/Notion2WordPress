import axios from 'axios';
import * as cheerio from 'cheerio';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { logger } from '../../../lib/logger.js';
import { retryWithBackoff } from '../../../lib/retry.js';
import { asError } from '../../../lib/utils.js';
import { BookmarkMetadata, BookmarkMetadataFetcher } from '../interface/bookmarkMetadata.js';

const MAX_REDIRECTS = 5;

type RedirectOptions = {
  protocol?: string;
  hostname?: string;
  host?: string;
  port?: string | number;
  path?: string;
  href?: string;
};

class CheerioBookmarkMetadataFetcher implements BookmarkMetadataFetcher {
  async fetchMetadata(url: string): Promise<BookmarkMetadata> {
    const fetchedAt = new Date().toISOString();

    try {
      const safeUrl = await this.validateFetchableUrl(url);
      const response = await retryWithBackoff(async () => {
        return await this.getWithSafeRedirects(safeUrl);
      });

      const $ = cheerio.load(String(response.data ?? ''));
      const title = this.getMetaContent($, 'property', 'og:title') || $('title').first().text().trim() || url;
      const description = this.getMetaContent($, 'property', 'og:description') || undefined;
      const ogImage = this.getMetaContent($, 'property', 'og:image');
      const favicon = ogImage ? undefined : this.getFaviconUrl($);

      logger.debug('bookmarkMetadataFetcher - Fetched metadata', { url, title });

      return {
        url,
        title,
        description,
        featuredImage: ogImage ? this.resolveUrl(ogImage, url) : this.resolveFaviconUrl(favicon, url),
        fetchedAt,
      };
    } catch (error: unknown) {
      const fetchError = asError(error);

      logger.warn('Failed to fetch bookmark metadata', {
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

  private resolveUrl(value: string, baseUrl: string): string {
    return new URL(value, baseUrl).toString();
  }

  private resolveFaviconUrl(value: string | undefined, pageUrl: string): string | undefined {
    if (!value) return undefined;

    const origin = new URL(pageUrl).origin;
    return new URL(value, `${origin}/`).toString();
  }

  private async getWithSafeRedirects(initialUrl: URL) {
    let currentUrl = initialUrl;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await axios.get(currentUrl.toString(), {
        timeout: 60000,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        beforeRedirect: (options: RedirectOptions) => this.validateRedirectOptions(options),
        headers: {
          'User-Agent': 'Notion2WordPress link preview fetcher',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.status < 300 || response.status >= 400) return response;

      const location = response.headers?.location;
      if (!location) throw new Error('Redirect response missing Location header');
      if (redirectCount === MAX_REDIRECTS) throw new Error('Too many redirects');

      currentUrl = await this.validateFetchableUrl(new URL(String(location), currentUrl).toString());
    }

    throw new Error('Too many redirects');
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
      const addresses = await lookup(hostname, { all: true, verbatim: false });
      for (const { address } of addresses) {
        if (this.isBlockedIpAddress(address)) throw new Error(`Blocked internal address: ${address}`);
      }
    }

    return parsedUrl;
  }

  private validateUrlParts(parsedUrl: URL): void {
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
    }

    const hostname = this.normalizeHostname(parsedUrl.hostname);
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new Error(`Blocked local hostname: ${hostname}`);
    }

    if (this.isBlockedIpAddress(hostname)) throw new Error(`Blocked internal address: ${hostname}`);
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

export const bookmarkMetadataFetcher: BookmarkMetadataFetcher = new CheerioBookmarkMetadataFetcher();
