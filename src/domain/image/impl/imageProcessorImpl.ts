import type { IImageProcessor, Placeholder2WpUrlMap, Placeholder2WpUrlRecord } from '../interface/imageProcessor.js';
import type { ImageReference } from '../../notion/interface/notion.js';
import type { WpMedia } from '../../wordPress_tmp/interface/wordPress.js';
import type { Page } from '../../page/interface/pageProcessor.js';
import type { DownloadImageResponse } from '../interface/imageDownloader.js';
import { ImageProcessException } from '../error/image.error.js';
import { ImageAssetStatus } from '../../db/enum/db.enums.js';
import { imageDownloader } from './notionImgDownloader.js';
import { wordPress } from '../../wordPress_tmp/impl/wordPressImpl.js';
import { db } from '../../db/impl/sqlite3.js';
import { logger } from '../../../lib/logger.js';
import { config } from '../../../config/config.js';
import { asError } from '../../../lib/utils.js';

class ImageProcessor implements IImageProcessor {
  async syncImages(page: Page, images: ImageReference[]): Promise<Placeholder2WpUrlMap> {
    const results: PromiseSettledResult<Placeholder2WpUrlRecord>[] = await this.syncImagesInBatches(
      page,
      images
    );
    this.handleErrors(results);
    return this.buildImageMapFromResults(results);
  }

  private buildImageMapFromResults(
    results: PromiseSettledResult<Placeholder2WpUrlRecord>[]
  ): Placeholder2WpUrlMap {
    const map: Placeholder2WpUrlMap = new Map();
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const record = result.value;
        for (const [placeholder, wpUrl] of Object.entries(record)) {
          map.set(placeholder, wpUrl);
        }
      }
    });
    return map;
  }

  private handleErrors(results: PromiseSettledResult<Placeholder2WpUrlRecord>[]): void {
    const errors: Error[] = [];
    results.forEach((result) => {
      if (result.status === 'rejected') {
        errors.push(new Error(result.reason));
      }
    });
    if (errors.length < 1) return;
    logger.warn(`handleErrors - ${errors.length} image sync failures`);
    throw new ImageProcessException(`Failed to sync ${errors.length} images`, errors);
  }

  private async syncImagesInBatches(
    page: Page,
    images: ImageReference[]
  ): Promise<PromiseSettledResult<Placeholder2WpUrlRecord>[]> {
    const results: PromiseSettledResult<Placeholder2WpUrlRecord>[] = [];
    const maxConcurrent = config.maxConcurrentImageDownloads;

    for (let i = 0; i < images.length; i += maxConcurrent) {
      logger.debug(
        `imageProcessor - Syncing images ${i + 1} to ${Math.min(i + maxConcurrent, images.length)} of ${images.length}`
      );
      const batch = images.slice(i, i + maxConcurrent);
      const promises: Promise<Placeholder2WpUrlRecord>[] = batch.map((image) =>
        this.syncImage(page, image)
      );
      const batchResults = await Promise.allSettled(promises);
      results.push(...batchResults);
    }
    return results;
  }

  async syncImage(page: Page, image: ImageReference): Promise<Placeholder2WpUrlRecord> {
    const assetId = this.createImageAsset(page, image);

    try {
      const {
        filename: ogfname,
        buffer,
        hash,
        contentType,
      } = await this.downloadImage(image);
      const extension = this.getExtensionFromContentType(contentType);
      const filename = `${ogfname}-${hash.substring(0, 16)}.${extension}`;

      const media: WpMedia = await this.uploadImageToWordPress(buffer, filename, contentType, image.altText);
      page.uploadedMediaIds.push(media.id);
      this.updateImageAssetAsUploaded(assetId, media);

      logger.debug(`imageProcessor - Uploaded image: ${filename} -> ${media.url}`);
      return { [image.placeholder]: media.url };
    } catch (error: unknown) {
      const err = asError(error);
      this.updateImageAssetAsFailed(assetId, err.message);
      logger.warn(`Failed to upload image from block ${image.blockId} : ${err.message}`);
      throw error;
    }
  }

  private createImageAsset(page: Page, image: ImageReference): number {
    try {
      return db.createImageAsset({
        sync_job_item_id: page.id,
        notion_page_id: page.notionPageId,
        notion_block_id: image.blockId,
        notion_url: image.url,
        status: ImageAssetStatus.Pending,
      });
    } catch (error: unknown) {
      throw new ImageProcessException('Failed to create image asset', error);
    }
  }

  private async downloadImage(image: ImageReference): Promise<DownloadImageResponse> {
    try {
      return await imageDownloader.download({
        url: image.url,
      });
    } catch (error: unknown) {
      throw new ImageProcessException(`Failed to download image from URL: ${image.url}`, error);
    }
  }

  private async uploadImageToWordPress(buffer: Buffer, filename: string, contentType: string, altText: string | undefined): Promise<WpMedia> {
    try {
      return await wordPress.uploadMedia({
        buffer,
        filename,
        contentType,
        altText: altText,
      });
    } catch (error: unknown) {
      throw new ImageProcessException(`Failed to upload image to WordPress: ${filename}`, error);
    }
  }

  private updateImageAssetAsUploaded(assetId: number, media: WpMedia): void {
    try {
      db.updateImageAsset(assetId, {
        wp_media_id: media.id,
        wp_media_url: media.url,
        status: ImageAssetStatus.Uploaded,
      });
    } catch (error: unknown) {
      throw new ImageProcessException(`Failed to update image asset as uploaded: ${assetId}`, error);
    }
  }

  private updateImageAssetAsFailed(assetId: number, errMsg: string): void {
    try {
      db.updateImageAsset(assetId, {
        status: ImageAssetStatus.Failed,
        error_message: errMsg,
      });
    } catch (error: unknown) {
      throw new ImageProcessException(`Failed to update image asset as failed: ${assetId}`, error);
    }
  }

  async replaceImageUrls(html: string, imageMap: Map<string, string>): Promise<string> {
    let updatedHtml = html;

    // logger.debug(`replaceImageUrls: before process - HTML: ${html}`);
    // logger.debug(`replaceImageUrls: before process - imageMap: ${JSON.stringify(Array.from(imageMap.entries()))}`);
    for (const [placeholder, wpUrl] of imageMap.entries()) {
      const regex = new RegExp(placeholder, 'g');
      updatedHtml = updatedHtml.replace(regex, wpUrl);
    }
    // logger.debug(`replaceImageUrls: after process - updatedHTML: ${updatedHtml}`);
    logger.debug(`imageProcessor - replaced ${imageMap.size} image URLs in HTML`);
    return updatedHtml;
  }

  /**
   * Gets the file extension for a given content type.
   * @param contentType - The MIME content type.
   * @returns The corresponding file extension.
   * @returns 'bin' if the content type is unknown.
   * @example 'image/png' -> 'png'
   */
  private getExtensionFromContentType(contentType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
    };

    return extensions[contentType] || 'bin';
  }
}

export const imageProcessor: IImageProcessor = new ImageProcessor();