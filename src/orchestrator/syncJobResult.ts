import { JobStatus } from '../enums/db.enums.js';
import { SyncJob } from './syncOrchestrator.js';
import { logger } from '../lib/logger.js';

/**
 * Type representing a sync job with a non-running status.
 */
export type SyncJobInResult = SyncJob & {
  status: Exclude<JobStatus, JobStatus.Running>;
};

/**
 * Response returned after executing a sync job.
 */
export interface ISyncJobResult {
  /**
   * Logs the result of the sync job.
   */
  logResult(): void;
  /**
   * Gets the exit code based on the sync job status.
   * @returns Exit code: 0 for success, 1 for failure.
   */
  getExitCode(): number;
}

class SyncJobResult implements ISyncJobResult {
  private syncJob: SyncJobInResult;

  constructor(syncJob: SyncJobInResult) {
    this.syncJob = syncJob;
  }

  logResult(): void {
    this.logInfo();
    this.logErrors();
  }

  private logInfo(): void {
    logger.info('Sync completed', {
      jobId: this.syncJob.jobId,
      JobType: this.syncJob.jobType,
      status: this.syncJob.status,
      pagesProcessed: this.syncJob.pagesProcessed,
      pagesSucceeded: this.syncJob.pagesSucceeded,
      pagesFailed: this.syncJob.pagesFailed,
    });
  }

  private logErrors(): void {
    if (this.syncJob.errors.length <= 0) return;
    logger.error('Sync completed with errors:', {
      errorCount: this.syncJob.errors.length,
      errors: this.syncJob.errors,
    });
  }

  getExitCode(): number {
    return this.syncJob.status === JobStatus.Completed ? 0 : 1;
  }
}

/**
 * Special case class representing an empty sync job result.
 * Used when there are no pages to sync.
 */
class SyncJobResultEmpty implements ISyncJobResult {
  constructor() {}

  logResult(): void {
    logger.info('No pages to sync for this manual job');
  }

  getExitCode(): number {
    return 0;
  }
}

/**
 * Request type for creating a sync job result.
 */
export type SyncJobResultFactoryRequest = {
    /**
     * Indicates whether a sync job was performed.
     * If false, it means there were no pages to sync.
     */
    isPerformed: boolean;
    syncJob: SyncJobInResult | null;
}

/**
 * Factory class to create ISyncJobResult instances.
 * Based on whether a sync job was performed or not.
 * @param syncJob The sync job data or null if no job was performed.
 * @returns An instance of ISyncJobResult.
 */
export class SyncJobResultFactory {
  static create(request: SyncJobResultFactoryRequest): ISyncJobResult {
    if (!request.isPerformed || request.syncJob === null) {
      return new SyncJobResultEmpty();
    }
    return new SyncJobResult(request.syncJob);
  }
}
