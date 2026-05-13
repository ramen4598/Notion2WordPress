import { load } from 'cheerio';
import type { IImageProcessor, ProcessHtmlImagesOptions } from '../interface/imageProcessor.js';
import type { WpMedia } from '../../wordPress/interface/wordPress.js';
import type { Page } from '../../page/interface/pageProcessor.js';
import type { DownloadImageResponse } from '../interface/imageDownloader.js';
import { ImageProcessException } from '../error/image.error.js';
import { ImageAssetStatus } from '../../db/enum/db.enums.js';
import { imageDownloader } from './notionImgDownloader.js';
import { wordPress } from '../../wordPress/impl/wordPressImpl.js';
import { db } from '../../db/impl/sqlite3.js';
import { logger } from '../../../lib/logger.js';
import { config } from '../../../config/config.js';
import { asError } from '../../../lib/utils.js';

type HtmlImageReference = {
  blockId: string;
  src: string;
  altText?: string;
};

type HtmlImageUploadResult = {
  imageIndex: number;
  wpUrl: string;
};

type HtmlImageCandidate = {
  imageIndex: number;
  src: string | undefined;
  altText: string | undefined;
};

class ImageProcessor implements IImageProcessor {
  async processHtmlImages(
    page: Page,
    html: string,
    options?: ProcessHtmlImagesOptions
  ): Promise<string> {
    // Preserve the original post-content fragment shape instead of wrapping it as a full document.
    const $ = load(html, null, false);
    const allImages = $('img').toArray();

    if (allImages.length === 0) {
      return html;
    }

    const eligibleImages = allImages.filter((node) => {
      const image = $(node);
      return !(options?.excludeSelectors ?? []).some((selector) => image.is(selector));
    });

    if (eligibleImages.length === 0) {
      return html;
    }

    const candidates = eligibleImages.map((node, index) => {
      const image = $(node);
      return {
        imageIndex: index,
        src: image.attr('src'),
        altText: image.attr('alt'),
      };
    });

    const results = await this.uploadHtmlImagesInBatches(page, candidates);
    this.handleHtmlImageErrors(results);

    for (const result of results) {
      if (result.status !== 'fulfilled') {
        continue;
      }

      const node = eligibleImages[result.value.imageIndex];
      $(node).attr('src', result.value.wpUrl);
    }

    logger.debug(`imageProcessor - processed ${eligibleImages.length} image URLs in HTML`);
    return $.root().html() ?? '';
  }

  private async uploadHtmlImagesInBatches(
    page: Page,
    images: HtmlImageCandidate[]
  ): Promise<PromiseSettledResult<HtmlImageUploadResult>[]> {
    const results: PromiseSettledResult<HtmlImageUploadResult>[] = [];
    const maxConcurrent = Math.max(config.maxConcurrentImageDownloads, 1);

    for (let i = 0; i < images.length; i += maxConcurrent) {
      logger.debug(
        `imageProcessor - Processing HTML images ${i + 1} to ${Math.min(i + maxConcurrent, images.length)} of ${images.length}`
      );

      const batch = images.slice(i, i + maxConcurrent);
      const batchResults = await Promise.allSettled(
        batch.map((image) =>
          Promise.resolve()
            .then(() =>
              this.createHtmlImageReference(page, image.src, image.altText, image.imageIndex)
            )
            .then((reference) => this.uploadHtmlImage(page, reference))
            .then((wpUrl) => ({
              imageIndex: image.imageIndex,
              wpUrl,
            }))
        )
      );

      results.push(...batchResults);
    }

    return results;
  }

  private handleHtmlImageErrors(results: PromiseSettledResult<HtmlImageUploadResult>[]): void {
    const errors = results.filter((result) => result.status === 'rejected');

    if (errors.length === 0) {
      return;
    }

    logger.warn(`handleHtmlImageErrors - ${errors.length} HTML image sync failures`);
    throw new ImageProcessException(
      `Failed to sync ${errors.length} images`,
      errors.map((result) => (result.status === 'rejected' ? asError(result.reason) : result))
    );
  }

  private createHtmlImageReference(
    page: Page,
    src: string | undefined,
    altText: string | undefined,
    index: number
  ): HtmlImageReference {
    const normalizedSrc = src?.trim();

    if (!normalizedSrc) {
      throw new ImageProcessException('Image src is required for HTML image processing');
    }

    return {
      // TODO(issue #44): replace this temporary page-local HTML image identifier with a persisted source ID.
      blockId: `${page.notionPageId}#image-${index + 1}`,
      src: normalizedSrc,
      altText,
    };
  }

  private async uploadHtmlImage(page: Page, image: HtmlImageReference): Promise<string> {
    const assetId = this.createImageAsset(page, image);

    try {
      const { filename: ogfname, buffer, hash, contentType } = await this.downloadImage(image);
      const extension = this.getExtensionFromContentType(contentType);
      const filename = `${ogfname}-${hash.substring(0, 16)}.${extension}`;

      const media: WpMedia = await this.uploadImageToWordPress(
        buffer,
        filename,
        contentType,
        image.altText
      );
      page.uploadedMediaIds.push(media.id);
      this.updateImageAssetAsUploaded(assetId, media);

      logger.debug(`imageProcessor - Uploaded image: ${filename} -> ${media.url}`);
      return media.url;
    } catch (error: unknown) {
      const err = asError(error);
      this.updateImageAssetAsFailed(assetId, err.message);
      logger.warn(`Failed to upload image from block ${image.blockId} : ${err.message}`);
      throw error;
    }
  }

  private createImageAsset(page: Page, image: HtmlImageReference): number {
    try {
      return db.createImageAsset({
        page_id: page.id,
        notion_page_id: page.notionPageId,
        notion_block_id: image.blockId,
        notion_url: image.src,
        status: ImageAssetStatus.Pending,
      });
    } catch (error: unknown) {
      throw new ImageProcessException('Failed to create image asset', error);
    }
  }

  private async downloadImage(image: HtmlImageReference): Promise<DownloadImageResponse> {
    try {
      return await imageDownloader.download({
        url: image.src,
      });
    } catch (error: unknown) {
      throw new ImageProcessException(`Failed to download image from URL: ${image.src}`, error);
    }
  }

  private async uploadImageToWordPress(
    buffer: Buffer,
    filename: string,
    contentType: string,
    altText: string | undefined
  ): Promise<WpMedia> {
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
      throw new ImageProcessException(
        `Failed to update image asset as uploaded: ${assetId}`,
        error
      );
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
