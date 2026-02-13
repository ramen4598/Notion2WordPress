import { PageStatus } from '../enum/db.enums.js';

export interface PageRow {
  id?: number;
  job_id: number;
  notion_page_id: string;
  wp_post_id?: number;
  status: PageStatus;
  error_message?: string;
  created_at?: string;
  updated_at?: string;
}
