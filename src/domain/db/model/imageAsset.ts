import { ImageAssetStatus } from '../enum/db.enums.js';

export interface ImageAsset {
  id?: number;
  sync_job_item_id: number;
  notion_page_id: string;
  notion_block_id: string;
  notion_url: string;
  wp_media_id?: number;
  wp_media_url?: string;
  status: ImageAssetStatus;
  error_message?: string;
  created_at?: string;
}
