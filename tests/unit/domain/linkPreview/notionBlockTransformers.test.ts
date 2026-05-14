import { beforeEach, describe, expect, it, vi } from 'vitest';

import { registerLinkPreviewTransformers } from '../../../../src/domain/linkPreview/impl/notionBlockTransformers.js';
import { bookmarkMetadataFetcher } from '../../../../src/domain/linkPreview/impl/bookmarkMetadataFetcher.js';
import { renderBookmarkHTML } from '../../../../src/domain/linkPreview/impl/bookmarkTemplate.js';
import { renderYouTubeEmbedHTML } from '../../../../src/domain/linkPreview/impl/youtubeEmbed.js';

vi.mock('../../../../src/domain/linkPreview/impl/bookmarkMetadataFetcher.js', () => ({
  bookmarkMetadataFetcher: {
    fetchMetadata: vi.fn(),
  },
}));

vi.mock('../../../../src/domain/linkPreview/impl/bookmarkTemplate.js', () => ({
  renderBookmarkHTML: vi.fn(),
}));

vi.mock('../../../../src/domain/linkPreview/impl/youtubeEmbed.js', () => ({
  renderYouTubeEmbedHTML: vi.fn(),
}));

type Transformer = (block: unknown) => Promise<string | false>;

class FakeNotionToMarkdown {
  transformers = new Map<string, Transformer>();

  setCustomTransformer(type: string, transformer: Transformer): void {
    this.transformers.set(type, transformer);
  }
}

const fetchMetadataMock = vi.mocked(bookmarkMetadataFetcher.fetchMetadata);
const renderBookmarkHTMLMock = vi.mocked(renderBookmarkHTML);
const renderYouTubeEmbedHTMLMock = vi.mocked(renderYouTubeEmbedHTML);

describe('registerLinkPreviewTransformers', () => {
  let n2m: FakeNotionToMarkdown;

  beforeEach(() => {
    vi.clearAllMocks();
    n2m = new FakeNotionToMarkdown();
    registerLinkPreviewTransformers(n2m as never);
  });

  it('registers only link preview block types', () => {
    expect([...n2m.transformers.keys()]).toEqual(['bookmark', 'link_preview', 'embed', 'video']);
    expect(n2m.transformers.has('paragraph')).toBe(false);
  });

  it('renders bookmark blocks as bookmark cards', async () => {
    fetchMetadataMock.mockResolvedValue({
      url: 'https://example.com/bookmark',
      title: 'Example bookmark',
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });
    renderBookmarkHTMLMock.mockReturnValue('<bookmark-card>Example bookmark</bookmark-card>');

    await expect(
      n2m.transformers.get('bookmark')?.({
        bookmark: { url: 'https://example.com/bookmark' },
      })
    ).resolves.toBe('<bookmark-card>Example bookmark</bookmark-card>');

    expect(fetchMetadataMock).toHaveBeenCalledWith('https://example.com/bookmark');
    expect(renderBookmarkHTMLMock).toHaveBeenCalledWith({
      url: 'https://example.com/bookmark',
      title: 'Example bookmark',
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });
  });

  it('renders link_preview blocks as bookmark cards', async () => {
    fetchMetadataMock.mockResolvedValue({
      url: 'https://example.com/link-preview',
      title: 'Example link preview',
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });
    renderBookmarkHTMLMock.mockReturnValue('<bookmark-card>Example link preview</bookmark-card>');

    await expect(
      n2m.transformers.get('link_preview')?.({
        link_preview: { url: 'https://example.com/link-preview' },
      })
    ).resolves.toBe('<bookmark-card>Example link preview</bookmark-card>');

    expect(fetchMetadataMock).toHaveBeenCalledWith('https://example.com/link-preview');
  });

  it('renders non-YouTube embed blocks as bookmark cards', async () => {
    renderYouTubeEmbedHTMLMock.mockReturnValue(undefined);
    fetchMetadataMock.mockResolvedValue({
      url: 'https://example.com/embed',
      title: 'Example embed',
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });
    renderBookmarkHTMLMock.mockReturnValue('<bookmark-card>Example embed</bookmark-card>');

    await expect(
      n2m.transformers.get('embed')?.({
        embed: {
          url: 'https://example.com/embed',
          caption: [{ plain_text: 'Embedded page' }],
        },
      })
    ).resolves.toBe('<bookmark-card>Example embed</bookmark-card>');

    expect(renderYouTubeEmbedHTMLMock).toHaveBeenCalledWith('https://example.com/embed', 'Embedded page');
    expect(fetchMetadataMock).toHaveBeenCalledWith('https://example.com/embed');
  });

  it('renders YouTube embed blocks as iframes without fetching metadata', async () => {
    renderYouTubeEmbedHTMLMock.mockReturnValue('<iframe></iframe>');

    await expect(
      n2m.transformers.get('embed')?.({
        embed: {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          caption: [{ plain_text: 'Video title' }],
        },
      })
    ).resolves.toBe('<iframe></iframe>');

    expect(renderYouTubeEmbedHTMLMock).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ', 'Video title');
    expect(fetchMetadataMock).not.toHaveBeenCalled();
  });

  it('renders external YouTube video blocks as iframes', async () => {
    renderYouTubeEmbedHTMLMock.mockReturnValue('<iframe></iframe>');

    await expect(
      n2m.transformers.get('video')?.({
        video: {
          type: 'external',
          external: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
          caption: [{ plain_text: 'External video' }],
        },
      })
    ).resolves.toBe('<iframe></iframe>');

    expect(renderYouTubeEmbedHTMLMock).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'External video'
    );
    expect(fetchMetadataMock).not.toHaveBeenCalled();
  });

  it('returns false for blocks without usable URLs', async () => {
    await expect(n2m.transformers.get('bookmark')?.({ bookmark: {} })).resolves.toBe(false);
    await expect(n2m.transformers.get('embed')?.({ embed: { url: '' } })).resolves.toBe(false);
    await expect(n2m.transformers.get('video')?.({ video: {} })).resolves.toBe(false);
  });

  it('returns false for Notion-hosted video file blocks', async () => {
    await expect(
      n2m.transformers.get('video')?.({
        video: {
          type: 'file',
          file: { url: 'https://s3.us-west-2.amazonaws.com/secure.notion-static.com/video.mp4' },
        },
      })
    ).resolves.toBe(false);

    expect(renderYouTubeEmbedHTMLMock).not.toHaveBeenCalled();
    expect(fetchMetadataMock).not.toHaveBeenCalled();
  });

  it('returns a URL-only bookmark card fallback when metadata rendering fails', async () => {
    fetchMetadataMock.mockRejectedValue(new Error('metadata failed'));
    renderBookmarkHTMLMock.mockReturnValue('<bookmark-card>fallback</bookmark-card>');

    await expect(
      n2m.transformers.get('bookmark')?.({
        bookmark: { url: 'https://example.com/fallback' },
      })
    ).resolves.toBe('<bookmark-card>fallback</bookmark-card>');

    expect(renderBookmarkHTMLMock).toHaveBeenCalledWith({
      url: 'https://example.com/fallback',
      title: 'https://example.com/fallback',
      fetchedAt: expect.any(String),
    });
  });

  it('returns a URL-only bookmark card fallback when bookmark template rendering fails', async () => {
    fetchMetadataMock.mockResolvedValue({
      url: 'https://example.com/template-failure',
      title: 'Template failure',
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });
    renderBookmarkHTMLMock.mockImplementation(() => {
      throw new Error('render failed');
    });

    await expect(
      n2m.transformers.get('bookmark')?.({
        bookmark: { url: 'https://example.com/template-failure' },
      })
    ).resolves.toContain('href="https://example.com/template-failure"');
  });

  it('escapes malicious URLs in raw fallback when bookmark template rendering fails', async () => {
    const maliciousUrl = 'https://example.com/"><script>bad</script>';
    fetchMetadataMock.mockResolvedValue({
      url: maliciousUrl,
      title: 'Malicious URL',
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });
    renderBookmarkHTMLMock.mockImplementation(() => {
      throw new Error('render failed');
    });

    const result = await n2m.transformers.get('bookmark')?.({
      bookmark: { url: maliciousUrl },
    });

    expect(result).not.toContain('<script>bad</script>');
    expect(result).not.toContain('href="https://example.com/"><script>');
    expect(result).toContain('href="https://example.com/&quot;&gt;&lt;script&gt;bad&lt;/script&gt;"');
    expect(result).toContain('https://example.com/&quot;&gt;&lt;script&gt;bad&lt;/script&gt;');
  });

  it('returns a URL-only bookmark card fallback when YouTube embed rendering fails', async () => {
    renderYouTubeEmbedHTMLMock.mockImplementation(() => {
      throw new Error('youtube render failed');
    });
    renderBookmarkHTMLMock.mockReturnValue('<bookmark-card>youtube fallback</bookmark-card>');

    await expect(
      n2m.transformers.get('embed')?.({
        embed: {
          url: 'https://youtu.be/dQw4w9WgXcQ',
          caption: [{ plain_text: 'Video title' }],
        },
      })
    ).resolves.toBe('<bookmark-card>youtube fallback</bookmark-card>');

    expect(fetchMetadataMock).not.toHaveBeenCalled();
    expect(renderBookmarkHTMLMock).toHaveBeenCalledWith({
      url: 'https://youtu.be/dQw4w9WgXcQ',
      title: 'https://youtu.be/dQw4w9WgXcQ',
      fetchedAt: expect.any(String),
    });
  });
});
