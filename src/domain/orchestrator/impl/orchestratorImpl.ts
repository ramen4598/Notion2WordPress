import type { IOrchestrator } from '../interface/orchestrator.js';
import type { JobInResult, IJobResult, JobResultRequest } from '../../job/interface/jobResult.js';
import type { NotionPage } from '../../notion/interface/notion.js';
import type { Job } from '../../job/interface/jobProcessor.js';
import { pageProcessor } from '../../page/impl/pageProcessorImpl.js';
import { jobProcessor } from '../../job/impl/jobProcessorImpl.js';
import { telegram } from '../../notification/impl/telegram.js';
import { JobType } from '../../db/enum/db.enums.js';
import { logger } from '../../../lib/logger.js';
import { asError } from '../../../lib/utils.js';
import { OrchestratorException } from '../error/orchestrator.error.js';

class Orchestrator implements IOrchestrator {
  async execute(jobType: JobType): Promise<IJobResult> {
    logger.info(`Starting sync: ${jobType}`);

    const pages: NotionPage[] = await this.queryPages();
    if (pages.length <= 0) return this.getEmptyResult();

    const job: Job = this.createJob(jobType);
    await this.doJob(job, pages);
    return this.getResult(job);
  }

  private async queryPages(): Promise<NotionPage[]> {
    try {
      return await pageProcessor.queryPages();
    } catch (error: unknown) {
      const errMsg = 'Failed to query Notion pages for job: ' + asError(error).message;
      await telegram.send(errMsg);
      throw new OrchestratorException('Failed to query pages for job', error);
    }
  }

  private getEmptyResult(): IJobResult {
    return jobProcessor.getJobResult({
      isPerformed: false,
      job: null,
    } as JobResultRequest);
  }

  private getResult(job: Job): IJobResult {
    return jobProcessor.getJobResult({
      isPerformed: true,
      job: job as JobInResult,
    } as JobResultRequest);
  }

  private createJob(jobType: JobType): Job {
    try {
      return jobProcessor.createJob(jobType);
    } catch (error: unknown) {
      throw new OrchestratorException('Failed to create job', error);
    }
  }

  private async doJob(job: Job, pages: NotionPage[]): Promise<void> {
    try {
      await pageProcessor.syncPages(job, pages);
      jobProcessor.endJob(job);
    } catch (error: unknown) {
      this.failJob(job, 'Error occurred during syncPages');
      throw new OrchestratorException('Failed to sync pages for job', error);
    } finally {
      await telegram.send(job);
    }
  }

  private failJob(job: Job, errorMessage: string): void {
    try {
      jobProcessor.failJob(job, errorMessage);
    } catch (error: unknown) {
      throw new OrchestratorException(`Failed to mark job with ID ${job.jobId} as failed`, error);
    }
  }
}

export const orchestrator: IOrchestrator = new Orchestrator();
