# Tasks: 002-refactor-error-handling

- [ ] Create `src/lib/errorHandler.ts` with `handleError(logger, context, error, shouldThrow, contextData)`
- [ ] Replace repetitive catch blocks with `handleError()` in `src/orchestrator/syncOrchestrator.ts`
- [ ] Replace repetitive catch blocks with `handleError()` in `src/db/index.ts`
- [ ] Replace repetitive catch blocks with `handleError()` in `src/services/wpService.ts` (keep retry structure)
- [ ] Replace repetitive catch blocks with `handleError()` in `src/services/notionService.ts`
- [ ] Replace repetitive catch blocks with `handleError()` in `src/services/telegramService.ts`
- [ ] Replace repetitive catch blocks with `handleError()` in `src/lib/imageDownloader.ts`
- [ ] Replace repetitive catch blocks with `handleError()` in `src/index.ts`
- [ ] Replace repetitive catch blocks with `handleError()` in `src/cli/syncManual.ts`
- [ ] Add silent 404 handling to `wpService.deletePost()` (warn + return; no throw)
- [ ] Add silent 404 handling to `wpService.deleteMedia()` (warn + return; no throw)
- [ ] Refactor `syncOrchestrator.rollback()` to be sequential (no fire-and-forget) and use `handleError()`
- [ ] Simplify `syncOrchestrator.syncImages()` to avoid Promise.allSettled aggregation and continue on individual image failures (log via `handleError()`)
- [ ] Run typecheck/tests and fix only issues caused by this refactor


- See [spec.md](spec.md) for detailed specifications and examples.