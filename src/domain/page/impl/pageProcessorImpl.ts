import type { IPageProcessor } from '../interface/pageProcessor.js';
import type { Job } from '../../job/interface/jobProcessor.js';
import type { PageError, Page } from '../../page/interface/pageProcessor.js';
import type { ImageReference, NotionPage } from '../../notion/interface/notion.js';
import type { Placeholder2WpUrlMap } from '../../image/interface/imageProcessor.js';
import { PageException } from '../error/page.error.js';
import { NotionPageStatus as NPStatus } from '../../notion/enum/notion.enums.js';
import { JobStatus, JobItemStatus } from '../../db/enum/db.enums.js';
import { logger } from '../../../lib/logger.js';
import { asError } from '../../../lib/utils.js';
import { db } from '../../db/impl/sqlite3.js';
import { wordPress } from '../../wordPress_tmp/impl/wordPressImpl.js';
import { notion } from '../../notion/impl/notionImpl.js';
import { imageProcessor } from '../../image/impl/imageProcessorImpl.js';

export class PageProcessor implements IPageProcessor {
  
  async queryPages(): Promise<NotionPage[]> {
    const lastSyncTimestamp = this.getLastSyncTimestamp();
    const nPages = await this.queryPagesToNotion(lastSyncTimestamp);
    logger.info(`Queried ${nPages.length} pages from Notion ${lastSyncTimestamp ? 'since last sync timestamp: ' + lastSyncTimestamp : ''}`);
    return nPages;
  }

  private getLastSyncTimestamp(): string | undefined {
    try {
      return db.getLastSyncTimestamp();
    } catch (error: unknown) {
      throw new PageException('Failed to get last sync timestamp', error);
    }
  }

  private async queryPagesToNotion(lastSyncTimestamp: string | undefined): Promise<NotionPage[]> {
    try {
      return await notion.queryPages({
        lastSyncTimestamp: lastSyncTimestamp,
        statusFilter: NPStatus.Adding,
      });
    } catch (error: unknown) {
      logger.warn('Failed to query Notion pages', asError(error));
      throw new PageException('Failed to query Notion pages', error);
    }
  }

  async syncPages(job: Job, nPages: NotionPage[]): Promise<void> {
    logger.info(`Found ${nPages.length} pages to sync`);

    for (const nPage of nPages) {
      job.pagesProcessed++;
      logger.info(`Processing page ${job.pagesProcessed}/${nPages.length}: ${nPage.title}`, {
        pageId: nPage.id,
      });

      await this.syncPage(job, nPage);
      this.updateJobAfterSyncPage(job);
    }
  }

  private updateJobAfterSyncPage(job: Job): void {
    try {
      db.updateSyncJob(job.jobId, {
        status: JobStatus.Completed,
        pages_processed: job.pagesProcessed,
        pages_succeeded: job.pagesSucceeded,
        pages_failed: job.pagesFailed,
      });
    } catch (error: unknown) {
      throw new PageException('Failed to update sync job after syncing page', error);
    }
  }

  async syncPage (job: Job, nPage: NotionPage): Promise<void> {
    const page: Page = await this.createPage(job.jobId, nPage.id);
    try {
      await this.syncPageWithRollback(page, nPage);
      this.updateJobAfterSyncPageSuccess(job, nPage);
    } catch (error: unknown) {
      this.updateJobAfterSyncPageFailure(job, nPage, error);
      // Throw nothing to continue processing other pages
    }
  }

  // Update job stats on successful page sync
  private updateJobAfterSyncPageSuccess(job: Job, nPage: NotionPage): void {
    job.pagesSucceeded++;
    logger.info(`Successfully synced page: ${nPage.title}`);
  }

  private updateJobAfterSyncPageFailure(job: Job, nPage: NotionPage, error: unknown): void {
    job.pagesFailed++;
    const syncError: PageError = {
      notionPageId: nPage.id,
      pageTitle: nPage.title,
      errorMessage: asError(error).message,
    };
    job.errors.push(syncError);
    logger.warn(`Failed to sync page: ${nPage.title}`, asError(error));
  }

  async createPage(jobId: number, notionPageId: string): Promise<Page> {
    try {
      const page = db.createSyncJobItem({
        sync_job_id: jobId,
        notion_page_id: notionPageId,
        status: JobItemStatus.Pending,
      });
      logger.info(`Created Page record for Notion page ${notionPageId} with ID ${page}`);
      return {
        id: page,
        notionPageId: notionPageId,
        wpPostId: undefined,
        uploadedMediaIds: [],
      };
    } catch (error: unknown) {
      logger.warn(`Failed to create Page record for Notion page ${notionPageId}`, asError(error));
      throw new PageException(`Failed to create Page record for Notion page ${notionPageId}`, error);
    }
  }

  private async syncPageWithRollback(page: Page, nPage: NotionPage): Promise<void> {
    try {
      const { html, images } = await this.getHtmlAndImage(nPage.id);
      const finalHtml = await this.uploadImages(page, html, images);
      await this.createPost(page, nPage.title, finalHtml);
    } catch (error: unknown) {
      await this.rollback(page, asError(error).message);
      throw error;
    }
  }

  private async getHtmlAndImage(nPageId: string): Promise<{ html: string; images: ImageReference[] }> {
    const { html, images } =  await this.getHtmlAndImageFromNotion(nPageId);
    await this.updateNotionPageStatusToDone(nPageId);
    return { html, images };
  }

  private async updateNotionPageStatusToDone(notionPageId: string): Promise<void> {
    try {
      await notion.updatePageStatus(notionPageId, NPStatus.Done);
    } catch (error: unknown) {
      throw new PageException(`Failed to update Notion page ${notionPageId} status to Done`, error);
    }
  }

  private async getHtmlAndImageFromNotion(nPageId: string): Promise<{ html: string; images: ImageReference[] }> {
    try {
      return await notion.getPageHtmlAndImage(nPageId);
    } catch (error: unknown) {
      throw new PageException(`Failed to get HTML for Notion page ${nPageId}`, error);
    }
  }

  private async uploadImages(page: Page, html: string, images: ImageReference[]): Promise<string> {
    try {
      const imageMap: Placeholder2WpUrlMap = await imageProcessor.syncImages(page, images);
      return await imageProcessor.replaceImageUrls(html, imageMap);
    } catch (error: unknown) {
      throw new PageException(`Failed to upload images for Notion page ${page.notionPageId}`, error);
    }
  }

  private async createPost(page: Page, title: string, finalHtml: string): Promise<void> {
    await this.createPostToWordPress(page, title, finalHtml);
    this.updateDbAfterPostCreation(page);
  }

  private async createPostToWordPress(page: Page, title: string, finalHtml: string): Promise<void> {
    const post = await wordPress.createPost({
      title: title,
      content: finalHtml
    });
    page.wpPostId = post.id;
  }

  private updateDbAfterPostCreation(page: Page): void {
    try {
      db.updateSyncJobItem(page.id, {
        wp_post_id: page.wpPostId,
        status: JobItemStatus.Success,
      });
      db.createPagePostMap({
        notion_page_id: page.notionPageId,
        wp_post_id: page.wpPostId!,
      });
    } catch (error: unknown) {
      throw new PageException(`Failed to update DB after creating post for Notion page ${page.notionPageId}`, error);
    }
  }

  async rollback(page: Page, errorMessage: string): Promise<void> {
    const { id: pageId, notionPageId, wpPostId, uploadedMediaIds } = page;
    logger.warn(`Rolling back sync for page ${notionPageId}`);

    // Delete uploaded media
    for (const mediaId of uploadedMediaIds) {
      await wordPress.deleteMedia(mediaId).catch((error: unknown) => {
        logger.warn(`Failed to delete media ${mediaId} during rollback`, asError(error));
      });
    }

    // Delete WordPress post if created
    if (wpPostId) {
      await wordPress.deletePost(wpPostId).catch((error: unknown) => {
        logger.warn(`Failed to delete post ${wpPostId} during rollback`, asError(error));
      });
    }

    await notion.updatePageStatus(notionPageId, NPStatus.Error).catch((error: unknown) => {
      logger.warn(`Failed to update Notion page ${notionPageId} status during rollback`, asError(error));
    });

    // Mark job item as failed
    if (pageId) {
      try {
        db.updateSyncJobItem(pageId, {
          status: JobItemStatus.Failed,
          error_message: errorMessage,
        });
      } catch (error: unknown) {
        logger.warn(`Failed to update page ${pageId} status`, asError(error));
      }
    }
  }
}

export const pageProcessor: IPageProcessor = new PageProcessor();
