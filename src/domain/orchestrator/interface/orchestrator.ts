import { JobType } from '../../db/enum/db.enums.js';
import { IJobResult } from '../../job/interface/jobResult.js';

export interface IOrchestrator {
  /**
   * Executes a synchronization job between Notion and WordPress.
   * Main entry point to execute a job
   * Flow : Job -> Pages -> Page -> Images -> Image
   * @param jobType - The type of job to execute.
   * @returns A promise that resolves to the result of the job execution.
   * @throws OrchestratorException
   */
  execute(jobType: JobType): Promise<IJobResult>;
}
