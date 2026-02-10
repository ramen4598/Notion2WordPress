import { NotionPageStatus } from '../enum/notion.enums.js';

export interface NotionPage {
  id: string;
  title: string;
  status: NotionPageStatus;
  lastEditedTime: string;
  createdTime: string;
  properties: Record<string, unknown>;
}

export interface NotionBlock {
  id: string;
  type: string;
  [key: string]: unknown; // Index Signature. Allow flexible structure.
}

export interface QueryPagesOptions {
  lastSyncTimestamp?: string;
  statusFilter?: NotionPageStatus;
}

export interface ImageReference {
  blockId: string;
  url: string;
  altText?: string;
  placeholder: string;
}

export interface GetPageHtmlAndImageResponse {
  html: string;
  images: ImageReference[];
}

export interface UpdatePageStatusResponse {
  success: boolean;
  updatedTime: string;
}

export interface INotion {
  /**
   * Query Notion pages from the configured datasource with optional filters.
   * Handles pagination to retrieve all matching pages.
   * @param options - Query options including lastSyncTimestamp and statusFilter.
   * @returns A promise that resolves to an array of NotionPage objects.
   * @throws NotionException if the query fails after retries.
   */
  queryPages(options: QueryPagesOptions): Promise<NotionPage[]>;

  /**
   * Get the HTML content and associated images of a Notion page
   * @param pageId - The ID of the Notion page to retrieve.
   * @returns A promise that resolves to an object containing HTML content and image references.
   * @throws NotionException if the retrieval fails after retries.
   */
  getPageHtmlAndImage(pageId: string): Promise<GetPageHtmlAndImageResponse>;
  
  /**
   * Update the status property of a Notion page.
   * @param pageId - The ID of the Notion page to update.
   * @param status - The new status to set (done or error).
   * @returns A promise that resolves to an object indicating success and the updated time.
   * @throws NotionException if the update fails after retries.
   */
  updatePageStatus(pageId: string, status: NotionPageStatus.Done | NotionPageStatus.Error): Promise<UpdatePageStatusResponse>;
}