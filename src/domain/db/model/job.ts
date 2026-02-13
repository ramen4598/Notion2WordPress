import { JobType, JobStatus } from '../enum/db.enums.js';

export interface JobRow {
  id?: number;
  job_type: JobType;
  status: JobStatus;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  pages_processed: number;
  pages_succeeded: number;
  pages_failed: number;
  last_sync_timestamp?: string;
}
