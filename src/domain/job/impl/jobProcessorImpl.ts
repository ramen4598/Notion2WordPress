import { IJobProcessor, Job } from '../interface/jobProcessor.js';
import { JobResultRequest, IJobResult } from '../interface/jobResult.js';
import { JobResultFactory } from './jobResultImpl.js';
import { JobType, JobStatus } from '../../db/enum/db.enums.js';
import { db } from '../../db/impl/sqlite3.js';
import { logger } from '../../../lib/logger.js';
import { JobException } from '../error/job.error.js';

class JobProcessor implements IJobProcessor {
  createJob(jobType: JobType): Job {
    try {
      const job: Job = {
        jobId: db.createJob(jobType),
        jobType: jobType,
        status: JobStatus.Running,
        pagesProcessed: 0,
        pagesSucceeded: 0,
        pagesFailed: 0,
        errors: [],
      };
      logger.info(`Created job with ID ${job.jobId}`);
      return job;
    } catch (error: unknown) {
      throw new JobException('Failed to create job', error);
    }
  }

  endJob(job: Job): void {
    job.status = job.pagesFailed === 0 ? JobStatus.Completed : JobStatus.Failed;
    try {
      db.updateJob(job.jobId, {
        status: job.status,
        last_sync_timestamp: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
      logger.info(`Job ${job.jobId} ended`);
    } catch (error: unknown) {
      throw new JobException(`Failed to end job with ID ${job.jobId}`, error);
    }
  }

  failJob(job: Job, errMsg: string): void {
    job.status = JobStatus.Failed;
    try {
      db.updateJob(job.jobId, {
        status: job.status,
        error_message: errMsg,
        completed_at: new Date().toISOString(),
      });
    } catch (error: unknown) {
      throw new JobException(`Failed to mark job with ID ${job.jobId} as failed`, error);
    }
    logger.info(`Job ${job.jobId} completed`, {
      pagesProcessed: job.pagesProcessed,
      pagesSucceeded: job.pagesSucceeded,
      pagesFailed: job.pagesFailed,
    });
  }

  getJobResult(request: JobResultRequest): IJobResult {
    return JobResultFactory.create(request);
  }
}

export const jobProcessor: IJobProcessor = new JobProcessor();
