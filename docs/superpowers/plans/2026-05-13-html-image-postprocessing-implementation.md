# HTML Image Post-Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move image handling from the Notion markdown phase to a single HTML post-processing phase that parses `<img>` tags with `cheerio`, uploads eligible images to WordPress, and rewrites `src` URLs in place.

**Architecture:** Keep `pageProcessor` as the orchestrator, simplify the Notion layer so it returns HTML only, and evolve `imageProcessor` so it owns HTML parsing, image filtering, image upload, and DOM rewriting. Preserve existing rollback semantics by continuing to register uploaded media IDs on the `Page` object and by failing the whole page sync when any eligible image fails.

**Tech Stack:** TypeScript, Vitest, `cheerio`, existing `notion-to-md` + `marked` pipeline, existing WordPress/media upload and SQLite image asset tracking.

---

## File Map

- Modify: `package.json`
  Add `cheerio` to runtime dependencies.
- Modify: `src/domain/notion/interface/notion.ts`
  Remove `ImageReference`/`images` from the public Notion contract and rename the response type to HTML-only semantics.
- Modify: `src/domain/notion/impl/notionImpl.ts`
  Stop extracting placeholders and return HTML only.
- Modify: `src/domain/image/interface/imageProcessor.ts`
  Replace placeholder-based methods with HTML post-processing methods and selector options.
- Modify: `src/domain/image/impl/imageProcessorImpl.ts`
  Implement `cheerio` parsing, `<img>` filtering, upload flow, DOM rewriting, and existing image asset persistence.
- Modify: `src/domain/page/impl/pageProcessorImpl.ts`
  Update orchestration to `get HTML -> process images -> create post`.
- Create: `tests/unit/domain/imageProcessor.test.ts`
  Cover HTML rewriting, exclusion behavior, empty HTML, invalid `src`, and upload failure behavior.
- Create or modify: `tests/unit/domain/notion.test.ts`
  Cover the simplified Notion HTML-only contract and verify placeholder extraction is gone.

### Task 1: Add the HTML processor test harness

**Files:**
- Create: `tests/unit/domain/imageProcessor.test.ts`
- Test: `tests/unit/domain/imageProcessor.test.ts`

- [ ] **Step 1: Write the failing test file for HTML rewriting**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadMock = vi.fn();
const uploadMediaMock = vi.fn();
const createImageAssetMock = vi.fn();
const updateImageAssetMock = vi.fn();

vi.mock('../../../src/domain/image/impl/notionImgDownloader.js', () => ({
  imageDownloader: { download: downloadMock },
}));

vi.mock('../../../src/domain/wordPress/impl/wordPressImpl.js', () => ({
  wordPress: { uploadMedia: uploadMediaMock },
}));

vi.mock('../../../src/domain/db/impl/sqlite3.js', () => ({
  db: {
    createImageAsset: createImageAssetMock,
    updateImageAsset: updateImageAssetMock,
  },
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { imageProcessor } from '../../../src/domain/image/impl/imageProcessorImpl.js';

describe('ImageProcessor.processHtmlImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createImageAssetMock.mockReturnValue(101);
    downloadMock.mockResolvedValue({
      filename: 'photo',
      buffer: Buffer.from('img'),
      hash: '1234567890abcdef1234567890abcdef',
      contentType: 'image/png',
    });
    uploadMediaMock.mockResolvedValue({ id: 55, url: 'https://wp.local/photo.png' });
  });

  it('rewrites a single img src and records rollback media ids', async () => {
    const page = { id: 1, notionPageId: 'np-1', wpPostId: undefined, uploadedMediaIds: [] };
    const html = '<p><img src="https://cdn.local/a.png" alt="hero"></p>';

    const result = await imageProcessor.processHtmlImages(page, html);

    expect(result).toContain('src="https://wp.local/photo.png"');
    expect(page.uploadedMediaIds).toEqual([55]);
  });
});
```

- [ ] **Step 2: Run the single test to verify it fails**

Run: `npm test -- --run tests/unit/domain/imageProcessor.test.ts`

Expected: FAIL because `processHtmlImages` does not exist yet and `cheerio` is not installed.

- [ ] **Step 3: Extend the test file with exclusion, no-image, invalid-src, and upload-failure cases**

```ts
it('leaves excluded selector matches unchanged', async () => {
  const page = { id: 1, notionPageId: 'np-1', wpPostId: undefined, uploadedMediaIds: [] };
  const html = '<div class="link-preview"><img src="https://cdn.local/thumb.png"></div>';

  const result = await imageProcessor.processHtmlImages(page, html, {
    excludeSelectors: ['.link-preview img'],
  });

  expect(result).toContain('https://cdn.local/thumb.png');
  expect(downloadMock).not.toHaveBeenCalled();
  expect(uploadMediaMock).not.toHaveBeenCalled();
});

it('passes HTML with no images through unchanged', async () => {
  const page = { id: 1, notionPageId: 'np-1', wpPostId: undefined, uploadedMediaIds: [] };
  const html = '<p>no images</p>';

  await expect(imageProcessor.processHtmlImages(page, html)).resolves.toBe(html);
});

it('fails when an eligible image has an empty src', async () => {
  const page = { id: 1, notionPageId: 'np-1', wpPostId: undefined, uploadedMediaIds: [] };
  const html = '<img src="   " alt="broken">';

  await expect(imageProcessor.processHtmlImages(page, html)).rejects.toThrow(/src/i);
});

it('fails the whole page when one image upload fails', async () => {
  const page = { id: 1, notionPageId: 'np-1', wpPostId: undefined, uploadedMediaIds: [] };
  downloadMock.mockRejectedValueOnce(new Error('download failed'));

  await expect(
    imageProcessor.processHtmlImages(page, '<img src="https://cdn.local/a.png">')
  ).rejects.toThrow(/download failed/i);
});
```

- [ ] **Step 4: Run the focused test file again**

Run: `npm test -- --run tests/unit/domain/imageProcessor.test.ts`

Expected: FAIL only because implementation is still missing.

- [ ] **Step 5: Commit the test harness**

```bash
git add tests/unit/domain/imageProcessor.test.ts
git commit -m "test: add HTML image processor coverage"
```

### Task 2: Switch the image processor from placeholders to HTML DOM rewriting

**Files:**
- Modify: `package.json`
- Modify: `src/domain/image/interface/imageProcessor.ts`
- Modify: `src/domain/image/impl/imageProcessorImpl.ts`
- Test: `tests/unit/domain/imageProcessor.test.ts`

- [ ] **Step 1: Add `cheerio` and update the image processor interface**

```ts
// package.json
"dependencies": {
  "cheerio": "^1.0.0",
  "marked": "17.0.1",
  "notion-to-md": "3.1.9"
}

// src/domain/image/interface/imageProcessor.ts
import type { Page } from '../../page/interface/pageProcessor.js';

export interface ProcessHtmlImagesOptions {
  excludeSelectors?: string[];
}

export interface IImageProcessor {
  processHtmlImages(
    page: Page,
    html: string,
    options?: ProcessHtmlImagesOptions
  ): Promise<string>;
}
```

- [ ] **Step 2: Run install to pull `cheerio`**

Run: `npm install`

Expected: lockfile updates and install success.

- [ ] **Step 3: Implement the minimal HTML processor path**

```ts
// src/domain/image/impl/imageProcessorImpl.ts
import { load } from 'cheerio';
import type { Element } from 'domhandler';

async processHtmlImages(
  page: Page,
  html: string,
  options: ProcessHtmlImagesOptions = {}
): Promise<string> {
  const $ = load(html);
  const candidates = this.getEligibleImages($, options.excludeSelectors ?? []);

  if (candidates.length === 0) {
    return html;
  }

  for (const node of candidates) {
    await this.processSingleImageNode(page, $, node);
  }

  return $.html();
}

private getEligibleImages($: ReturnType<typeof load>, excludeSelectors: string[]): Element[] {
  let nodes = $('img').toArray();

  for (const selector of excludeSelectors) {
    const excluded = new Set($(selector).toArray());
    nodes = nodes.filter((node) => !excluded.has(node));
  }

  return nodes;
}
```

- [ ] **Step 4: Implement single-node upload and rewrite using existing upload helpers**

```ts
private async processSingleImageNode(
  page: Page,
  $: ReturnType<typeof load>,
  node: Element
): Promise<void> {
  const src = ($(node).attr('src') ?? '').trim();
  if (!src) {
    throw new ImageProcessException('Eligible image is missing a valid src');
  }

  const altText = ($(node).attr('alt') ?? undefined)?.trim() || undefined;
  const assetId = this.createImageAsset(page, { url: src, blockId: src });

  try {
    const { filename: originalName, buffer, hash, contentType } = await this.downloadImage(src);
    const extension = this.getExtensionFromContentType(contentType);
    const filename = `${originalName}-${hash.substring(0, 16)}.${extension}`;
    const media = await this.uploadImageToWordPress(buffer, filename, contentType, altText);

    page.uploadedMediaIds.push(media.id);
    this.updateImageAssetAsUploaded(assetId, media);
    $(node).attr('src', media.url);
  } catch (error: unknown) {
    const err = asError(error);
    this.updateImageAssetAsFailed(assetId, err.message);
    throw error;
  }
}
```

- [ ] **Step 5: Adapt helper signatures away from `ImageReference`**

```ts
private createImageAsset(page: Page, image: { url: string; blockId: string }): number {
  return db.createImageAsset({
    page_id: page.id,
    notion_page_id: page.notionPageId,
    notion_block_id: image.blockId,
    notion_url: image.url,
    status: ImageAssetStatus.Pending,
  });
}

private async downloadImage(url: string): Promise<DownloadImageResponse> {
  return await imageDownloader.download({ url });
}
```

- [ ] **Step 6: Run the image processor tests**

Run: `npm test -- --run tests/unit/domain/imageProcessor.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the DOM-based image processor**

```bash
git add package.json package-lock.json src/domain/image/interface/imageProcessor.ts src/domain/image/impl/imageProcessorImpl.ts tests/unit/domain/imageProcessor.test.ts
git commit -m "feat: process HTML images after conversion"
```

### Task 3: Simplify the Notion contract to HTML-only

**Files:**
- Modify: `src/domain/notion/interface/notion.ts`
- Modify: `src/domain/notion/impl/notionImpl.ts`
- Create or modify: `tests/unit/domain/notion.test.ts`

- [ ] **Step 1: Write the failing Notion contract test**

```ts
import { describe, expect, it, vi } from 'vitest';

const pageToMarkdownMock = vi.fn();
const toMarkdownStringMock = vi.fn();

vi.mock('notion-to-md', () => ({
  NotionToMarkdown: vi.fn().mockImplementation(() => ({
    pageToMarkdown: pageToMarkdownMock,
    toMarkdownString: toMarkdownStringMock,
  })),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { notion } from '../../../src/domain/notion/impl/notionImpl.js';

it('returns HTML without image metadata or placeholders', async () => {
  pageToMarkdownMock.mockResolvedValue([
    { type: 'image', blockId: 'img-1', parent: '![hero](https://cdn.local/a.png)', children: [] },
  ]);
  toMarkdownStringMock.mockReturnValue({ parent: '![hero](https://cdn.local/a.png)' });

  const result = await notion.getPageHtml('page-1');

  expect(result.html).toContain('https://cdn.local/a.png');
  expect(result).not.toHaveProperty('images');
  expect(result.html).not.toContain('image-img-1');
});
```

- [ ] **Step 2: Run the focused Notion test to verify it fails**

Run: `npm test -- --run tests/unit/domain/notion.test.ts`

Expected: FAIL because `getPageHtml` does not exist yet.

- [ ] **Step 3: Replace the interface and implementation with HTML-only return values**

```ts
// src/domain/notion/interface/notion.ts
export interface GetPageHtmlResponse {
  html: string;
}

export interface INotion {
  queryPages(options: QueryPagesOptions): Promise<NotionPage[]>;
  getPageHtml(pageId: string): Promise<GetPageHtmlResponse>;
  updatePageStatus(
    pageId: string,
    status: NotionPageStatus.Done | NotionPageStatus.Error
  ): Promise<UpdatePageStatusResponse>;
}

// src/domain/notion/impl/notionImpl.ts
async getPageHtml(pageId: string): Promise<GetPageHtmlResponse> {
  let mdBlocks = await retryWithBackoff(() => this.n2m.pageToMarkdown(pageId), { onRetry: onRetryFn });
  mdBlocks = this.handleCalloutRecursively(mdBlocks);

  const mdString = this.n2m.toMarkdownString(mdBlocks);
  const markdownContent = mdString.parent ?? '';
  const html = marked.parse(markdownContent) as string;

  logger.debug(`notion - Converted page ${pageId} to HTML`);
  return { html };
}
```

- [ ] **Step 4: Delete dead placeholder extraction code**

```ts
// Remove from notionImpl.ts
// - extractImagesRecursively()
// - image placeholder comments
// - ImageReference imports/usages
```

- [ ] **Step 5: Run the Notion test and the baseline suite**

Run: `npm test -- --run tests/unit/domain/notion.test.ts`

Expected: PASS.

Run: `npm test -- --run`

Expected: existing suite still passes, plus the new Notion test.

- [ ] **Step 6: Commit the HTML-only Notion contract**

```bash
git add src/domain/notion/interface/notion.ts src/domain/notion/impl/notionImpl.ts tests/unit/domain/notion.test.ts
git commit -m "refactor: return HTML only from notion service"
```

### Task 4: Rewire page orchestration to the new image processor contract

**Files:**
- Modify: `src/domain/page/impl/pageProcessorImpl.ts`
- Test: `tests/unit/domain/pageProcessor.test.ts`

- [ ] **Step 1: Write the failing page orchestration test**

```ts
import { describe, expect, it, vi } from 'vitest';

const getPageHtmlMock = vi.fn();
const processHtmlImagesMock = vi.fn();
const createPostMock = vi.fn();

vi.mock('../../../src/domain/notion/impl/notionImpl.js', () => ({
  notion: {
    queryPages: vi.fn(),
    getPageHtml: getPageHtmlMock,
    updatePageStatus: vi.fn(),
  },
}));

vi.mock('../../../src/domain/image/impl/imageProcessorImpl.js', () => ({
  imageProcessor: {
    processHtmlImages: processHtmlImagesMock,
  },
}));

vi.mock('../../../src/domain/wordPress/impl/wordPressImpl.js', () => ({
  wordPress: {
    createPost: createPostMock,
    deleteMedia: vi.fn(),
    deletePost: vi.fn(),
  },
}));
```

- [ ] **Step 2: Extend the page test with the new happy-path assertion**

```ts
it('processes HTML images before creating the post', async () => {
  getPageHtmlMock.mockResolvedValue({ html: '<img src="https://cdn.local/a.png">' });
  processHtmlImagesMock.mockResolvedValue('<img src="https://wp.local/a.png">');
  createPostMock.mockResolvedValue({ id: 99 });

  await pageProcessor.syncPage(job, notionPage);

  expect(processHtmlImagesMock).toHaveBeenCalledWith(
    expect.objectContaining({ notionPageId: notionPage.id }),
    '<img src="https://cdn.local/a.png">'
  );
  expect(createPostMock).toHaveBeenCalledWith(
    expect.objectContaining({ content: '<img src="https://wp.local/a.png">' })
  );
});
```

- [ ] **Step 3: Run the page processor test to verify it fails**

Run: `npm test -- --run tests/unit/domain/pageProcessor.test.ts`

Expected: FAIL because the old `getPageHtmlAndImage` and placeholder flow are still referenced.

- [ ] **Step 4: Update `pageProcessorImpl.ts` to the new flow**

```ts
private async syncPageWithRollback(page: Page, nPage: NotionPage): Promise<void> {
  try {
    const { html } = await this.getHtml(nPage.id);
    const finalHtml = await this.processImages(page, html);
    await this.createPost(page, nPage.title, finalHtml);
  } catch (error: unknown) {
    await this.rollback(page, asError(error).message);
    throw error;
  }
}

private async getHtml(nPageId: string): Promise<{ html: string }> {
  const { html } = await notion.getPageHtml(nPageId);
  await this.updateNotionPageStatusToDone(nPageId);
  return { html };
}

private async processImages(page: Page, html: string): Promise<string> {
  return await imageProcessor.processHtmlImages(page, html);
}
```

- [ ] **Step 5: Remove stale placeholder imports and types**

```ts
// Remove from pageProcessorImpl.ts
// - ImageReference import
// - Placeholder2WpUrlMap import
// - uploadImages(images) signature
```

- [ ] **Step 6: Run the focused page test and the full test suite**

Run: `npm test -- --run tests/unit/domain/pageProcessor.test.ts`

Expected: PASS.

Run: `npm test -- --run`

Expected: PASS.

- [ ] **Step 7: Commit the orchestration update**

```bash
git add src/domain/page/impl/pageProcessorImpl.ts tests/unit/domain/pageProcessor.test.ts
git commit -m "refactor: move image handling to HTML post-processing"
```

### Task 5: Remove dead placeholder fixtures and finish verification

**Files:**
- Modify: `tests/helpers/dummyMdBlock.ts`
- Modify: any test file still referencing `ImageReference`, placeholder maps, or `getPageHtmlAndImage`
- Test: full suite

- [ ] **Step 1: Search for stale placeholder references and remove or rewrite them**

Run: `rg "ImageReference|placeholder|getPageHtmlAndImage|replaceImageUrls|syncImages" src tests`

Expected: only intended HTML-processing names remain.

- [ ] **Step 2: Rewrite or delete dead fixtures**

```ts
// tests/helpers/dummyMdBlock.ts
// Keep only fixtures still needed by Notion markdown-to-HTML tests.
// Remove placeholder-specific expectations and comments.
```

- [ ] **Step 3: Run typecheck, tests, and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test -- --run`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit the cleanup and final verification**

```bash
git add tests/helpers/dummyMdBlock.ts src tests package.json package-lock.json
git commit -m "test: remove placeholder-era image fixtures"
```
