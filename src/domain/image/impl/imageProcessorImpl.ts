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
import { asError } from '../../../lib/utils.js';

type HtmlImageReference = {
  blockId: string;
  src: string;
  altText?: string;
};

class ImageProcessor implements IImageProcessor {
  async processHtmlImages(
    page: Page,
    html: string,
    options?: ProcessHtmlImagesOptions
  ): Promise<string> {
    const $ = load(html);
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

    for (const [index, node] of eligibleImages.entries()) {
      const image = $(node);
      const source = this.createHtmlImageReference(image.attr('src'), image.attr('alt'), index);
      const wpUrl = await this.uploadHtmlImage(page, source);
      image.attr('src', wpUrl);
    }

    logger.debug(`imageProcessor - processed ${eligibleImages.length} image URLs in HTML`);
    return $.html();
  }

  private createHtmlImageReference(
    src: string | undefined,
    altText: string | undefined,
    index: number
  ): HtmlImageReference {
    const normalizedSrc = src?.trim();

    if (!normalizedSrc) {
      throw new ImageProcessException('Image src is required for HTML image processing');
    }

    return {
      blockId: `html-image-${index + 1}`,
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
