import { JobStatus } from '../../db/enum/db.enums.js';
import type { Job } from '../interface/jobProcessor.js';

/**
 * Type representing a job with a non-running status.
 */
export type JobInResult = Job & {
  status: Exclude<JobStatus, JobStatus.Running>;
};

/**
 * Request type for creating a job result.
 */
export type JobResultRequest = {
  /**
   * Indicates whether a job was performed.
   * If false, it means there were no pages to sync.
   */
  isPerformed: boolean;
  /**
   * The job details, or null if no job was performed.
   */
  job: JobInResult | null;
};

/**
 * Response returned after executing a job.
 * Using Special Case Pattern
 */
export interface IJobResult {
  /**
   * Logs the result of the job.
   */
  logResult(): void;
  /**
   * Gets the exit code based on the job status.
   * @returns Exit code: 0 for success, 1 for failure.
   */
  getExitCode(): number;
}
