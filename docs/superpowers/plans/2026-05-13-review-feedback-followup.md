# Review Feedback Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporate the five review-feedback items by preserving HTML fragment output, restoring the previous batch/error semantics for image uploads, simplifying the Notion HTML contract to `string`, switching HTML image asset identifiers to page-local placeholders with a `TODO(issue #44)` note, and restoring the deleted markdown-block fixture.

**Architecture:** Keep the current HTML post-processing design, but align its details with prior system behavior and reviewer expectations. The image processor remains the single post-HTML owner, while concurrency/error semantics are brought back closer to the pre-refactor implementation. The Notion side gets simpler by returning a raw HTML string, and fixture/test changes stay narrowly focused on the reviewed behavior.

**Tech Stack:** TypeScript, Vitest, `cheerio`, existing WordPress/media upload helpers, existing SQLite image-asset persistence, `marked`, `notion-to-md`.

---

## File Map

- Modify: `src/domain/image/impl/imageProcessorImpl.ts`
  Use fragment-mode Cheerio consistently, restore batch/concurrency handling and aggregate failure behavior, and change temporary `notion_block_id` generation to a page-local identifier with a `TODO(issue #44)` note.
- Modify: `src/domain/image/interface/imageProcessor.ts`
  Keep `excludeSelectors` support, but make sure the public contract matches the final call shape used by the page layer.
- Modify: `src/domain/notion/interface/notion.ts`
  Remove the `GetPageHtmlResponse` wrapper and return raw `string` from `getPageHtml`.
- Modify: `src/domain/notion/impl/notionImpl.ts`
  Return raw HTML string while keeping callout normalization intact.
- Modify: `src/domain/page/impl/pageProcessorImpl.ts`
  Consume `notion.getPageHtml(): Promise<string>` directly.
- Modify: `tests/unit/domain/imageProcessor.test.ts`
  Strengthen expectations around fragment output, exclusion passthrough, and batched failure semantics.
- Modify: `tests/unit/domain/notion.test.ts`
  Assert the simplified `string` return contract.
- Modify: `tests/unit/domain/pageProcessor.test.ts`
  Align mocks and expectations with the raw-string Notion contract.
- Create: `tests/helpers/dummyMdBlock.ts`
  Restore the markdown block fixture file as a brownfield test helper for Notion/callout block shapes.

### Task 1: Lock down fragment output and the simplified Notion contract

**Files:**
- Modify: `tests/unit/domain/imageProcessor.test.ts`
- Modify: `tests/unit/domain/notion.test.ts`
- Modify: `tests/unit/domain/pageProcessor.test.ts`

- [ ] **Step 1: Tighten the image processor fragment test first**

```ts
it('rewrites a single img src and preserves the HTML fragment shape', async () => {
  const imageProcessor = await loadImageProcessor();
  const page = createPage();
  const html = '<p><img src="https://cdn.local/a.png" alt="hero"></p>';

  const result = await imageProcessor.processHtmlImages(page, html);

  expect(result).toBe('<p><img src="https://wp.local/photo.png" alt="hero"></p>');
});
```

- [ ] **Step 2: Change the Notion test to expect a raw string**

```ts
it('getPageHtml returns HTML only while preserving image URLs and normalized callouts', async () => {
  const html = await notion.getPageHtml('page-1');

  expect(html).toContain('<p>');
  expect(html).toContain('https://cdn.local/hero.png');
  expect(typeof html).toBe('string');
});
```

- [ ] **Step 3: Change the page processor test to mock `getPageHtml` as a string-returning function**

```ts
getPageHtmlMock.mockResolvedValue('<img src="https://cdn.local/a.png">');

expect(processHtmlImagesMock).toHaveBeenCalledWith(
  expect.objectContaining({ notionPageId: notionPage.id }),
  '<img src="https://cdn.local/a.png">'
);
```

- [ ] **Step 4: Run the focused tests to verify the red state**

Run: `npm test -- --run tests/unit/domain/imageProcessor.test.ts tests/unit/domain/notion.test.ts tests/unit/domain/pageProcessor.test.ts`

Expected: FAIL because production code still returns/wires the old shapes.

- [ ] **Step 5: Commit the failing contract/test updates**

```bash
git add tests/unit/domain/imageProcessor.test.ts tests/unit/domain/notion.test.ts tests/unit/domain/pageProcessor.test.ts
git commit -m "test: tighten review feedback expectations"
```

### Task 2: Simplify `getPageHtml` to return `string`

**Files:**
- Modify: `src/domain/notion/interface/notion.ts`
- Modify: `src/domain/notion/impl/notionImpl.ts`
- Modify: `src/domain/page/impl/pageProcessorImpl.ts`
- Test: `tests/unit/domain/notion.test.ts`
- Test: `tests/unit/domain/pageProcessor.test.ts`

- [ ] **Step 1: Remove the wrapper type from the Notion interface**

```ts
export interface INotion {
  queryPages(options: QueryPagesOptions): Promise<NotionPage[]>;
  getPageHtml(pageId: string): Promise<string>;
  updatePageStatus(
    pageId: string,
    status: NotionPageStatus.Done | NotionPageStatus.Error
  ): Promise<UpdatePageStatusResponse>;
}
```

- [ ] **Step 2: Return raw HTML from `notionImpl`**

```ts
async getPageHtml(pageId: string): Promise<string> {
  let mdBlocks = await retryWithBackoff(() => this.n2m.pageToMarkdown(pageId), {
    onRetry: onRetryFn,
  });

  mdBlocks = this.handleCalloutRecursively(mdBlocks);
  const mdString = this.n2m.toMarkdownString(mdBlocks);
  const markdownContent = mdString.parent ?? '';

  logger.debug(`notion - Converted page ${pageId} to HTML`);
  return marked.parse(markdownContent) as string;
}
```

- [ ] **Step 3: Simplify page processor consumption**

```ts
private async getHtml(nPageId: string): Promise<string> {
  const html = await notion.getPageHtml(nPageId);
  await this.updateNotionPageStatusToDone(nPageId);
  return html;
}
```

- [ ] **Step 4: Run the focused Notion and page tests**

Run: `npm test -- --run tests/unit/domain/notion.test.ts tests/unit/domain/pageProcessor.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the Notion contract simplification**

```bash
git add src/domain/notion/interface/notion.ts src/domain/notion/impl/notionImpl.ts src/domain/page/impl/pageProcessorImpl.ts tests/unit/domain/notion.test.ts tests/unit/domain/pageProcessor.test.ts
git commit -m "refactor: return raw HTML from notion service"
```

### Task 3: Restore batch/concurrency and aggregate failure semantics

**Files:**
- Modify: `src/domain/image/impl/imageProcessorImpl.ts`
- Test: `tests/unit/domain/imageProcessor.test.ts`

- [ ] **Step 1: Add a failing test that proves upload batching still rewrites only after upload results are known**

```ts
it('processes eligible images in batches while preserving rollback ids', async () => {
  const imageProcessor = await loadImageProcessor();
  const page = createPage();
  const html = '<p><img src="https://cdn.local/a.png"><img src="https://cdn.local/b.png"><img src="https://cdn.local/c.png"></p>';

  uploadMediaMock
    .mockResolvedValueOnce({ id: 10, url: 'https://wp.local/a.png' })
    .mockResolvedValueOnce({ id: 11, url: 'https://wp.local/b.png' })
    .mockResolvedValueOnce({ id: 12, url: 'https://wp.local/c.png' });

  const result = await imageProcessor.processHtmlImages(page, html);

  expect(result).toBe('<p><img src="https://wp.local/a.png"><img src="https://wp.local/b.png"><img src="https://wp.local/c.png"></p>');
  expect(page.uploadedMediaIds).toEqual([10, 11, 12]);
});
```

- [ ] **Step 2: Add a failing test for aggregate-style failure after batched `Promise.allSettled()` processing**

```ts
it('fails the whole page when any upload in a batch fails', async () => {
  const imageProcessor = await loadImageProcessor();
  const page = createPage();
  const html = '<p><img src="https://cdn.local/a.png"><img src="https://cdn.local/b.png"></p>';

  uploadMediaMock.mockResolvedValueOnce({ id: 10, url: 'https://wp.local/a.png' });
  uploadMediaMock.mockRejectedValueOnce(new Error('upload failed'));

  await expect(imageProcessor.processHtmlImages(page, html)).rejects.toThrow(/Failed to sync 1 images|upload failed/i);
});
```

- [ ] **Step 3: Reintroduce batch processing with the existing concurrency config**

```ts
import { config } from '../../../config/config.js';

private async processEligibleImagesInBatches(
  page: Page,
  eligibleImages: EligibleHtmlImage[]
): Promise<void> {
  const maxConcurrent = config.maxConcurrentImageDownloads;

  for (let i = 0; i < eligibleImages.length; i += maxConcurrent) {
    const batch = eligibleImages.slice(i, i + maxConcurrent);
    const results = await Promise.allSettled(
      batch.map((item) => this.uploadHtmlImage(page, item.reference))
    );

    this.handleHtmlImageErrors(results);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        batch[index].image.attr('src', result.value);
      }
    });
  }
}
```

- [ ] **Step 4: Restore aggregate error handling semantics near the old behavior**

```ts
private handleHtmlImageErrors(results: PromiseSettledResult<string>[]): void {
  const errors = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => asError(result.reason));

  if (errors.length === 0) return;

  logger.warn(`handleErrors - ${errors.length} image sync failures`);
  throw new ImageProcessException(`Failed to sync ${errors.length} images`, errors);
}
```

- [ ] **Step 5: Run the focused image processor test file**

Run: `npm test -- --run tests/unit/domain/imageProcessor.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the concurrency/error-semantics restoration**

```bash
git add src/domain/image/impl/imageProcessorImpl.ts tests/unit/domain/imageProcessor.test.ts
git commit -m "refactor: restore batched HTML image uploads"
```

### Task 4: Switch temporary asset IDs to page-local identifiers and document the debt

**Files:**
- Modify: `src/domain/image/impl/imageProcessorImpl.ts`
- Test: `tests/unit/domain/imageProcessor.test.ts`

- [ ] **Step 1: Add a failing test for page-local `notion_block_id` generation**

```ts
it('stores a page-local identifier when real notion block ids are unavailable', async () => {
  const imageProcessor = await loadImageProcessor();
  const page = createPage();

  await imageProcessor.processHtmlImages(page, '<p><img src="https://cdn.local/a.png"></p>');

  expect(createImageAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({ notion_block_id: 'np-1#image-1' })
  );
});
```

- [ ] **Step 2: Replace the synthetic block ID and add the review-requested note**

```ts
// TODO(issue #44): HTML post-processing cannot recover real Notion block IDs; use a page-local identifier until the schema is revised.
blockId: `${page.notionPageId}#image-${index + 1}`,
```

- [ ] **Step 3: Run the focused image processor tests again**

Run: `npm test -- --run tests/unit/domain/imageProcessor.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit the temporary identifier change**

```bash
git add src/domain/image/impl/imageProcessorImpl.ts tests/unit/domain/imageProcessor.test.ts
git commit -m "refactor: use page-local image asset identifiers"
```

### Task 5: Restore the brownfield markdown block fixture and finish verification

**Files:**
- Create: `tests/helpers/dummyMdBlock.ts`
- Modify: `tests/unit/domain/notion.test.ts`
- Test: full suite

- [ ] **Step 1: Restore `tests/helpers/dummyMdBlock.ts` with the previous block/callout shapes**

```ts
export const mdBlockSingleImage = [
  {
    type: 'image',
    blockId: '2f8a3a2b-1013-80c6-9688-fedd0614bf2d',
    parent: '![img1.png](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
    children: [],
  },
];

export const mdBlockCalloutWithChildren = [
  {
    type: 'callout',
    blockId: '2f8a3a2b-1013-80ff-8d70-c14cca1ebe22',
    parent:
      '> 💡 parent  \n> paragraph1  \n>   \n> ![img1](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)',
    children: [
      { type: 'paragraph', blockId: '2f8a3a2b-1013-804a-a25d-e0006a57ba6a', parent: 'paragraph1', children: [] },
      { type: 'image', blockId: '2f8a3a2b-1013-806c-829f-fc10ac1b30bd', parent: '![img1](https://prod-files-secure.s3.us-west-2.amazonaws.com/img1.png)', children: [] },
    ],
  },
];
```

- [ ] **Step 2: Repoint the Notion test to use the restored fixture if that keeps the callout normalization scenario clearer**

```ts
import { mdBlockCalloutWithChildren } from '../../helpers/dummyMdBlock.js';

pageToMarkdownMock.mockResolvedValue(mdBlockCalloutWithChildren);
```

- [ ] **Step 3: Run final verification**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test -- --run`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 4: Commit the fixture restoration and final verification**

```bash
git add tests/helpers/dummyMdBlock.ts tests/unit/domain/notion.test.ts src tests package.json package-lock.json vitest.config.ts
git commit -m "test: restore markdown block fixtures"
```
