import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGetMock, retryWithBackoffMock } = vi.hoisted(() => ({
  axiosGetMock: vi.fn(),
  retryWithBackoffMock: vi.fn(async (fn: () => Promise<unknown>) => await fn()),
}));

vi.mock('axios', () => ({
  default: {
    get: axiosGetMock,
  },
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
    retryWithBackoffMock.mockImplementation(async (fn: () => Promise<unknown>) => await fn());
  });

  it('extracts Open Graph metadata and resolves relative favicon URLs', async () => {
    axiosGetMock.mockResolvedValue({
      data: `<!doctype html>
        <html>
          <head>
            <meta property="og:title" content="OG Title">
            <meta property="og:description" content="OG Description">
            <link rel="icon" href="/favicon.ico">
          </head>
        </html>`,
    });

    const fetcher = await loadFetcher();
    const metadata = await fetcher.fetchMetadata('https://example.com/post');

    expect(metadata).toMatchObject({
      url: 'https://example.com/post',
      title: 'OG Title',
      description: 'OG Description',
      featuredImage: 'https://example.com/favicon.ico',
    });
    expect(metadata.fetchedAt).toEqual(expect.any(String));
    expect(axiosGetMock).toHaveBeenCalledWith(
      'https://example.com/post',
      expect.objectContaining({
        timeout: 60000,
        maxRedirects: 5,
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Notion2WordPress'),
          Accept: expect.stringContaining('text/html'),
        }),
      })
    );
  });

  it('uses title and og:image when available', async () => {
    axiosGetMock.mockResolvedValue({
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
});
