import { Job } from '../../job/interface/jobProcessor.js';
import { NotionPage } from '../../notion/interface/notion.js';

export type Page = {
  id: number;
  notionPageId: string;
  wpPostId: number | undefined;
  uploadedMediaIds: number[];
};

export type PageError = {
  notionPageId: string;
  pageTitle: string;
  errorMessage: string;
};

export interface IPageProcessor {
  /**
   * Query Notion Pages to sync.
   * @returns A promise that resolves to the list of Notion pages to sync.
   * @throws PageException if the query fails.
   */
  queryPages(): Promise<NotionPage[]>;

  /**
   * Sync a list of Notion pages.
   * @param job - The job context.
   * @param pages - The list of Notion pages to sync.
   * @throws PageException if the sync process fails.
   */
  syncPages(job: Job, pages: NotionPage[]): Promise<void>;

  /**
   * Sync a single Notion page.
   * @param job - The job
   * @param page - The Notion page to sync.
   * @throws PageException if the sync fails.
   */
  syncPage(job: Job, page: NotionPage): Promise<void>;

  /**
   * Create a Page record in the database.
   * @param jobId - The ID of the job.
   * @param notionPageId - The ID of the Notion page.
   * @returns A promise that resolves to the created Page record.
   * @throws PageException if the creation fails.
   */
  createPage(jobId: number, notionPageId: string): Promise<Page>;

  /**
   * Rollback changes made for a Page in case of sync failure.
   * Deletes created WordPress posts and uploaded media.
   * Updates Notion page status to error.
   * Marks the page sync as failed in the database with the error message.
   * @param page - The Page context.
   * @param errorMessage - The error message to record.
   */
  rollback(page: Page, errorMessage: string): void;
}
