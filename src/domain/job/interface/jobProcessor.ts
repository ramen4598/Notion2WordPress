import { JobType, JobStatus} from '../../db/enum/db.enums.js';
import { type PageError } from '../../page/interface/pageProcessor.js';
import type { IJobResult, JobResultRequest } from '../interface/jobResult.js';

/**
 * Sync job representing the overall synchronization process.
 * Tracks any errors encountered during sync of multiple pages.
 */
export type Job = {
  jobId: number;
  jobType: JobType;
  status: JobStatus;
  pagesProcessed: number;
  pagesSucceeded: number;
  pagesFailed: number;
  errors: PageError[]; // Errors for individual page sync failures
};

export interface IJobProcessor {
  /**
   * Creates a new job record in the database.
   * @param jobType - The type of job.
   * @returns A promise that resolves to the created job.
   * @throws JobException if the job creation fails.
   */
  createJob(jobType: JobType): Job;

  /**
   * Ends the job by updating its status and completion timestamp.
   * @param job - The job to be ended.
   * @throws JobException if updating the job fails.
   */
  endJob(job: Job): void;

  /**
   * Fails the job by updating its status and recording the error message.
   * @param job - The job to be marked as failed.
   * @param errMsg - The error message to record.
   * @throws JobException if updating the job fails.
   */
  failJob(job: Job, errMsg: string): void;

  /**
   * Generates a job result based on the provided request.
   * @param request - The job result request data.
   * @returns An instance of IJobResult representing the job outcome.
   */
  getJobResult(request: JobResultRequest): IJobResult;
}