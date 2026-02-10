import { JobItemStatus } from '../enum/db.enums.js';

export interface SyncJobItem {
  id?: number;
  sync_job_id: number;
  notion_page_id: string;
  wp_post_id?: number;
  status: JobItemStatus;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}
