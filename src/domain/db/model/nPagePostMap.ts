/**
 * Mapping between a Notion page and a WordPress post.
 */
export interface NotionPagePostMap {
  id?: number;
  notion_page_id: string;
  wp_post_id: number;
  created_at?: string;
}
