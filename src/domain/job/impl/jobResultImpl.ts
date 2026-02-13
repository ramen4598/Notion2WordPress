import { JobStatus } from '../../db/enum/db.enums.js';
import { logger } from '../../../lib/logger.js';
import type { IJobResult, JobInResult, JobResultRequest } from '../interface/jobResult.js';

class JobResult implements IJobResult {
  private job: JobInResult;

  constructor(job: JobInResult) {
    this.job = job;
  }

  logResult(): void {
    this.logInfo();
    this.logErrors();
  }

  private logInfo(): void {
    logger.info('Sync completed', {
      jobId: this.job.jobId,
      jobType: this.job.jobType,
      status: this.job.status,
      pagesProcessed: this.job.pagesProcessed,
      pagesSucceeded: this.job.pagesSucceeded,
      pagesFailed: this.job.pagesFailed,
    });
  }

  private logErrors(): void {
    if (this.job.errors.length <= 0) return;
    logger.warn('Sync completed with errors:', {
      errorCount: this.job.errors.length,
      errors: this.job.errors,
    });
  }

  getExitCode(): number {
    return this.job.status === JobStatus.Completed ? 0 : 1;
  }
}

/**
 * Special case class representing an empty job result.
 * Used when there are no pages to sync.
 */
class JobResultEmpty implements IJobResult {
  constructor() {}

  logResult(): void {
    logger.info('No notion pages to sync for this manual job');
  }

  getExitCode(): number {
    return 0;
  }
}

/**
 * Factory class to create IJobResult instances.
 * Based on whether a job was performed or not.
 * @param job The job data or null if no job was performed.
 * @returns An instance of IJobResult.
 */
export class JobResultFactory {
  static create(request: JobResultRequest): IJobResult {
    if (!request.isPerformed || request.job === null) {
      return new JobResultEmpty();
    }
    return new JobResult(request.job);
  }
}
