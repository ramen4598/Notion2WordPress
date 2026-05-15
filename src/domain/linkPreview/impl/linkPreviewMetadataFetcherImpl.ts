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

type LookupCallback = (error: Error | null, address?: string | LookupAddress[], family?: number) => void;

type ResponseHeaders = Record<string, unknown>;

/**
 * Best-effort metadata fetcher for bookmark cards.
 *
 * The public contract is simple: return useful metadata when possible, and
 * return fallback metadata when a page is slow, invalid, too large, or unsafe.
 */
class LinkPreviewMetadataFetcherImpl implements ILinkPreviewMetadataFetcher {
  private readonly lookupSafeAddress = createSafeLookupFunction();
  private readonly httpAgent = new http.Agent({ lookup: this.lookupSafeAddress });
  private readonly httpsAgent = new https.Agent({ lookup: this.lookupSafeAddress });

  async fetchMetadata(url: string): Promise<LinkPreviewMetadata> {
    const fetchedAt = new Date().toISOString();

    try {
      const safeUrl = await validateFetchableUrl(url);
      const { html, finalUrl } = await this.fetchHtmlWithPolicy(safeUrl);
      const metadata = extractMetadataFromHtml({ html, originalUrl: url, finalUrl, fetchedAt });

      logger.debug('linkPreviewMetadataFetcher - Fetched metadata', {
        url,
        title: metadata.title,
      });

      return metadata;
    } catch (error: unknown) {
      const fetchError = asError(error);

      logger.warn('Failed to fetch link preview metadata', {
        url,
        error: fetchError.message,
      });

      return createFallbackMetadata(url, fetchedAt, fetchError.message);
    }
  }

  private async fetchHtmlWithPolicy(initialUrl: URL): Promise<RedirectResult> {
    return await retryWithBackoff(() => this.fetchHtmlFollowingSafeRedirects(initialUrl), {
      maxAttempts: LINK_PREVIEW_FETCH_MAX_ATTEMPTS,
      initialDelayMs: 0,
      maxDelayMs: 0,
      backoffMultiplier: 1,
    });
  }

  private async fetchHtmlFollowingSafeRedirects(initialUrl: URL): Promise<RedirectResult> {
    let currentUrl = initialUrl;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const response = await this.requestAsStream(currentUrl);

      if (isRedirectStatus(response.status)) {
        destroyResponseStream(response.data);
        currentUrl = await getNextRedirectUrl(currentUrl, response.headers ?? {}, redirectCount);
        continue;
      }

      try {
        validateHtmlResponseHeaders(response.headers ?? {});
      } catch (error) {
        destroyResponseStream(response.data);
        throw error;
      }

      return {
        finalUrl: currentUrl,
        html: await readLimitedResponseBody(response.data),
      };
    }

    throw new LinkPreviewException('Too many redirects');
  }

  private async requestAsStream(url: URL) {
    return await axios.get(url.toString(), {
      timeout: LINK_PREVIEW_FETCH_TIMEOUT_MS,
      maxRedirects: 0,
      proxy: false,
      responseType: 'stream',
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: (status) => status >= 200 && status < 400,
      beforeRedirect: validateRedirectOptions,
      headers: {
        'User-Agent': 'Notion2WordPress link preview fetcher',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
  }
}

function createFallbackMetadata(url: string, fetchedAt: string, error: string): LinkPreviewMetadata {
  return {
    url,
    title: url,
    description: undefined,
    featuredImage: undefined,
    fetchedAt,
    error,
  };
}

function extractMetadataFromHtml({
  html,
  originalUrl,
  finalUrl,
  fetchedAt,
}: {
  html: string;
  originalUrl: string;
  finalUrl: URL;
  fetchedAt: string;
}): LinkPreviewMetadata {
  const $ = cheerio.load(html);
  const assetBaseUrl = getAssetBaseUrl($, finalUrl);
  const title = getMetaContent($, 'property', 'og:title') || $('title').first().text().trim() || originalUrl;
  const description = getMetaContent($, 'property', 'og:description') || undefined;
  const ogImage = getMetaContent($, 'property', 'og:image');
  const favicon = ogImage ? undefined : getFaviconUrl($);

  return {
    url: originalUrl,
    title,
    description,
    featuredImage: ogImage ? resolveUrl(ogImage, assetBaseUrl) : resolveOptionalUrl(favicon, assetBaseUrl),
    fetchedAt,
  };
}

function getMetaContent($: cheerio.CheerioAPI, attribute: string, value: string): string | undefined {
  return $(`meta[${attribute}="${value}"]`).attr('content')?.trim() || undefined;
}

function getFaviconUrl($: cheerio.CheerioAPI): string | undefined {
  return $('link[rel~="icon"]').first().attr('href')?.trim() || undefined;
}

function getAssetBaseUrl($: cheerio.CheerioAPI, finalUrl: URL): string {
  const baseHref = $('base[href]').first().attr('href')?.trim();
  if (!baseHref) return finalUrl.toString();

  try {
    return new URL(baseHref, finalUrl).toString();
  } catch {
    return finalUrl.toString();
  }
}

function resolveUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

function resolveOptionalUrl(value: string | undefined, baseUrl: string): string | undefined {
  return value ? resolveUrl(value, baseUrl) : undefined;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

async function getNextRedirectUrl(currentUrl: URL, headers: ResponseHeaders, redirectCount: number): Promise<URL> {
  const location = headers.location;
  if (!location) throw new LinkPreviewException('Redirect response missing Location header');
  if (redirectCount === MAX_REDIRECTS) throw new LinkPreviewException('Too many redirects');

  const nextUrl = new URL(String(location), currentUrl);
  return await validateFetchableUrl(nextUrl.toString());
}

function validateHtmlResponseHeaders(headers: ResponseHeaders): void {
  const contentType = getContentType(headers);
  if (contentType && !HTML_CONTENT_TYPES.has(contentType)) {
    throw new LinkPreviewException(`Unsupported content-type for link preview: ${contentType}`);
  }

  const contentLength = Number(headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > LINK_PREVIEW_MAX_BODY_BYTES) {
    throw new LinkPreviewException(`Link preview content-length exceeds limit: ${contentLength} bytes`);
  }
}

function getContentType(headers: ResponseHeaders): string {
  return String(headers['content-type'] ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

async function readLimitedResponseBody(stream: unknown): Promise<string> {
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

function destroyResponseStream(stream: unknown): void {
  if (stream instanceof Readable) stream.destroy();
}

function validateRedirectOptions(options: RedirectOptions): void {
  const redirectUrl = options.href ? new URL(options.href) : buildRedirectUrlFromOptions(options);
  validateUrlParts(redirectUrl);
}

function buildRedirectUrlFromOptions(options: RedirectOptions): URL {
  const redirectHost = options.hostname
    ? `${options.hostname}${options.port ? `:${options.port}` : ''}`
    : options.host ?? '';

  return new URL(`${options.protocol ?? 'https:'}//${redirectHost}${options.path ?? '/'}`);
}

async function validateFetchableUrl(value: string): Promise<URL> {
  const parsedUrl = new URL(value);
  validateUrlParts(parsedUrl);
  await rejectBlockedDnsTargets(parsedUrl);

  return parsedUrl;
}

async function rejectBlockedDnsTargets(parsedUrl: URL): Promise<void> {
  const hostname = normalizeHostname(parsedUrl.hostname);
  if (isIP(hostname) !== 0) return;

  const addresses = await dnsLookup(hostname, { all: true, verbatim: false });
  rejectBlockedAddresses(addresses);
}

function createSafeLookupFunction(): SafeLookupFunction {
  return (hostname, options, callback) => {
    const lookupOptions = typeof options === 'function' ? {} : options;
    const done = typeof options === 'function' ? options : callback;
    if (!done) throw new LinkPreviewException('Missing DNS lookup callback');

    const allLookupOptions = { ...lookupOptions, all: true as const, verbatim: false };
    const requestedAll = typeof lookupOptions === 'object' && 'all' in lookupOptions && lookupOptions.all === true;

    void dnsLookup(hostname, allLookupOptions)
      .then((addresses) => {
        rejectBlockedAddresses(addresses);
        callLookupCallback(done as LookupCallback, addresses, requestedAll);
      })
      .catch((error: Error) => {
        (done as LookupCallback)(error);
      });
  };
}

function rejectBlockedAddresses(addresses: LookupAddress[]): void {
  for (const { address } of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new LinkPreviewException(`Blocked internal address: ${address}`);
    }
  }
}

function callLookupCallback(done: LookupCallback, addresses: LookupAddress[], requestedAll: boolean): void {
  if (requestedAll) {
    done(null, addresses);
    return;
  }

  const [firstAddress] = addresses;
  done(null, firstAddress.address, firstAddress.family);
}

// Validates URL protocol, hostname, and IP address to ensure it's safe to fetch for link preview purposes.
function validateUrlParts(parsedUrl: URL): void {
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new LinkPreviewException(`Unsupported URL protocol: ${parsedUrl.protocol}`);
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new LinkPreviewException(`Blocked local hostname: ${hostname}`);
  }

  if (isBlockedIpAddress(hostname)) {
    throw new LinkPreviewException(`Blocked internal address: ${hostname}`);
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isBlockedIpAddress(address: string): boolean {
  const normalizedAddress = normalizeHostname(address);
  const ipVersion = isIP(normalizedAddress);
  if (ipVersion === 4) return isBlockedIpv4Address(normalizedAddress);
  if (ipVersion === 6) return isBlockedIpv6Address(normalizedAddress);
  return false;
}

function isBlockedIpv4Address(address: string): boolean {
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

function isBlockedIpv6Address(address: string): boolean {
  const normalizedAddress = address.toLowerCase().split('%')[0];
  const mappedIpv4 = normalizedAddress.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isBlockedIpv4Address(mappedIpv4[1]);

  const mappedIpv4Hex = normalizedAddress.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedIpv4Hex) return isBlockedMappedIpv4HexAddress(mappedIpv4Hex[1], mappedIpv4Hex[2]);
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

function isBlockedMappedIpv4HexAddress(high: string, low: string): boolean {
  const highBits = Number.parseInt(high, 16);
  const lowBits = Number.parseInt(low, 16);
  const ipv4Address = [highBits >> 8, highBits & 0xff, lowBits >> 8, lowBits & 0xff].join('.');

  return isBlockedIpv4Address(ipv4Address);
}

export const linkPreviewMetadataFetcher: ILinkPreviewMetadataFetcher = new LinkPreviewMetadataFetcherImpl();
