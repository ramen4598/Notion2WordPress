import { beforeEach, describe, expect, it, vi } from 'vitest';

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

async function loadFetcher() {
  vi.resetModules();
  const mod = await import('../../../../src/domain/linkPreview/impl/bookmarkMetadataFetcher.js');
  return mod.bookmarkMetadataFetcher;
}

describe('bookmarkMetadataFetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    retryWithBackoffMock.mockImplementation(async (fn: () => Promise<unknown>) => await fn());
  });

  it('extracts Open Graph metadata and resolves relative favicon URLs against the target origin', async () => {
    axiosGetMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: `<!doctype html>
        <html>
          <head>
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG Description">
            <link rel="icon" href="favicon.ico">
          </head>
        </html>`,
    });

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post/page');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post/page',
      title: 'OG Title',
      description: 'OG Description',
      featuredImage: 'https://example.com/favicon.ico',
    });
    expect(metadata.fetchedAt).toEqual(expect.any(String));
    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://example.com/post/page',
      expect.objectContaining({
        timeout: 60000,
        maxRedirects: 0,
        httpAgent: expect.any(Object),
        httpsAgent: expect.any(Object),
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Notion2WordPress'),
          Accept: expect.stringContaining('text/html'),
        }),
      })
    );
  });

  it('uses title and og:image when available', async () => {
    axiosGetMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: `<!doctype html>
        <html>
          <head>
            <title>HTML Title</title>
            <meta property="og:image" content="https://cdn.example.com/cover.png">
          </head>
        </html>`,
    });

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      title: 'HTML Title',
      featuredImage: 'https://cdn.example.com/cover.png',
      description: undefined,
    });
  });

  it('returns URL-only fallback metadata when fetching fails', async () => {
    axiosGetMock.mockRejectedValue(new Error('network failed'));

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post',
      title: 'https://example.com/post',
      description: undefined,
      featuredImage: undefined,
      error: 'network failed',
    });
    expect(metadata.fetchedAt).toEqual(expect.any(String));
  });

  it('returns URL-only fallback metadata without fetching unsafe URL schemes', async () => {
    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('javascript:alert(1)');

    expect(metadata).toMatchObject({
      url: 'javascript:alert(1)',
      title: 'javascript:alert(1)',
      description: undefined,
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Unsupported URL protocol');
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns URL-only fallback metadata without fetching localhost URLs', async () => {
    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('http://localhost:3000/page');

    expect(metadata).toMatchObject({
      url: 'http://localhost:3000/page',
      title: 'http://localhost:3000/page',
      description: undefined,
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Blocked local hostname');
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns URL-only fallback metadata without fetching hostnames that resolve to loopback addresses', async () => {
    dnsLookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://internal.example.com/page');

    expect(metadata).toMatchObject({
      url: 'https://internal.example.com/page',
      title: 'https://internal.example.com/page',
      description: undefined,
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Blocked internal address');
    expect(dnsLookupMock).toHaveBeenCalledWith('internal.example.com', { all: true, verbatim: false });
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns URL-only fallback metadata without fetching IPv4-mapped IPv6 loopback literals', async () => {
    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('http://[::ffff:127.0.0.1]/');

    expect(metadata).toMatchObject({
      url: 'http://[::ffff:127.0.0.1]/',
      title: 'http://[::ffff:127.0.0.1]/',
      description: undefined,
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Blocked internal address');
    expect(axiosGetMock).not.toHaveBeenCalled();
  });

  it('returns URL-only fallback metadata without following manual redirects to localhost targets', async () => {
    axiosGetMock.mockResolvedValue({
      status: 302,
      headers: { location: 'http://localhost/private' },
      data: '',
    });

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post',
      title: 'https://example.com/post',
      description: undefined,
      featuredImage: undefined,
    });
    expect(metadata.error).toContain('Blocked local hostname');
    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://example.com/post',
      expect.objectContaining({ maxRedirects: 0 })
    );
  });

  it('blocks unsafe redirect targets before following redirects', async () => {
    axiosGetMock.mockResolvedValue({ status: 200, headers: {}, data: '<html></html>' });

    const fetcher = await loadFetcher();
    await fetcher.fetchMetadata('https://example.com/post');

    const options = axiosGetMock.mock.calls[0]?.[1];
    expect(options?.beforeRedirect).toEqual(expect.any(Function));

    expect(() => options.beforeRedirect({ protocol: 'http:', hostname: 'localhost', path: '/redirected' })).toThrow(
      'Blocked local hostname'
    );
  });

  it('rejects unsafe addresses resolved by the axios agent lookup at connection time', async () => {
    axiosGetMock.mockResolvedValue({ status: 200, headers: {}, data: '<html></html>' });

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
  });
});
