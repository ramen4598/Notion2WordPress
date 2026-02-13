import axios from 'axios';
import crypto from 'crypto';
import { config } from '../../../config/config.js';
import { logger } from '../../../lib/logger.js';
import { retryWithBackoff } from '../../../lib/retry.js';
import { DownloadImageOptions, DownloadImageResponse, IImageDownloader } from '../interface/imageDownloader.js';
import { ImageDownloadException } from '../error/image.error.js';
import { asError } from '../../../lib/utils.js';

class NotionImageDownloader implements IImageDownloader {

  // Downloads an image from the given URL with retry logic.
  async download(options: DownloadImageOptions): Promise<DownloadImageResponse> {
    const { url, timeout = config.imageDownloadTimeoutMs } = options;
    const sanitizedUrl = this.sanitizeUrl(url);

    const fn = async () => {
      return await axios.get(url, {
        responseType: 'arraybuffer',
        timeout,
        headers: {
          'User-Agent': `Notion2WordPress`,
        },
      });
    };

    const onRetryFn = (error: Error, attempt: number) => {
      logger.warn(`Retrying image download (attempt ${attempt})`, {
        url: sanitizedUrl,
        error: error.message,
      });
    };

    try {
      // if the download fails, retry with exponential backoff
      const response = await retryWithBackoff(fn, { onRetry: onRetryFn });

      const filename = this.getFilenameFromUrl(url);
      const buffer = Buffer.from(response.data);
      const hash = this.calculateHash(buffer);
      const contentType = response.headers['content-type'] || 'image/jpeg';
      const size = buffer.length;

      logger.debug('imageDownloader - Downloaded image', {
        filename,
        url: sanitizedUrl,
        size,
        hash,
        contentType,
      });

      return { filename, buffer, hash, contentType, size };
    } catch (error: unknown) {
      logger.warn(`Failed to download image - url : ${sanitizedUrl}`, asError(error));
      throw new ImageDownloadException(`Failed to download image from ${sanitizedUrl}`, error);
    }
  }

  private calculateHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // For logging, remove query parameters and fragments
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch {
      return url.substring(0, 50) + '...';
    }
  }

  // Extracts filename from URL without extension
  private getFilenameFromUrl(url: string): string {
    let filename = url.split('/').pop()?.split('?')[0] || 'image';
    const lastDot = filename.lastIndexOf('.');
    if (lastDot > 0) {
      filename = filename.substring(0, lastDot);
    }
    return decodeURIComponent(filename);
  }
}

export const imageDownloader: IImageDownloader = new NotionImageDownloader();
