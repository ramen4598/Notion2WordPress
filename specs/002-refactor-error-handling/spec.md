# Refactoring Specification: Error Handling Simplification

**Feature Branch**: `002-refactor-error-handling`
**Created**: 2026-01-21
**Status**: Draft
**Input**: Comparison analysis between Tistory2WordPress error handling patterns and Notion2WordPress current implementation

---

## Overview

This specification outlines the refactoring of Notion2WordPress's error handling system based on the proven, simpler patterns from Tistory2WordPress.

**Approved scope for this refactor**

- Introduce `handleError()` utility and replace repetitive catch blocks.
- Add silent 404 handling in WordPress delete operations (`deletePost`, `deleteMedia`).
- Refactor rollback to be sequential (no fire-and-forget) and use `handleError()`.
- Simplify `syncImages()` error aggregation (no Promise.allSettled aggregation; continue on individual failures).

**Explicitly out of scope**

- Introduce a `withRetry()` wrapper (keep current retry pattern).
- Simplify the logger implementation.

**Target outcome**: reduce error-handling code complexity by ~30–40% while keeping behavior reliable and logs informative.

---

## Problem Analysis

### Tistory2WordPress Error Handling Patterns

Tistory2WordPress demonstrates a simple, effective error handling approach:

**Key Characteristics:**

1. **Simple Logger**: Only 4 methods (debug, info, warn, error) with level-based filtering
2. **Helper Functions**: `getAxiosErrorMessage()` centralizes error message formatting
3. **withRetry() Wrapper**: Encapsulates retry logic for consistent use across services
4. **Silent 404 Handling**: `deleteMedia()` and `deletePost()` treat 404 as non-fatal (warn only, no throw)
5. **Sequential Rollback**: Each rollback operation wrapped in separate try-catch, continues on failure
6. **Error Persistence**: Error messages stored in database (`migrationJobItem.error_message`)

**Core Principle**: Simplicity, clarity, tolerant failures

---

### Notion2WordPress Error Handling Issues

**Identified Problems:**

#### 1. Excessive Repetition (31+ occurrences)

The same error handling pattern repeats throughout the codebase:

```typescript
catch (error: unknown) {
  const err = asError(error);
  logger.error(..., err);
  throw new Error(...);
}
```

**Locations:**

- `syncOrchestrator.ts`: 9 occurrences
- `db/index.ts`: 7 occurrences
- `wpService.ts`: 4 occurrences
- `notionService.ts`: 3 occurrences
- `telegramService.ts`: 2 occurrences
- `imageDownloader.ts`: 1 occurrence
- `index.ts`: 1 occurrence
- `syncManual.ts`: 1 occurrence

#### 2. Nested Try-Catch Blocks

- `syncOrchestrator.ts:170-221`: Nested try-catch for rollback within error handler
- `index.ts:24-50`: Cron scheduler with nested try-catch

#### 3. Complex Error Aggregation

- `syncOrchestrator.ts:238-264`: `syncImages()` uses Promise.allSettled with manual error collection
- Collects all results, iterates to extract errors, joins error messages, throws aggregate error

#### 4. Inconsistent Rollback Error Handling

- Mixed pattern: Some operations use `.catch()`, others use try-catch
- Line 346 comment warns: "Fire-and-forget. if edit code, this can cause race conditions. Be careful."
- No coordination or sequencing between rollback operations
- No transaction guarantee - partial rollbacks possible

#### 5. Overly Verbose Retry Wrappers (Out of Scope)

Each service method defines its own retry wrapper with slight variations:

- `wpService.ts`: 4 retry implementations
- `notionService.ts`: 3 retry implementations
- `telegramService.ts`: 1 retry implementation
- `imageDownloader.ts`: 1 retry implementation

This refactor explicitly does **not** introduce a `withRetry()` wrapper (keeps current retry shape).

#### 6. Complex Logger (Out of Scope)

- `error()` method includes special Error handling and stack trace logging
- Logger simplification is explicitly **out of scope** for this refactor

---

## Refactoring Recommendations

### Recommendation 1: Centralized Error Handler Utility

**Problem**: Repetitive error handling pattern used 31+ times
**Solution**: Create `handleError()` utility function

```typescript
// src/lib/errorHandler.ts
export function handleError(
  logger: Logger,
  context: string,
  error: unknown,
  shouldThrow: boolean = true,
  contextData?: Record<string, unknown>
): Error {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(`${context} - failed`, { error: err.message, ...contextData });
  if (shouldThrow) throw err;
  return err;
}

// Usage example
async createDraftPost(options: CreatePostOptions): Promise<CreatePostResponse> {
  const fn = async () => { /* ... */ };
  try {
    return await retryWithBackoff(fn, { onRetry: onRetryFn });
  } catch (error) {
    return handleError(logger, 'createDraftPost', error, true, { title: options.title });
  }
}
```

**Impact**: Eliminates 31+ repetitions of same pattern

---

### Recommendation 2: Simplify WpService with Silent 404 Handling

**Problem**: Delete operations throw errors on 404, causing unnecessary complexity
**Solution**: Treat 404 as non-fatal, similar to Tistory2WordPress

```typescript
async deleteMedia(mediaId: number): Promise<void> {
  try {
    await this.client.delete(`/wp/v2/media/${mediaId}`, { params: { force: true } });
    logger.info(`Deleted WordPress media: ${mediaId}`);
  } catch (error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;

    if (axiosError.isAxiosError && status === 404) {
      logger.warn(`WordPress media already absent: ${mediaId}`);
      return; // Silent return on 404
    }

    const message = this.getAxiosErrorMessage(error);
    logger.error(`Failed to delete media ${mediaId}`, { error: message });
    throw new Error(`WordPress media deletion failed: ${message}`);
  }
}
```

**Impact**: Simplifies rollback logic, reduces error handling complexity

---

### Recommendation 3: Standardize Rollback Pattern with handleError

**Problem**: Inconsistent error handling in rollback (mixed `.catch()` and try-catch)
**Solution**: Use sequential try-catch pattern consistently with `handleError()`

```typescript
private async rollback(syncJobItem: SyncJobItem, errorMessage: string): Promise<void> {
  const { id: jobItemId, pageId: notionPageId, wpPostId, uploadedMediaIds } = syncJobItem;
  logger.warn(`Rolling back sync for page ${notionPageId}`);

  // Sequential rollback - if one fails, continue with next
  for (const mediaId of uploadedMediaIds) {
    try {
      await wpService.deleteMedia(mediaId);
    } catch (rollbackError) {
      handleError(logger, 'rollback.deleteMedia', rollbackError, false, { mediaId, pageId: notionPageId });
    }
  }

  if (wpPostId) {
    try {
      await wpService.deletePost(wpPostId);
    } catch (rollbackError) {
      handleError(logger, 'rollback.deletePost', rollbackError, false, { wpPostId, pageId: notionPageId });
    }
  }

  try {
    await notionService.updatePageStatus(notionPageId, NPStatus.Error);
  } catch (rollbackError) {
    handleError(logger, 'rollback.updatePageStatus', rollbackError, false, { pageId: notionPageId });
  }

  if (jobItemId) {
    try {
      db.updateSyncJobItem(jobItemId, {
        status: JobItemStatus.Failed,
        error_message: errorMessage,
      });
    } catch (error) {
      handleError(logger, 'rollback.updateJobItem', error, false, { jobItemId, pageId: notionPageId });
    }
  }
}
```

**Impact**: Removes "fire-and-forget" anti-pattern, improves reliability, uses centralized error handling

---

### Recommendation 4: Simplify Error Aggregation

**Problem**: Complex Promise.allSettled with manual error collection
**Solution**: Log failures but don't throw aggregate error

```typescript
private async syncImages(
  syncJobItem: SyncJobItem,
  imageMap: Map<string, string>,
  images: ImageReference[]
): Promise<void> {
  const maxConcurrent = config.maxConcurrentImageDownloads;

  for (let i = 0; i < images.length; i += maxConcurrent) {
    logger.info(
      `Syncing images ${i + 1} to ${Math.min(i + maxConcurrent, images.length)} of ${images.length}`
    );
    const batch = images.slice(i, i + maxConcurrent);

    await Promise.all(batch.map((image) =>
      this.syncImage(syncJobItem, imageMap, image).catch((error) => {
        handleError(logger, 'syncImage', error, false, {
          blockId: image.blockId,
          pageId: syncJobItem.pageId,
        });
      })
    ));
  }

  // Warn about failures but don't throw aggregate error
  const failedCount = db.getImageAssetsByJobItem(syncJobItem.id)
    .filter((asset) => asset.status === ImageAssetStatus.Failed).length;

  if (failedCount > 0) {
    logger.warn(`syncImages completed with ${failedCount} failed images`, {
      pageId: syncJobItem.pageId,
      jobItemId: syncJobItem.id,
    });
  }
}
```

**Impact**: Reduces complexity, more tolerant of partial failures, uses centralized error handling

---

## Implementation Plan

### Phase 1: High Priority (Immediate)

1. **Create centralized error handler utility**
   - File: `src/lib/errorHandler.ts`
   - Function: `handleError(logger, context, error, shouldThrow, contextData)`
   - Replace all repetitive catch blocks with `handleError()` (31 locations)

2. **Simplify WpService delete operations**
   - Add silent 404 handling to `deleteMedia()` and `deletePost()`
   - Follow Tistory2WordPress pattern

3. **Standardize rollback pattern with handleError**
   - Refactor `syncOrchestrator.ts:rollback()` method
   - Replace mixed `.catch()` and try-catch with consistent try-catch
   - Apply `handleError()` to all rollback operations
   - Ensure all rollback operations are logged appropriately

4. **Simplify error aggregation**
   - Refactor `syncImages()` to use simpler error handling
   - Remove Promise.allSettled complexity and manual error collection
   - Apply `handleError()` to individual image sync failures
   - Log failures but continue processing (no aggregate error throw)

**Estimated Effort**: 4-6 hours
**Estimated Code Reduction**: ~30-40%

---

## References

- Tistory2WordPress codebase: `tmp/Tistory2WordPress/src/services/`
- Tistory2WordPress error handling analysis: See comparison in Overview section
- Current Notion2WordPress error handling: `src/services/`, `src/orchestrator/`, `src/lib/`
