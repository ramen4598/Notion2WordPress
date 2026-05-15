# Notion Block Link Preview Design

**Date**: 2026-05-14

## Summary

Issue #24 adds rich link rendering for Notion content before Markdown is converted to HTML. The core implementation point is `notion-to-md@3.1.9` custom block transformers, not post-HTML link rewriting. Target Notion blocks are detected during block-to-Markdown conversion and replaced with predefined raw HTML fragments. `marked` then passes those HTML fragments through while rendering the rest of the Markdown normally.

The first implementation keeps `notion-to-md` on the stable 3.x line. Version 4 offers a cleaner renderer plugin model, but published v4 builds are alpha releases, so they are not the preferred dependency for this project.

## Goals

- Keep `notion-to-md@3.1.9` and use its existing `setCustomTransformer` API.
- Convert `bookmark`, `embed`, `video`, and `link_preview` blocks into predefined HTML before `marked.parse()` runs.
- Render YouTube URLs as iframe embeds.
- Render non-YouTube URLs as bookmark cards using the metadata and HTML style from `Tistory2WordPress`.
- Leave mentions to the default `notion-to-md` rich text rendering path.
- Avoid image post-processing uploading bookmark thumbnail images.
- Preserve the existing page sync and rollback flow.

## Non-Goals

- Do not migrate to `notion-to-md@4` while it is alpha.
- Do not rewrite the full Notion renderer.
- Do not transform every inline text link into a card in the first implementation.
- Do not add mention-specific handling. Mentions should be treated like ordinary inline content by the default renderer.
- Do not fail page sync only because bookmark metadata fetch fails.
- Do not upload bookmark preview thumbnails to WordPress in this issue.

## Current Context

The current Notion pipeline is:

1. `notion.getPageHtml()` calls `this.n2m.pageToMarkdown(pageId)`.
2. Existing callout normalization runs on the returned `MdBlock[]`.
3. `this.n2m.toMarkdownString(mdBlocks)` creates Markdown.
4. `marked.parse(markdownContent)` creates HTML.
5. `pageProcessor` sends that HTML through `imageProcessor.processHtmlImages()`.
6. The final HTML is posted to WordPress.

`notion-to-md@3.1.9` supports `setCustomTransformer(type, transformer)`. The transformer is invoked from `blockToMarkdown()` before the library falls back to its default block renderer. Returning a string replaces that block's Markdown output. Returning a non-string falls back to default rendering.

The v3 supported block type list includes `bookmark`, `embed`, `video`, and `link_preview`, so the core issue can be handled without adopting v4 alpha.

## Target Block Behavior

### Bookmark and Link Preview

`bookmark` and `link_preview` blocks should become bookmark card HTML.

The card metadata policy follows `Tistory2WordPress`(https://github.com/ramen4598/Tistory2WordPress/):

- fetch the target URL with `axios`, retry, timeout, redirects, and a browser-like user agent,
- read `meta[property="og:title"]`, then `<title>`, then fallback to the URL,
- read `meta[property="og:description"]` when present,
- read `meta[property="og:image"]` when present,
- fallback image to favicon when OG image is missing,
- return URL-only metadata when fetch or parsing fails.

The HTML output should follow the existing `renderBookmarkHTML()` structure from `Tistory2WordPress`: a `figure.bookmark-card` with inline styles, an overlay anchor, optional thumbnail area, title, and optional description. This keeps output self-contained for WordPress.

### Embed and Video

`embed` and `video` blocks should first check whether their URL is a YouTube URL.

If the URL is YouTube:

- normalize supported URL shapes such as `youtube.com/watch?v=...`, `youtu.be/...`, and `youtube.com/embed/...`,
- render a responsive iframe HTML fragment,
- include safe iframe attributes such as `loading="lazy"`, `allowfullscreen`, and a conservative `allow` list,
- use any available Notion caption as optional visible caption text if simple to support.

If the URL is not YouTube:

- render it as a bookmark card using the same metadata fetch and card template as bookmark blocks.

For `video` blocks with Notion-hosted file URLs, do not try to force bookmark behavior if the URL is not suitable for metadata fetching. The first implementation may fall back to the default `notion-to-md` rendering by returning `false`, or render a plain link, whichever produces safer output after testing.

## Components

### Link Preview Transformer Registration

Add a small setup method in `Notion` construction that registers custom transformers on the existing `NotionToMarkdown` instance.

Target transformer registrations:

- `bookmark`
- `link_preview`
- `embed`
- `video`

The transformer functions should be thin adapters. They extract URLs and captions from Notion block shapes, then delegate to focused services for metadata fetching and HTML rendering.

### Bookmark Metadata Fetcher

Introduce a focused metadata fetcher modeled after `Tistory2WordPress`.

Responsibilities:

- fetch URL HTML,
- parse metadata with `cheerio`,
- resolve relative favicon URLs against the target origin,
- log success/failure,
- return fallback metadata instead of throwing for network or parsing failures.

This belongs outside the Notion class so it can be tested independently and reused by multiple transformers.

### Bookmark HTML Renderer

Introduce a renderer function based on `Tistory2WordPress`'s `renderBookmarkHTML()`.

Responsibilities:

- escape unsafe values,
- generate self-contained inline-style HTML,
- use stable CSS classes such as `bookmark-card`, `bookmark-featured-image`, `bookmark-content`, `bookmark-title`, and `bookmark-description`,
- wrap generated cards with WordPress custom HTML comments so WordPress treats the fragment as custom HTML.

### YouTube Embed Renderer

Introduce a small URL parser and renderer.

Responsibilities:

- detect supported YouTube URL formats,
- extract the video id,
- generate an iframe embed URL,
- escape values in generated HTML,
- return `undefined` or `null` for non-YouTube URLs so callers can use bookmark card fallback.

## Data Flow

1. `Notion` constructs `NotionToMarkdown`.
2. `Notion` registers custom transformers.
3. `pageToMarkdown()` fetches blocks and calls `blockToMarkdown()` per block.
4. For target blocks, the custom transformer extracts a URL.
5. YouTube URLs become iframe HTML.
6. Other eligible URLs fetch metadata and become bookmark card HTML.
7. The generated raw HTML is stored as the block's `parent` Markdown string.
8. `toMarkdownString()` includes that raw HTML in the Markdown output.
9. `marked.parse()` passes raw HTML through into final HTML.
10. `imageProcessor.processHtmlImages()` processes normal images but skips `.bookmark-card img` thumbnails.
11. WordPress receives final HTML containing bookmark cards and YouTube iframes.

## Image Processing Interaction

Bookmark thumbnails are remote preview assets, not Notion page images. They should not be downloaded and uploaded by the existing image post-processing stage.

`pageProcessor.processHtmlImages()` should call:

```ts
imageProcessor.processHtmlImages(page, html, {
  excludeSelectors: ['.bookmark-card img'],
});
```

If iframe wrappers use thumbnails in the future, those selectors should also be excluded.

## Error Handling

- Missing target URL in a transformed block should return `false` from the custom transformer so `notion-to-md` can use its default renderer.
- Metadata fetch failure should log a warning and return URL-only metadata.
- Bookmark HTML rendering should escape all untrusted text and URLs.
- YouTube URL parsing failure should not throw; non-YouTube URLs should use bookmark fallback.
- Transformer failure should be contained where possible. A metadata fetch failure must not fail the whole page sync.
- Existing image upload failures should keep current behavior and may still fail the page sync.

## Testing

Required unit coverage:

- `bookmark` custom transformer returns bookmark card HTML with fetched metadata.
- metadata fetch falls back to URL-only card on network failure.
- `embed` with YouTube watch URL returns iframe HTML.
- `embed` with `youtu.be` URL returns iframe HTML.
- `video` with external YouTube URL returns iframe HTML.
- non-YouTube `embed` returns bookmark card HTML.
- generated bookmark card HTML escapes title, description, image, and URL values.
- `pageProcessor` excludes `.bookmark-card img` from image upload processing.
- `marked.parse()` preserves generated raw HTML in `getPageHtml()` output.
- mention rich text remains on the default renderer path and is not converted to bookmark cards.

## WordPress HTML Wrapping

Generated bookmark cards and YouTube iframes should be wrapped as WordPress custom HTML blocks:

```html
<!-- wp:html -->
...
<!-- /wp:html -->
```

for generated fragments.

This follows the `Tistory2WordPress` approach and removes ambiguity about how WordPress should preserve the generated HTML.

## Selected Approach

Use `notion-to-md@3.1.9` custom transformers. Do not migrate to v4 alpha. Reuse the proven metadata and bookmark card policy from `Tistory2WordPress`, adapt it into focused services, and keep changes localized around Notion conversion plus image post-processing exclusions.
