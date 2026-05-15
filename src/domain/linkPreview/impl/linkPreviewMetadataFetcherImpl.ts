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

/**
 * Best-effort metadata fetcher for bookmark cards.
 *
 * Link previews should never block the whole Notion sync, so public failures are
 * converted into fallback metadata. The stricter checks below are mainly about
 * keeping the fetch small and preventing user-provided URLs from reaching local
 * or private network addresses.
 */
class LinkPreviewMetadataFetcherImpl implements ILinkPreviewMetadataFetcher {
  /**
   * Custom DNS lookup used by axios' agents.
   *
   * Validating the original URL is not enough because DNS can resolve a public
   * hostname to a private IP. This lookup rejects every resolved address before
   * the socket is opened.
   */
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

  /**
   * Fetches the HTML for a URL and extracts the small set of fields needed for
   * a bookmark card: title, description, and image.
   *
   * Any error becomes fallback metadata. A broken link preview should render a
   * plain bookmark, not fail the whole WordPress sync.
   */
  async fetchMetadata(url: string): Promise<LinkPreviewMetadata> {
    const fetchedAt = new Date().toISOString();

    try {
      // Step 1: reject unsupported protocols and private/internal destinations.
      const safeUrl = await this.validateFetchableUrl(url);
      // Step 2: fetch HTML with our own redirect, timeout, and size limits.
      const { html, finalUrl } = await retryWithBackoff(() => this.getWithSafeRedirects(safeUrl), {
        maxAttempts: LINK_PREVIEW_FETCH_MAX_ATTEMPTS,
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoffMultiplier: 1,
      });

      // Step 3: parse only the fetched HTML string. Binary or huge responses
      // should already have been rejected before this point.
      const $ = cheerio.load(html);
      // Relative assets must be resolved against the final page URL after redirects.
      // If the page declares a <base href>, browsers use that as the asset base too.
      const assetBaseUrl = this.getAssetBaseUrl($, finalUrl);
      // Prefer Open Graph title because it is usually the title intended for cards.
      const title = this.getMetaContent($, 'property', 'og:title') || $('title').first().text().trim() || url;
      const description = this.getMetaContent($, 'property', 'og:description') || undefined;
      const ogImage = this.getMetaContent($, 'property', 'og:image');
      // Use favicon only when og:image is missing. og:image is the richer card image.
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
        // Fallback metadata intentionally uses the URL as the title so a card can
        // still be rendered even when the remote page cannot be inspected.
        title: url,
        description: undefined,
        featuredImage: undefined,
        fetchedAt,
        error: fetchError.message,
      };
    }
  }

  /**
   * Reads a meta tag like:
   * <meta property="og:title" content="...">
   */
  private getMetaContent($: cheerio.CheerioAPI, attribute: string, value: string): string | undefined {
    return $(`meta[${attribute}="${value}"]`).attr('content')?.trim() || undefined;
  }

  /**
   * Finds the first favicon candidate.
   *
   * The ~= selector matches values such as "icon" and "shortcut icon".
   */
  private getFaviconUrl($: cheerio.CheerioAPI): string | undefined {
    return $('link[rel~="icon"]').first().attr('href')?.trim() || undefined;
  }

  /**
   * Decides which URL should be used as the base for relative image/favicon URLs.
   *
   * Example:
   * - original URL: https://short.ly/a
   * - final URL after redirect: https://example.com/post
   * - og:image: /cover.png
   *
   * The image must become https://example.com/cover.png, not
   * https://short.ly/cover.png.
   */
  private getAssetBaseUrl($: cheerio.CheerioAPI, finalUrl: URL): string {
    const baseHref = $('base[href]').first().attr('href')?.trim();
    // Without <base href>, the browser resolves relative assets from the page URL.
    if (!baseHref) return finalUrl.toString();

    try {
      // <base href> itself may also be relative, so resolve it from finalUrl first.
      return new URL(baseHref, finalUrl).toString();
    } catch {
      // Bad <base href> should not break metadata fetching. Fall back to finalUrl.
      return finalUrl.toString();
    }
  }

  /**
   * Resolves an absolute or relative URL using the chosen page base.
   */
  private resolveUrl(value: string, baseUrl: string): string {
    return new URL(value, baseUrl).toString();
  }

  /**
   * Favicon is optional, so missing favicon stays undefined.
   */
  private resolveFaviconUrl(value: string | undefined, baseUrl: string): string | undefined {
    if (!value) return undefined;
    return new URL(value, baseUrl).toString();
  }

  /**
   * Fetches a URL while manually handling redirects.
   *
   * The key point is that every redirect target is validated before following it.
   * That prevents a public URL from redirecting to localhost or a private IP.
   */
  private async getWithSafeRedirects(initialUrl: URL): Promise<RedirectResult> {
    let currentUrl = initialUrl;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      // axios' automatic redirects are disabled so every Location target can be
      // validated before the next request is made.
      const response = await axios.get(currentUrl.toString(), {
        // Link previews are best-effort. Slow pages should not hold the sync.
        timeout: LINK_PREVIEW_FETCH_TIMEOUT_MS,
        // We handle redirects below so we can validate each Location value.
        maxRedirects: 0,
        // Do not use process/system proxy settings for user-provided URLs.
        proxy: false,
        // Stream first, then read with a byte limit. Do not let axios buffer all body.
        responseType: 'stream',
        // These agents run lookupSafeAddress before opening sockets.
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
        // Accept normal success and redirect responses. Other statuses fall back.
        validateStatus: (status) => status >= 200 && status < 400,
        beforeRedirect: (options: RedirectOptions) => this.validateRedirectOptions(options),
        headers: {
          'User-Agent': 'Notion2WordPress link preview fetcher',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        // Redirect bodies are not useful for metadata, so release the stream
        // before following the next URL.
        this.destroyResponseStream(response.data);

        const location = response.headers?.location;
        if (!location) throw new LinkPreviewException('Redirect response missing Location header');
        if (redirectCount === MAX_REDIRECTS) throw new LinkPreviewException('Too many redirects');

        // Location can be absolute or relative. new URL(location, currentUrl)
        // handles both forms.
        currentUrl = await this.validateFetchableUrl(new URL(String(location), currentUrl).toString());
        continue;
      }

      try {
        this.validateHtmlResponseHeaders(response.headers ?? {});
      } catch (error) {
        // Header validation can fail before the body is consumed. Destroy the
        // stream explicitly so the socket is not kept alive unnecessarily.
        this.destroyResponseStream(response.data);
        throw error;
      }

      return {
        // currentUrl is the final URL after redirects. Callers use it to resolve
        // relative og:image and favicon values.
        finalUrl: currentUrl,
        html: await this.readLimitedResponseBody(response.data),
      };
    }

    throw new LinkPreviewException('Too many redirects');
  }

  private validateHtmlResponseHeaders(headers: Record<string, unknown>): void {
    // Only HTML-like documents are parsed by cheerio. This avoids buffering
    // images, archives, videos, or other binary responses into memory.
    const contentType = String(headers['content-type'] ?? '')
      // content-type often includes a charset, e.g. "text/html; charset=utf-8".
      // We only compare the MIME type part.
      .split(';')[0]
      .trim()
      .toLowerCase();
    // Empty content-type is allowed because some servers omit it for HTML pages.
    if (contentType && !HTML_CONTENT_TYPES.has(contentType)) {
      throw new LinkPreviewException(`Unsupported content-type for link preview: ${contentType}`);
    }

    const contentLength = Number(headers['content-length']);
    // If the server tells us up front that the body is too large, stop before
    // reading any bytes.
    if (Number.isFinite(contentLength) && contentLength > LINK_PREVIEW_MAX_BODY_BYTES) {
      throw new LinkPreviewException(`Link preview content-length exceeds limit: ${contentLength} bytes`);
    }
  }

  /**
   * Reads the response stream while enforcing our own byte limit.
   *
   * This protects the process when content-length is missing, wrong, or smaller
   * than the actual body.
   */
  private async readLimitedResponseBody(stream: unknown): Promise<string> {
    if (!(stream instanceof Readable)) {
      throw new LinkPreviewException('Link preview response body is not readable');
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    // content-length is optional and sometimes wrong, so the actual stream is
    // capped as it is read.
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      totalBytes += buffer.byteLength;

      if (totalBytes > LINK_PREVIEW_MAX_BODY_BYTES) {
        // Stop the download immediately once it is too large.
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

  /**
   * Validates a redirect target represented by axios redirect options.
   *
   * The current request path uses manual redirects, but this keeps the same
   * safety rule in place if axios redirect handling is enabled later.
   */
  private validateRedirectOptions(options: RedirectOptions): void {
    // Kept for axios compatibility if a future request path enables redirects.
    // The manual redirect loop above is still the authoritative validation path.
    const redirectHost = options.hostname
      ? `${options.hostname}${options.port ? `:${options.port}` : ''}`
      : options.host ?? '';
    const redirectUrl = options.href
      ? new URL(options.href)
      : new URL(`${options.protocol ?? 'https:'}//${redirectHost}${options.path ?? '/'}`);

    this.validateUrlParts(redirectUrl);
  }

  /**
   * Parses and validates a user-provided URL before any request is made.
   */
  private async validateFetchableUrl(value: string): Promise<URL> {
    const parsedUrl = new URL(value);
    this.validateUrlParts(parsedUrl);

    const hostname = this.normalizeHostname(parsedUrl.hostname);
    // isIP() returns 0 for normal hostnames. Hostnames need DNS lookup so we can
    // inspect the real IP addresses they point to.
    if (isIP(hostname) === 0) {
      // Resolve hostnames up front to reject private/internal destinations before
      // the HTTP client attempts a connection.
      const addresses = await dnsLookup(hostname, { all: true, verbatim: false });
      for (const { address } of addresses) {
        if (this.isBlockedIpAddress(address)) {
          throw new LinkPreviewException(`Blocked internal address: ${address}`);
        }
      }
    }

    return parsedUrl;
  }

  /**
   * Checks URL parts that do not need DNS.
   */
  private validateUrlParts(parsedUrl: URL): void {
    // Link preview fetching is intentionally limited to normal web pages.
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new LinkPreviewException(`Unsupported URL protocol: ${parsedUrl.protocol}`);
    }

    const hostname = this.normalizeHostname(parsedUrl.hostname);
    // localhost names are blocked even before DNS lookup.
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new LinkPreviewException(`Blocked local hostname: ${hostname}`);
    }

    // Literal IP URLs, such as http://127.0.0.1, can be checked immediately.
    if (this.isBlockedIpAddress(hostname)) {
      throw new LinkPreviewException(`Blocked internal address: ${hostname}`);
    }
  }

  /**
   * Normalizes hostnames/IPs so checks do not miss common formatting variants:
   * - [::1] becomes ::1
   * - Example.COM becomes example.com
   * - example.com. becomes example.com
   */
  private normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  }

  /**
   * Returns true when an IP address is not a public internet destination.
   */
  private isBlockedIpAddress(address: string): boolean {
    const normalizedAddress = this.normalizeHostname(address);
    const ipVersion = isIP(normalizedAddress);
    // node:net.isIP returns 4 for IPv4, 6 for IPv6, and 0 for non-IP strings.
    if (ipVersion === 4) return this.isBlockedIpv4Address(normalizedAddress);
    if (ipVersion === 6) return this.isBlockedIpv6Address(normalizedAddress);
    return false;
  }

  /**
   * Blocks IPv4 ranges that should never be fetched for a public link preview.
   */
  private isBlockedIpv4Address(address: string): boolean {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;

    // Block local, private, link-local, documentation, multicast, and other
    // non-public IPv4 ranges. The fetcher only needs public web content.
    return (
      // 0.0.0.0/8: "this network"
      first === 0 ||
      // 10.0.0.0/8: private network
      first === 10 ||
      // 127.0.0.0/8: loopback
      first === 127 ||
      // 100.64.0.0/10: carrier-grade NAT
      (first === 100 && second >= 64 && second <= 127) ||
      // 169.254.0.0/16: link-local
      (first === 169 && second === 254) ||
      // 172.16.0.0/12: private network
      (first === 172 && second >= 16 && second <= 31) ||
      // 192.0.0.0/24 and 192.168.0.0/16: special/private ranges
      (first === 192 && (second === 0 || second === 168)) ||
      // 198.18.0.0/15 and 198.51.100.0/24: benchmarking/documentation ranges
      (first === 198 && (second === 18 || second === 19 || (second === 51 && octets[2] === 100))) ||
      // 203.0.113.0/24: documentation range
      (first === 203 && second === 0 && octets[2] === 113) ||
      // 224.0.0.0/4 and above: multicast/reserved
      first >= 224
    );
  }

  /**
   * Blocks IPv6 ranges that should never be fetched for a public link preview.
   */
  private isBlockedIpv6Address(address: string): boolean {
    const normalizedAddress = address.toLowerCase().split('%')[0];
    // IPv4-mapped IPv6 can hide an IPv4 address inside IPv6 syntax.
    // Example: ::ffff:127.0.0.1
    const mappedIpv4 = normalizedAddress.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) return this.isBlockedIpv4Address(mappedIpv4[1]);

    // Same idea, but the embedded IPv4 is written as two hex groups.
    // Example: ::ffff:7f00:1 means 127.0.0.1
    const mappedIpv4Hex = normalizedAddress.match(/^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedIpv4Hex) return this.isBlockedMappedIpv4HexAddress(mappedIpv4Hex[1], mappedIpv4Hex[2]);
    // :: is unspecified, ::1 is loopback.
    if (normalizedAddress === '::' || normalizedAddress === '::1') return true;

    const hextets = normalizedAddress.split(':');
    // The first two hextets are enough to identify the blocked IPv6 ranges below.
    const first = Number.parseInt(hextets[0] || '0', 16);
    const second = Number.parseInt(hextets[1] || '0', 16);

    // Block unique-local, link-local, multicast, loopback/unspecified, and
    // documentation IPv6 ranges.
    return (
      // fc00::/7: unique-local address
      (first & 0xfe00) === 0xfc00 ||
      // fe80::/10: link-local address
      (first & 0xffc0) === 0xfe80 ||
      // ff00::/8: multicast
      (first & 0xff00) === 0xff00 ||
      // 2001:db8::/32: documentation range
      (first === 0x2001 && second === 0x0db8)
    );
  }

  /**
   * Converts an IPv4-mapped IPv6 hex form into normal IPv4, then reuses the IPv4
   * blocking rules.
   */
  private isBlockedMappedIpv4HexAddress(high: string, low: string): boolean {
    const highBits = Number.parseInt(high, 16);
    const lowBits = Number.parseInt(low, 16);
    // Two IPv6 hextets hold four IPv4 bytes:
    // high=7f00, low=0001 -> 127.0.0.1
    const ipv4Address = [highBits >> 8, highBits & 0xff, lowBits >> 8, lowBits & 0xff].join('.');

    return this.isBlockedIpv4Address(ipv4Address);
  }
}

export const linkPreviewMetadataFetcher: ILinkPreviewMetadataFetcher = new LinkPreviewMetadataFetcherImpl();
