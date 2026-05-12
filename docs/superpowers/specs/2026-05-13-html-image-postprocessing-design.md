# HTML Image Post-Processing Design

**Date**: 2026-05-13

## Summary

Issue #25 will move all image handling to a single HTML post-processing stage that runs after Notion content has already been converted to HTML. The new design removes the placeholder contract between the Notion layer and the image layer, parses the final HTML with `cheerio`, uploads eligible `<img>` assets to WordPress, and rewrites each processed node's `src` attribute in place.

This design keeps page-level rollback semantics unchanged. If any eligible image fails to download or upload, page sync still fails and existing rollback deletes any media or post created earlier in the pipeline.

## Goals

- Remove placeholder-based image replacement.
- Ensure modules before HTML generation do not need image-specific behavior unless there is a strong reason.
- Centralize image parsing, filtering, upload, and URL rewriting in one stage.
- Default to processing every `<img>` in the generated HTML.
- Leave room for future CSS selector exclusions, such as link preview thumbnails that should keep their external URLs.

## Non-Goals

- No partial-success image policy. A single eligible image failure still fails the page sync.
- No selector include mode in this change.
- No redesign of rollback behavior.
- No attempt to preserve or reuse the old `ImageReference` plus placeholder flow.
- No special-case handling yet for future link preview content beyond designing for selector-based exclusion.

## Current Problems

The current pipeline splits image handling across two layers:

- `notionImpl` extracts image references from markdown-like block content and replaces source URLs with placeholders before HTML generation.
- `imageProcessor` uploads those extracted images and later replaces placeholder strings inside the rendered HTML.

This creates an unnecessary contract between extraction and replacement, spreads image logic across multiple phases, and makes future HTML-aware features harder to add.

## Notion Layer

`notionImpl` should return HTML only. It should no longer:

- extract `ImageReference` records,
- assign placeholders,
- mutate markdown block image URLs before rendering.

Its responsibility becomes: fetch page content, normalize callouts as needed for correct markdown generation, convert to HTML, and return that HTML.

## Page Orchestration Layer

`pageProcessor` should keep orchestration responsibility but change the sequence to:

1. Fetch HTML from Notion.
2. Run HTML image post-processing.
3. Create the WordPress post with the rewritten HTML.

Rollback behavior remains unchanged.

## HTML Image Post-Processing Layer

The image layer becomes the single owner of image handling after HTML generation.

Responsibilities:

- parse HTML with `cheerio`,
- select candidate `<img>` nodes,
- exclude nodes that match configured CSS selectors,
- download and upload remaining images,
- rewrite each processed node's `src` attribute with the uploaded WordPress media URL,
- serialize and return the final HTML.

The important contract change is that replacement is no longer based on string placeholders. The processor directly mutates the DOM node it is currently handling.

## Filtering Model

The default behavior is:

- base selector: `img`
- exclusion model: `excludeSelectors`

In other words, every `<img>` is eligible by default, and specific selectors can opt nodes out of processing.

This matches the intended future link preview behavior, where preview thumbnails can keep their external `src` values by excluding a selector such as `.link-preview img`.

This change only establishes the exclusion model and extension point. It does not require the link preview feature to exist now.

## Data Flow

1. Notion content is converted to final HTML.
2. The HTML processor loads the HTML into `cheerio`.
3. It collects candidate `<img>` elements from the DOM.
4. It removes any nodes matched by `excludeSelectors`.
5. For each remaining node:
   - read `src`,
   - validate that `src` exists and is usable,
   - download the source image,
   - upload it to WordPress,
   - record uploaded media for rollback,
   - replace that node's `src` with the new WordPress URL.
6. The processor serializes the updated DOM back to HTML.
7. `pageProcessor` sends the rewritten HTML to WordPress post creation.

This keeps image matching simple because each image is updated through the DOM node already being processed. No placeholder lookup table is needed.

## Error Handling

- If a processed image fails to download or upload, the image processor throws and page sync fails.
- Any successfully uploaded media IDs must still be pushed into the page rollback context so rollback can delete them.
- Excluded images are not downloaded, uploaded, or rewritten.
- If an eligible `<img>` lacks a valid `src`, that is treated as an error rather than silently ignored.
- HTML with no eligible `<img>` elements should pass through unchanged.

## Interfaces and Boundaries

The exact naming can be decided in implementation, but the boundaries should follow these rules:

- The Notion interface should no longer expose image-specific data together with HTML.
- The image processing interface should operate on HTML, not on previously extracted image metadata.
- The page processor should depend only on a single HTML post-processing step rather than coordinating extraction and later replacement separately.

This can be implemented either by evolving the existing `imageProcessor` contract or by introducing a more specific HTML post-processing method behind the same domain boundary. The key requirement is a single post-HTML responsibility center.

## Testing

Required coverage:

- rewrites a single `<img>` `src` to the uploaded WordPress URL,
- rewrites multiple images independently,
- leaves excluded selector matches unchanged,
- passes HTML with no images through unchanged,
- fails when an eligible image has an invalid or empty `src`,
- fails the page sync when any eligible image upload fails,
- preserves rollback tracking for any already-uploaded media.

Tests should focus on HTML-driven behavior rather than the removed placeholder flow.

## Migration Notes

- Remove `ImageReference` and placeholder-specific logic where it becomes dead code.
- Add `cheerio` as a dependency.
- Update unit tests that currently reflect markdown placeholder extraction.
- Replace or remove fixtures whose only purpose was validating placeholder behavior.

## Open Decisions Already Resolved

- Image handling moves fully to the post-HTML stage.
- Default target is all `<img>` elements.
- Future extensibility uses selector-based exclusion, not inclusion.
- Link preview thumbnails are expected to remain on external URLs by exclusion rather than by introducing a separate image pipeline.
