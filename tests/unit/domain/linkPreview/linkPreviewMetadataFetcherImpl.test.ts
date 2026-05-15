import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BYTE_CAP = 512 * 1024;

const { axiosGetMock, dnsLookupMock, retryWithBackoffMock } = vi.hoisted(() => ({
  axiosGetMock: vi.fn(),
  dnsLookupMock: vi.fn(),
  retryWithBackoffMock: vi.fn(async (fn: () => Promise<unknown>) => await fn()),
}));

vi.mock('axios', () => ({
  default: {
    get: axiosGetMock,
  },
}));

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}));

vi.mock('../../../../src/lib/retry.js', () => ({
  retryWithBackoff: retryWithBackoffMock,
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

function createStream(chunks: Array<string | Buffer>): Readable {
  return Readable.from(chunks.map((chunk) => (typeof chunk === 'string' ? Buffer.from(chunk) : chunk)));
}

function createResponse({
  status = 200,
  headers = {},
  body = '',
}: {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Array<string | Buffer> | Readable;
}) {
  return {
    status,
    headers,
    data:
      typeof body === 'string'
        ? createStream([body])
        : Array.isArray(body)
          ? createStream(body)
          : body,
  };
}

class TrackingReadable extends Readable {
  public readCalls = 0;

  override _read(): void {
    this.readCalls += 1;
    this.push(Buffer.from('ignored'));
    this.push(null);
  }
}

async function loadFetcher() {
  vi.resetModules();
  const mod = await import('../../../../src/domain/linkPreview/impl/linkPreviewMetadataFetcherImpl.js');
  return mod.linkPreviewMetadataFetcher;
}

describe('linkPreviewMetadataFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    retryWithBackoffMock.mockImplementation(async (fn: () => Promise<unknown>) => await fn());
  });

  it('uses the link preview fetch policy with a single immediate attempt and streamed HTML responses', async () => {
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<html><head><title>Policy Test</title></head></html>',
      })
    );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post',
      title: 'Policy Test',
    });
    expect(retryWithBackoffMock).toHaveBeenCalledTimes(1);
    expect(retryWithBackoffMock).toHaveBeenCalledWith(expect.any(Function), {
      maxAttempts: 1,
      initialDelayMs: 0,
      maxDelayMs: 0,
      backoffMultiplier: 1,
    });
    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://example.com/post',
      expect.objectContaining({
        timeout: 5000,
        responseType: 'stream',
        maxRedirects: 0,
        proxy: false,
      })
    );
  });

  it('returns fallback metadata for non-html responses', async () => {
    const body = createStream([Buffer.from([0x89, 0x50, 0x4e, 0x47])]);
    const destroySpy = vi.spyOn(body, 'destroy');
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: { 'content-type': 'image/png' },
        body,
      })
    );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/image');

    expect(metadata).toMatchObject({
      url: 'https://example.com/image',
      title: 'https://example.com/image',
      description: undefined,
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Unsupported content-type');
    expect(destroySpy).toHaveBeenCalled();
  });

  it('returns fallback metadata without reading bodies that exceed the content-length cap', async () => {
    const body = new TrackingReadable();
    const destroySpy = vi.spyOn(body, 'destroy');
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(BYTE_CAP + 1),
        },
        body,
      })
    );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/too-large');

    expect(metadata).toMatchObject({
      url: 'https://example.com/too-large',
      title: 'https://example.com/too-large',
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('content-length');
    expect(body.readCalls).toBe(0);
    expect(destroySpy).toHaveBeenCalled();
  });

  it('aborts streamed bodies that exceed the byte cap while reading', async () => {
    const body = createStream([Buffer.alloc(BYTE_CAP - 16, 'a'), Buffer.alloc(32, 'b')]);
    const destroySpy = vi.spyOn(body, 'destroy');
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body,
      })
    );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/stream-too-large');

    expect(metadata).toMatchObject({
      url: 'https://example.com/stream-too-large',
      title: 'https://example.com/stream-too-large',
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Response body exceeded');
    expect(destroySpy).toHaveBeenCalled();
  });

  it('resolves relative og:image values against the final redirected URL', async () => {
    axiosGetMock
      .mockResolvedValueOnce(
        createResponse({
          status: 302,
          headers: { location: '/articles/final' },
        })
      )
      .mockResolvedValueOnce(
        createResponse({
          headers: { 'content-type': 'text/html; charset=utf-8' },
          body: `<!doctype html>
            <html>
              <head>
                <meta property="og:title" content="Redirected Title">
                <meta property="og:image" content="../images/cover.png">
              </head>
            </html>`,
        })
      );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post',
      title: 'Redirected Title',
      featuredImage: 'https://example.com/images/cover.png',
    });
    expect(axiosGetMock.mock.calls[1]?.[0]).toBe('https://example.com/articles/final');
  });

  it('resolves relative favicon URLs against the document base href when present', async () => {
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: `<!doctype html>
          <html>
            <head>
              <title>Base Href Title</title>
              <base href="https://assets.example.com/static/">
              <link rel="icon" href="icons/favicon.ico">
            </head>
          </html>`,
      })
    );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post/page');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post/page',
      title: 'Base Href Title',
      featuredImage: 'https://assets.example.com/static/icons/favicon.ico',
    });
  });

  it('falls back to favicon when og:image cannot be resolved', async () => {
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: `<!doctype html>
          <html>
            <head>
              <meta property="og:title" content="Image Fallback Title">
              <meta property="og:description" content="Keep this description">
              <meta property="og:image" content="https://[broken-url">
              <link rel="icon" href="/favicon.ico">
            </head>
          </html>`,
      })
    );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post',
      title: 'Image Fallback Title',
      description: 'Keep this description',
      featuredImage: 'https://example.com/favicon.ico',
    });
    expect(metadata.error).toBeUndefined();
  });

  it('returns fallback metadata when axios times out', async () => {
    axiosGetMock.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/timeout');

    expect(metadata).toMatchObject({
      url: 'https://example.com/timeout',
      title: 'https://example.com/timeout',
      featuredImage: undefined,
      error: 'timeout of 5000ms exceeded',
    });
  });

  it('returns fallback metadata for blocked URL protocols without fetching', async () => {
    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('javascript:alert(1)');

    expect(metadata).toMatchObject({
      url: 'javascript:alert(1)',
      title: 'javascript:alert(1)',
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Unsupported URL protocol');
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns fallback metadata for localhost URLs without fetching', async () => {
    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('http://localhost:3000/page');

    expect(metadata).toMatchObject({
      url: 'http://localhost:3000/page',
      title: 'http://localhost:3000/page',
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Blocked local hostname');
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns fallback metadata for hostnames that resolve to loopback addresses', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://internal.example.com/page');

    expect(metadata).toMatchObject({
      url: 'https://internal.example.com/page',
      title: 'https://internal.example.com/page',
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Blocked internal address');
    expect(dnsLookupMock).toHaveBeenCalledWith('internal.example.com', { all: true, verbatim: false });
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns fallback metadata when DNS lookup returns no addresses', async () => {
    dnsLookupMock.mockResolvedValue([]);

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://empty-dns.example.com/page');

    expect(metadata).toMatchObject({
      url: 'https://empty-dns.example.com/page',
      title: 'https://empty-dns.example.com/page',
      featuredImage: undefined,
      error: 'DNS lookup returned no addresses',
    });
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns fallback metadata without following redirects to localhost targets', async () => {
    axiosGetMock.mockResolvedValue(
      createResponse({
        status: 302,
        headers: { location: 'http://localhost/private' },
      })
    );

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post',
      title: 'https://example.com/post',
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Blocked local hostname');
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
  });

  it('blocks unsafe redirect targets before following redirects', async () => {
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<html></html>',
      })
    );

    const fetcher = await loadFetcher();
    await fetcher.fetchMetadata('https://example.com/post');

    const options = axiosGetMock.mock.calls[0]?.[1];
    expect(options?.beforeRedirect).toEqual(expect.any(Function));

    expect(() => options.beforeRedirect({ protocol: 'http:', hostname: 'localhost', path: '/redirected' })).toThrow(
      'Blocked local hostname'
    );
  });

  it('rejects unsafe addresses resolved by the axios agent lookup at connection time', async () => {
    axiosGetMock.mockResolvedValue(
      createResponse({
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: '<html></html>',
      })
    );

    const fetcher = await loadFetcher();
    await fetcher.fetchMetadata('https://example.com/post');

    const options = axiosGetMock.mock.calls[0]?.[1];
    const lookup = options?.httpsAgent?.options?.lookup;
    expect(lookup).toEqual(expect.any(Function));

    await expect(
      new Promise((resolve, reject) => {
        lookup('example.com', { all: false }, (error: Error | null, address: string, family: number) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      })
    ).resolves.toEqual({ address: '93.184.216.34', family: 4 });

    dnsLookupMock.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);

    await expect(
      new Promise((resolve, reject) => {
        lookup('example.com', { all: false }, (error: Error | null, address: string, family: number) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      })
    ).rejects.toThrow('Blocked internal address: 10.0.0.5');

    dnsLookupMock.mockResolvedValueOnce([]);

    await expect(
      new Promise((resolve, reject) => {
        lookup('example.com', { all: false }, (error: Error | null, address: string, family: number) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      })
    ).rejects.toThrow('DNS lookup returned no addresses');
  });
});
