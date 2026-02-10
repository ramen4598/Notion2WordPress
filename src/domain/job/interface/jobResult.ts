import { JobStatus } from '../../db/enum/db.enums.js';
import type { Job } from '../interface/jobProcessor.js';

/**
 * Type representing a job with a non-running status.
 */
export type JobInResult = Job & {
  status: Exclude<JobStatus, JobStatus.Running>;
};

/**
 * Request type for creating a sync job result.
 */
export type JobResultRequest = {
    /**
     * Indicates whether a sync job was performed.
     * If false, it means there were no pages to sync.
     */
    isPerformed: boolean;
    /**
     * The sync job details, or null if no job was performed.
     */
    syncJob: JobInResult | null;
}

/**
 * Response returned after executing a sync job.
 * Using Special Case Pattern
 */
export interface IJobResult {
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
