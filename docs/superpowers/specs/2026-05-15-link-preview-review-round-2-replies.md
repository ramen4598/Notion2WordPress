# Link Preview Review Round 2 Replies

**Date**: 2026-05-15

## Accepted Responses

1. `linkPreview.ts` remains the public domain entrypoint.
   The internal transformer implementation changed, but the external import surface is intentionally still `src/domain/linkPreview/linkPreview.ts`.

2. The transformer class and interface abstraction were removed.
   `linkPreviewTransformerImpl` and `ILinkPreviewTransformer` were deleted in favor of the function-based module at `src/domain/linkPreview/lib/linkPreviewTransformer.ts`.

3. `bookmarkTemplate.ts` was restored toward `Tistory2WordPress` parity.
   The bookmark card structure and styling now align with the parity target more closely than the earlier refactor variant.

4. Successful bookmark rendering is still wrapped as a WordPress HTML block.
   The `<!-- wp:html --> ... <!-- /wp:html -->` wrapper now lives in the transformer layer around successful bookmark-card rendering instead of inside `bookmarkTemplate.ts`.

5. Wrapper removal is limited to the raw fallback returned from the `renderFallbackBookmark()` catch branch.
   This is the only path that now returns a bare `<figure class="bookmark-card">...</figure>` without the WordPress HTML block wrapper, and reply wording should stay constrained to that case.

## Verification Notes

- Searched for stale abstraction names with `rg -n "linkPreviewTransformerImpl|ILinkPreviewTransformer" src tests/unit`.
- No remaining references were found in `src` or `tests/unit`.
