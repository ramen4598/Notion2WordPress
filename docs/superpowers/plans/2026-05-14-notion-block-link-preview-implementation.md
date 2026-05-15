# Notion Block Link Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Notion `bookmark`, `link_preview`, `embed`, and `video` blocks into WordPress-safe bookmark cards or YouTube iframes before Markdown is rendered to HTML.

**Architecture:** Keep `notion-to-md@3.1.9` and register v3 `setCustomTransformer` handlers on the existing `NotionToMarkdown` instance. Put metadata fetching, bookmark HTML rendering, and YouTube iframe rendering in focused utility modules that the Notion transformer registration calls. Leave mentions and ordinary inline links on the default renderer path.

**Tech Stack:** TypeScript ESM, `notion-to-md@3.1.9`, `marked`, `axios`, `cheerio`, Vitest.

---

## File Structure

- Create `src/domain/linkPreview/interface/bookmarkMetadata.ts`: shared types for bookmark metadata and renderer input.
- Create `src/domain/linkPreview/impl/bookmarkMetadataFetcher.ts`: fetches URL metadata with `axios`, parses OG/title/favicon with `cheerio`, returns URL-only fallback on failure.
- Create `src/domain/linkPreview/impl/bookmarkTemplate.ts`: renders escaped WordPress custom HTML block containing `figure.bookmark-card`.
- Create `src/domain/linkPreview/impl/youtubeEmbed.ts`: detects supported YouTube URL forms and renders escaped WordPress custom HTML iframe block.
- Create `src/domain/linkPreview/impl/notionBlockTransformers.ts`: extracts URLs from Notion block shapes and registers `bookmark`, `link_preview`, `embed`, and `video` transformers on `NotionToMarkdown`.
- Modify `src/domain/notion/impl/notionImpl.ts`: call transformer registration in the constructor.
- Modify `src/domain/page/impl/pageProcessorImpl.ts`: exclude `.bookmark-card img` from HTML image uploads.
- Create tests under `tests/unit/domain/linkPreview/` for fetcher, bookmark template, YouTube renderer, and transformer registration.
- Modify `tests/unit/domain/notion.test.ts`: assert custom transformers are registered and raw generated HTML survives `marked.parse()`.
- Modify `tests/unit/domain/pageProcessor.test.ts`: assert image processor gets `{ excludeSelectors: ['.bookmark-card img'] }`.

## Task 1: Bookmark Metadata Fetcher

**Files:**
- Create: `src/domain/linkPreview/interface/bookmarkMetadata.ts`
- Create: `src/domain/linkPreview/impl/bookmarkMetadataFetcher.ts`
- Test: `tests/unit/domain/linkPreview/bookmarkMetadataFetcher.test.ts`

- [ ] **Step 1: Write failing tests for metadata extraction and fallback**

Create `tests/unit/domain/linkPreview/bookmarkMetadataFetcher.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/domain/linkPreview/bookmarkMetadataFetcher.test.ts`

Expected: FAIL because `src/domain/linkPreview/impl/bookmarkMetadataFetcher.ts` does not exist.

- [ ] **Step 3: Create metadata types**

Create `src/domain/linkPreview/interface/bookmarkMetadata.ts`:

```ts
export interface BookmarkMetadata {
  url: string;
  title: string;
  description?: string;
  featuredImage?: string;
  fetchedAt: string;
  error?: string;
}

export interface BookmarkMetadataFetcher {
  fetchMetadata(url: string): Promise<BookmarkMetadata>;
}
```

- [ ] **Step 4: Implement metadata fetcher**

Create `src/domain/linkPreview/impl/bookmarkMetadataFetcher.ts`:

```ts
import axios from 'axios';
import { load } from 'cheerio';
import type { BookmarkMetadata, BookmarkMetadataFetcher } from '../interface/bookmarkMetadata.js';
import { logger } from '../../../lib/logger.js';
import { retryWithBackoff } from '../../../lib/retry.js';
import { asError } from '../../../lib/utils.js';

const timeout = 60000;
const maxRedirects = 5;
const userAgent = 'Mozilla/5.0 (compatible; Notion2WordPress/1.0)';

class DefaultBookmarkMetadataFetcher implements BookmarkMetadataFetcher {
  async fetchMetadata(url: string): Promise<BookmarkMetadata> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      logger.info('bookmarkMetadataFetcher - fetching metadata', { url });
      const response = await retryWithBackoff(() =>
        axios.get(url, {
          timeout,
          maxRedirects,
          headers: {
            'User-Agent': userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        })
      );

      const $ = load(response.data);
      const title = $('meta[property="og:title"]').attr('content') || $('title').text() || url;
      const description = $('meta[property="og:description"]').attr('content') || undefined;
      const favicon =
        $('link[rel="icon"]').attr('href') ||
        $('link[rel="shortcut icon"]').attr('href') ||
        $('link[rel="apple-touch-icon"]').attr('href') ||
        undefined;
      const featuredImage =
        $('meta[property="og:image"]').attr('content') ||
        (favicon ? this.resolveUrl(url, favicon) : undefined);

      logger.info('bookmarkMetadataFetcher - fetched metadata', {
        url,
        hasDescription: Boolean(description),
        hasFeaturedImage: Boolean(featuredImage),
        fetchTimeMs: Date.now() - startedAt,
      });

      return {
        url,
        title,
        description,
        featuredImage,
        fetchedAt,
      };
    } catch (error: unknown) {
      const err = asError(error);
      logger.warn('bookmarkMetadataFetcher - failed to fetch metadata', {
        url,
        message: err.message,
        fetchTimeMs: Date.now() - startedAt,
      });
      return {
        url,
        title: url,
        fetchedAt,
        error: err.message,
      };
    }
  }

  private resolveUrl(siteUrl: string, path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const site = new URL(siteUrl);
    return `${site.origin}${path.startsWith('/') ? path : `/${path}`}`;
  }
}

export const bookmarkMetadataFetcher: BookmarkMetadataFetcher = new DefaultBookmarkMetadataFetcher();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/domain/linkPreview/bookmarkMetadataFetcher.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/linkPreview/interface/bookmarkMetadata.ts src/domain/linkPreview/impl/bookmarkMetadataFetcher.ts tests/unit/domain/linkPreview/bookmarkMetadataFetcher.test.ts
git commit -m "feat: add bookmark metadata fetcher"
```

## Task 2: Bookmark HTML Template

**Files:**
- Create: `src/domain/linkPreview/impl/bookmarkTemplate.ts`
- Test: `tests/unit/domain/linkPreview/bookmarkTemplate.test.ts`

- [ ] **Step 1: Write failing tests for escaped WordPress bookmark card HTML**

Create `tests/unit/domain/linkPreview/bookmarkTemplate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderBookmarkHTML } from '../../../../src/domain/linkPreview/impl/bookmarkTemplate.js';

describe('renderBookmarkHTML', () => {
  it('renders a WordPress custom HTML bookmark card', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/post',
      title: 'Example Title',
      description: 'Example Description',
      featuredImage: 'https://example.com/cover.png',
    });

    expect(html).toContain('<!-- wp:html -->');
    expect(html).toContain('<!-- /wp:html -->');
    expect(html).toContain('<figure class="bookmark-card"');
    expect(html).toContain('href="https://example.com/post"');
    expect(html).toContain('Example Title');
    expect(html).toContain('Example Description');
    expect(html).toContain('src="https://example.com/cover.png"');
  });

  it('escapes unsafe values', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/?q="bad"&x=<tag>',
      title: '<script>alert("x")</script>',
      description: "Tom & Jerry's link",
      featuredImage: 'https://example.com/image.png?x="bad"',
    });

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('Tom &amp; Jerry&#039;s link');
    expect(html).toContain('href="https://example.com/?q=&quot;bad&quot;&amp;x=&lt;tag&gt;"');
    expect(html).toContain('src="https://example.com/image.png?x=&quot;bad&quot;"');
    expect(html).not.toContain('<script>');
  });

  it('uses the URL as title and empty image container when optional values are absent', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/post',
      title: '',
    });

    expect(html).toContain('https://example.com/post');
    expect(html).not.toContain('bookmark-description');
    expect(html).not.toContain('<img');
    expect(html).toContain('<div class="bookmark-featured-image"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/domain/linkPreview/bookmarkTemplate.test.ts`

Expected: FAIL because `bookmarkTemplate.ts` does not exist.

- [ ] **Step 3: Implement bookmark template**

Create `src/domain/linkPreview/impl/bookmarkTemplate.ts`:

```ts
import type { BookmarkMetadata } from '../interface/bookmarkMetadata.js';

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function styleToString(styles: Record<string, string | number | undefined>): string {
  return Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${camelToKebab(key)}: ${value}`)
    .join('; ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCardStyles(): Record<string, string> {
  return {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
    margin: '12px 0',
    minHeight: '80px',
    position: 'relative',
  };
}

function getImageContainerStyles(): Record<string, string> {
  return {
    position: 'relative',
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    flex: '0 0 30%',
  };
}

function getImageStyles(): Record<string, string> {
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  };
}

function getContentContainerStyles(): Record<string, string> {
  return {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    flex: '1',
  };
}

function getTitleStyles(): Record<string, string> {
  return {
    margin: '0 0 4px 0',
    fontSize: '0.95rem',
    fontWeight: '500',
    color: '#111827',
    lineHeight: '1.3',
    overflowWrap: 'anywhere',
  };
}

function getRowContainerStyles(): Record<string, string> {
  return {
    display: 'flex',
    gap: '14px',
    alignItems: 'stretch',
    position: 'relative',
    zIndex: '1',
  };
}

function getOverlayLinkStyles(): Record<string, string> {
  return {
    position: 'absolute',
    inset: '0',
    display: 'block',
    zIndex: '3',
    textDecoration: 'none',
  };
}

function getDescriptionStyles(): Record<string, string> {
  return {
    margin: '4px 0 0 0',
    fontSize: '0.85rem',
    color: '#6b7280',
    lineHeight: '1.4',
    maxHeight: '3.6em',
    overflow: 'hidden',
  };
}

export function renderBookmarkHTML(data: Pick<BookmarkMetadata, 'url' | 'title' | 'description' | 'featuredImage'>): string {
  const displayTitle = data.title && data.title.trim().length > 0 ? data.title : data.url;
  const overlayLinkHtml = `<a class="bookmark-overlay-link" href="${escapeHtml(
    data.url
  )}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(
    displayTitle
  )}" style="${styleToString(getOverlayLinkStyles())}"></a>`;
  const imageHtml = data.featuredImage
    ? `<div class="bookmark-featured-image" style="${styleToString(getImageContainerStyles())}">
        <img src="${escapeHtml(data.featuredImage)}" alt="${escapeHtml(displayTitle)}" style="${styleToString(getImageStyles())}" />
      </div>`
    : `<div class="bookmark-featured-image" style="${styleToString(getImageContainerStyles())}"></div>`;
  const descriptionHtml = data.description
    ? `<p class="bookmark-description" style="${styleToString(getDescriptionStyles())}">${escapeHtml(data.description)}</p>`
    : '';
  const contentHtml = `<div class="bookmark-content" style="${styleToString(getContentContainerStyles())}">
      <p class="bookmark-title" style="${styleToString(getTitleStyles())}">${escapeHtml(displayTitle)}</p>
      ${descriptionHtml}
    </div>`;
  const rowHtml = `<div class="bookmark-row" style="${styleToString(getRowContainerStyles())}">
    ${imageHtml}
    ${contentHtml}
  </div>`;

  return `<!-- wp:html -->
<figure class="bookmark-card" style="${styleToString(getCardStyles())}">
  ${overlayLinkHtml}
  ${rowHtml}
</figure>
<!-- /wp:html -->`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/domain/linkPreview/bookmarkTemplate.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/linkPreview/impl/bookmarkTemplate.ts tests/unit/domain/linkPreview/bookmarkTemplate.test.ts
git commit -m "feat: render bookmark preview html"
```

## Task 3: YouTube Embed Renderer

**Files:**
- Create: `src/domain/linkPreview/impl/youtubeEmbed.ts`
- Test: `tests/unit/domain/linkPreview/youtubeEmbed.test.ts`

- [ ] **Step 1: Write failing tests for YouTube detection and iframe rendering**

Create `tests/unit/domain/linkPreview/youtubeEmbed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderYouTubeEmbedHTML } from '../../../../src/domain/linkPreview/impl/youtubeEmbed.js';

describe('renderYouTubeEmbedHTML', () => {
  it('renders iframe HTML for youtube.com watch URLs', () => {
    const html = renderYouTubeEmbedHTML('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'Video title');

    expect(html).toContain('<!-- wp:html -->');
    expect(html).toContain('<iframe');
    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('title="Video title"');
    expect(html).toContain('allowfullscreen');
  });

  it('renders iframe HTML for youtu.be URLs', () => {
    const html = renderYouTubeEmbedHTML('https://youtu.be/dQw4w9WgXcQ');

    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('title="YouTube video"');
  });

  it('renders iframe HTML for existing embed URLs', () => {
    const html = renderYouTubeEmbedHTML('https://www.youtube.com/embed/dQw4w9WgXcQ');

    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
  });

  it('escapes iframe titles', () => {
    const html = renderYouTubeEmbedHTML('https://youtu.be/dQw4w9WgXcQ', '<bad "title">');

    expect(html).toContain('title="&lt;bad &quot;title&quot;&gt;"');
    expect(html).not.toContain('<bad');
  });

  it('returns undefined for non-YouTube URLs', () => {
    expect(renderYouTubeEmbedHTML('https://example.com/video')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/domain/linkPreview/youtubeEmbed.test.ts`

Expected: FAIL because `youtubeEmbed.ts` does not exist.

- [ ] **Step 3: Implement YouTube renderer**

Create `src/domain/linkPreview/impl/youtubeEmbed.ts`:

```ts
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extractYouTubeVideoId(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0];
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v') ?? undefined;
      }

      const embedMatch = url.pathname.match(/^\/embed\/([^/?#]+)/);
      if (embedMatch) {
        return embedMatch[1];
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function renderYouTubeEmbedHTML(rawUrl: string, title = 'YouTube video'): string | undefined {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    return undefined;
  }

  const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
  const safeTitle = escapeHtml(title.trim() || 'YouTube video');

  return `<!-- wp:html -->
<figure class="youtube-embed" style="margin: 12px 0;">
  <div style="position: relative; width: 100%; padding-top: 56.25%; overflow: hidden; border-radius: 10px; background: #000;">
    <iframe src="${embedUrl}" title="${safeTitle}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; inset: 0; width: 100%; height: 100%; border: 0;"></iframe>
  </div>
</figure>
<!-- /wp:html -->`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/domain/linkPreview/youtubeEmbed.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/linkPreview/impl/youtubeEmbed.ts tests/unit/domain/linkPreview/youtubeEmbed.test.ts
git commit -m "feat: render youtube embed html"
```

## Task 4: Notion Block Transformer Registration

**Files:**
- Create: `src/domain/linkPreview/impl/notionBlockTransformers.ts`
- Test: `tests/unit/domain/linkPreview/notionBlockTransformers.test.ts`

- [ ] **Step 1: Write failing tests for block transformers**

Create `tests/unit/domain/linkPreview/notionBlockTransformers.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMetadataMock } = vi.hoisted(() => ({
  fetchMetadataMock: vi.fn(),
}));

vi.mock('../../../../src/domain/linkPreview/impl/bookmarkMetadataFetcher.js', () => ({
  bookmarkMetadataFetcher: {
    fetchMetadata: fetchMetadataMock,
  },
}));

async function loadTransformers() {
  vi.resetModules();
  const mod = await import('../../../../src/domain/linkPreview/impl/notionBlockTransformers.js');
  return mod.registerLinkPreviewTransformers;
}

function createN2mMock() {
  const transformers: Record<string, (block: unknown) => Promise<string | boolean>> = {};
  return {
    n2m: {
      setCustomTransformer: vi.fn((type: string, transformer: (block: unknown) => Promise<string | boolean>) => {
        transformers[type] = transformer;
        return undefined;
      }),
    },
    transformers,
  };
}

describe('registerLinkPreviewTransformers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMetadataMock.mockResolvedValue({
      url: 'https://example.com/post',
      title: 'Example Title',
      description: 'Example Description',
      featuredImage: 'https://example.com/cover.png',
      fetchedAt: '2026-05-14T00:00:00.000Z',
    });
  });

  it('registers bookmark, link_preview, embed, and video transformers', async () => {
    const register = await loadTransformers();
    const { n2m } = createN2mMock();

    register(n2m as never);

    expect(n2m.setCustomTransformer).toHaveBeenCalledWith('bookmark', expect.any(Function));
    expect(n2m.setCustomTransformer).toHaveBeenCalledWith('link_preview', expect.any(Function));
    expect(n2m.setCustomTransformer).toHaveBeenCalledWith('embed', expect.any(Function));
    expect(n2m.setCustomTransformer).toHaveBeenCalledWith('video', expect.any(Function));
  });

  it('renders bookmark blocks as bookmark cards', async () => {
    const register = await loadTransformers();
    const { n2m, transformers } = createN2mMock();
    register(n2m as never);

    const html = await transformers.bookmark({
      type: 'bookmark',
      bookmark: { url: 'https://example.com/post', caption: [] },
    });

    expect(fetchMetadataMock).toHaveBeenCalledWith('https://example.com/post');
    expect(html).toContain('bookmark-card');
    expect(html).toContain('Example Title');
  });

  it('renders non-YouTube embeds as bookmark cards', async () => {
    const register = await loadTransformers();
    const { n2m, transformers } = createN2mMock();
    register(n2m as never);

    const html = await transformers.embed({
      type: 'embed',
      embed: { url: 'https://example.com/post', caption: [] },
    });

    expect(fetchMetadataMock).toHaveBeenCalledWith('https://example.com/post');
    expect(html).toContain('bookmark-card');
  });

  it('renders YouTube embeds as iframes without fetching metadata', async () => {
    const register = await loadTransformers();
    const { n2m, transformers } = createN2mMock();
    register(n2m as never);

    const html = await transformers.embed({
      type: 'embed',
      embed: {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        caption: [{ plain_text: 'Caption Title' }],
      },
    });

    expect(fetchMetadataMock).not.toHaveBeenCalled();
    expect(html).toContain('<iframe');
    expect(html).toContain('dQw4w9WgXcQ');
    expect(html).toContain('Caption Title');
  });

  it('renders external YouTube video blocks as iframes', async () => {
    const register = await loadTransformers();
    const { n2m, transformers } = createN2mMock();
    register(n2m as never);

    const html = await transformers.video({
      type: 'video',
      video: {
        type: 'external',
        external: { url: 'https://youtu.be/dQw4w9WgXcQ' },
        caption: [],
      },
    });

    expect(html).toContain('<iframe');
    expect(html).toContain('dQw4w9WgXcQ');
  });

  it('returns false when a block has no usable URL', async () => {
    const register = await loadTransformers();
    const { n2m, transformers } = createN2mMock();
    register(n2m as never);

    await expect(transformers.bookmark({ type: 'bookmark', bookmark: {} })).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/domain/linkPreview/notionBlockTransformers.test.ts`

Expected: FAIL because `notionBlockTransformers.ts` does not exist.

- [ ] **Step 3: Implement transformer registration**

Create `src/domain/linkPreview/impl/notionBlockTransformers.ts`:

```ts
import type { NotionToMarkdown } from 'notion-to-md';
import type { ListBlockChildrenResponseResult } from 'notion-to-md/build/types/index.js';
import { bookmarkMetadataFetcher } from './bookmarkMetadataFetcher.js';
import { renderBookmarkHTML } from './bookmarkTemplate.js';
import { renderYouTubeEmbedHTML } from './youtubeEmbed.js';
import { logger } from '../../../lib/logger.js';
import { asError, isRecord } from '../../../lib/utils.js';

type NotionBlock = ListBlockChildrenResponseResult;

export function registerLinkPreviewTransformers(n2m: NotionToMarkdown): void {
  n2m.setCustomTransformer('bookmark', async (block) => await renderBookmarkBlock(block));
  n2m.setCustomTransformer('link_preview', async (block) => await renderBookmarkBlock(block));
  n2m.setCustomTransformer('embed', async (block) => await renderEmbeddableBlock(block));
  n2m.setCustomTransformer('video', async (block) => await renderEmbeddableBlock(block));
}

async function renderBookmarkBlock(block: NotionBlock): Promise<string | boolean> {
  const url = extractUrl(block);
  if (!url) {
    return false;
  }

  return await renderBookmarkCard(url);
}

async function renderEmbeddableBlock(block: NotionBlock): Promise<string | boolean> {
  const url = extractUrl(block);
  if (!url) {
    return false;
  }

  const title = extractCaption(block);
  const youtubeHtml = renderYouTubeEmbedHTML(url, title || undefined);
  if (youtubeHtml) {
    return youtubeHtml;
  }

  if (block.type === 'video' && isRecord(block.video) && block.video.type === 'file') {
    return false;
  }

  return await renderBookmarkCard(url);
}

async function renderBookmarkCard(url: string): Promise<string> {
  try {
    const metadata = await bookmarkMetadataFetcher.fetchMetadata(url);
    return renderBookmarkHTML(metadata);
  } catch (error: unknown) {
    const err = asError(error);
    logger.warn('notionBlockTransformers - bookmark rendering failed, using URL fallback', {
      url,
      message: err.message,
    });
    return renderBookmarkHTML({
      url,
      title: url,
      fetchedAt: new Date().toISOString(),
      error: err.message,
    });
  }
}

function extractUrl(block: NotionBlock): string | undefined {
  if (block.type === 'bookmark' && isRecord(block.bookmark) && typeof block.bookmark.url === 'string') {
    return block.bookmark.url;
  }
  if (block.type === 'link_preview' && isRecord(block.link_preview) && typeof block.link_preview.url === 'string') {
    return block.link_preview.url;
  }
  if (block.type === 'embed' && isRecord(block.embed) && typeof block.embed.url === 'string') {
    return block.embed.url;
  }
  if (block.type === 'video' && isRecord(block.video)) {
    const video = block.video;
    if (video.type === 'external' && isRecord(video.external) && typeof video.external.url === 'string') {
      return video.external.url;
    }
    if (video.type === 'file' && isRecord(video.file) && typeof video.file.url === 'string') {
      return video.file.url;
    }
  }
  return undefined;
}

function extractCaption(block: NotionBlock): string {
  const content = isRecord(block[block.type]) ? block[block.type] : undefined;
  const caption = content?.caption;
  if (!Array.isArray(caption)) {
    return '';
  }

  return caption
    .map((item) => (isRecord(item) && typeof item.plain_text === 'string' ? item.plain_text : ''))
    .join('')
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/domain/linkPreview/notionBlockTransformers.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/linkPreview/impl/notionBlockTransformers.ts tests/unit/domain/linkPreview/notionBlockTransformers.test.ts
git commit -m "feat: register notion link preview transformers"
```

## Task 5: Wire Transformers Into Notion Conversion

**Files:**
- Modify: `src/domain/notion/impl/notionImpl.ts`
- Modify: `tests/unit/domain/notion.test.ts`

- [ ] **Step 1: Update Notion tests to require transformer registration and raw HTML passthrough**

Modify `tests/unit/domain/notion.test.ts` so the hoisted mock includes transformer registration:

```ts
const { pageToMarkdownMock, toMarkdownStringMock, setCustomTransformerMock } = vi.hoisted(() => ({
  pageToMarkdownMock: vi.fn(),
  toMarkdownStringMock: vi.fn(),
  setCustomTransformerMock: vi.fn(),
}));
```

Modify the `notion-to-md` mock class:

```ts
vi.mock('notion-to-md', () => ({
  NotionToMarkdown: class {
    pageToMarkdown = pageToMarkdownMock;
    toMarkdownString = toMarkdownStringMock;
    setCustomTransformer = setCustomTransformerMock;
  },
}));
```

Add this test inside `describe('Notion', ...)`:

```ts
it('registers link preview custom transformers on construction', async () => {
  await loadNotion();

  expect(setCustomTransformerMock).toHaveBeenCalledWith('bookmark', expect.any(Function));
  expect(setCustomTransformerMock).toHaveBeenCalledWith('link_preview', expect.any(Function));
  expect(setCustomTransformerMock).toHaveBeenCalledWith('embed', expect.any(Function));
  expect(setCustomTransformerMock).toHaveBeenCalledWith('video', expect.any(Function));
  expect(setCustomTransformerMock).not.toHaveBeenCalledWith('paragraph', expect.any(Function));
});
```

Add this test to prove raw HTML survives `marked.parse()`:

```ts
it('preserves custom transformer raw HTML when converting markdown to HTML', async () => {
  pageToMarkdownMock.mockResolvedValue([
    {
      type: 'bookmark',
      blockId: 'bookmark-1',
      parent: '<!-- wp:html -->\n<figure class="bookmark-card"><a href="https://example.com">Example</a></figure>\n<!-- /wp:html -->',
      children: [],
    },
  ]);

  const notion = await loadNotion();
  const response = await notion.getPageHtml('page-1');

  expect(response).toContain('<!-- wp:html -->');
  expect(response).toContain('<figure class="bookmark-card">');
  expect(response).toContain('href="https://example.com"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/unit/domain/notion.test.ts`

Expected: FAIL because `Notion` does not register link preview transformers yet.

- [ ] **Step 3: Register transformers in Notion constructor**

Modify `src/domain/notion/impl/notionImpl.ts` imports:

```ts
import { registerLinkPreviewTransformers } from '../../linkPreview/impl/notionBlockTransformers.js';
```

Modify the constructor:

```ts
  constructor() {
    this.client = new Client({ auth: config.notionApiToken });
    this.n2m = new NotionToMarkdown({ notionClient: this.client });
    registerLinkPreviewTransformers(this.n2m);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/unit/domain/notion.test.ts tests/unit/domain/linkPreview/notionBlockTransformers.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/notion/impl/notionImpl.ts tests/unit/domain/notion.test.ts
git commit -m "feat: wire link preview transformers into notion conversion"
```

## Task 6: Exclude Bookmark Thumbnails From Image Uploads

**Files:**
- Modify: `src/domain/page/impl/pageProcessorImpl.ts`
- Modify: `tests/unit/domain/pageProcessor.test.ts`

- [ ] **Step 1: Update page processor test for exclusion option**

Modify the existing assertion in `tests/unit/domain/pageProcessor.test.ts` from:

```ts
    expect(processHtmlImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 101,
        notionPageId: 'notion-page-1',
        uploadedMediaIds: [],
      }),
      '<p>raw html</p>'
    );
```

to:

```ts
    expect(processHtmlImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 101,
        notionPageId: 'notion-page-1',
        uploadedMediaIds: [],
      }),
      '<p>raw html</p>',
      { excludeSelectors: ['.bookmark-card img'] }
    );
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/domain/pageProcessor.test.ts`

Expected: FAIL because `processHtmlImages` is currently called without options.

- [ ] **Step 3: Pass exclusion option in page processor**

Modify `src/domain/page/impl/pageProcessorImpl.ts` in `processHtmlImages`:

```ts
  private async processHtmlImages(page: Page, html: string): Promise<string> {
    try {
      return await imageProcessor.processHtmlImages(page, html, {
        excludeSelectors: ['.bookmark-card img'],
      });
    } catch (error: unknown) {
      throw new PageException(
        `Failed to upload images for Notion page ${page.notionPageId}`,
        error
      );
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/domain/pageProcessor.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/page/impl/pageProcessorImpl.ts tests/unit/domain/pageProcessor.test.ts
git commit -m "fix: skip bookmark thumbnails during image processing"
```

## Task 7: Full Verification

**Files:**
- No code files unless verification exposes issues.

- [ ] **Step 1: Run link preview unit tests**

Run: `npm test -- tests/unit/domain/linkPreview tests/unit/domain/notion.test.ts tests/unit/domain/pageProcessor.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm test -- --run`

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Inspect git status**

Run: `git status --short`

Expected: only intended files changed, no `.env`, `data/`, or generated temp artifacts.

- [ ] **Step 6: Commit verification fixes if any were needed**

If verification required fixes, commit them:

```bash
git add <fixed-files>
git commit -m "fix: stabilize link preview implementation"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: `setCustomTransformer` usage is covered by Tasks 4 and 5. Bookmark metadata and HTML are covered by Tasks 1 and 2. YouTube iframe rendering is covered by Task 3. Image upload exclusion is covered by Task 6. Mention non-handling is covered by Task 5's registration test and the plan avoids any paragraph transformer.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: shared `BookmarkMetadata` is introduced in Task 1 and reused by Task 2. `renderYouTubeEmbedHTML`, `renderBookmarkHTML`, and `registerLinkPreviewTransformers` names are consistent across tests and implementation steps.
