import type { IWordPress, CreatePostOptions, WpPost, UploadMediaOptions, WpMedia } from '../interface/wordPress.js';
import { WordPressException } from '../error/wordPress.error.js';
import { WpPostStatus } from '../enum/wp.enums.js';
import { config } from '../../../config/config.js';
import { logger } from '../../../lib/logger.js';
import { retryWithBackoff } from '../../../lib/retry.js';
import { asError } from '../../../lib/utils.js';
import axios, { type AxiosInstance, isAxiosError } from 'axios';
import FormData from 'form-data';

class WordPress implements IWordPress {
  private client: AxiosInstance;

  constructor() {
    // Use Buffer.from to create Base64 encoded auth string
    const auth = Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`).toString('base64');

    this.client = axios.create({
      baseURL: config.wpApiUrl,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createPost(options: CreatePostOptions): Promise<WpPost> {

    const status = WpPostStatus.DRAFT;
    const { title, content } = options;

    const fn = async () => {
      const res = await this.client.post('/wp/v2/posts', {
        title,
        content,
        status,
      });
      return res.data;
    };

    const onRetryFn = (error: Error, attempt: number) => {
      const errorMsg = this.getAxiosErrorMessage(error);
      logger.warn(`Retrying WordPress post creation (attempt ${attempt})`, {
        title,
        error: errorMsg,
      });
    }

    interface WPPostResponse {
      id: number;
      title: { rendered: string };
      link: string;
      status: WpPostStatus;
    }

    try {
      const post = (await retryWithBackoff(fn, { onRetry: onRetryFn })) as WPPostResponse;

      logger.debug(`wordPress - Created WordPress post: ${post.id}`, {
        title: post.title.rendered,
        status: post.status,
      });

      return {
        id: post.id,
        title: post.title.rendered,
        link: post.link,
        status: post.status,
      };
    } catch (error: unknown) {
      const message = this.getAxiosErrorMessage(error);
      logger.warn('Failed to create WordPress post', { title, error: message });
      throw new WordPressException(`WordPress ${title} post creation failed: ${message}`, error);
    }
  }

  async uploadMedia(options: UploadMediaOptions): Promise<WpMedia> {
    const { buffer, filename, contentType, altText } = options;

    const formData = new FormData();
    formData.append('file', buffer, {
      filename,
      contentType,
    });

    if (altText) {
      formData.append('alt_text', altText);
    }

    type WPCreateMediaResponse = {
      id: number;
      source_url: string;
      media_type: string;
      mime_type: string;
    };

    const fn = async () => {
      const res = await this.client.post('/wp/v2/media', formData, {
        headers: formData.getHeaders(),
      });
      return res.data as WPCreateMediaResponse;
    };

    const onRetryFn = (error: Error, attempt: number) => {
      const errorMsg = this.getAxiosErrorMessage(error);
      logger.warn(`Retrying WordPress media upload (attempt ${attempt})`, {
        filename,
        error: errorMsg,
      });
    };

    try {
      const response = (await retryWithBackoff(
        fn, { onRetry: onRetryFn }
      )) as WPCreateMediaResponse;

      logger.debug(`wordPress - Uploaded media to WordPress: ${response.id}`, {
        url: response.source_url,
        filename,
      });

      return {
        id: response.id,
        url: response.source_url,
        mediaType: response.media_type,
        mimeType: response.mime_type,
      };
    } catch (error: unknown) {
      const message = this.getAxiosErrorMessage(error);
      logger.warn('Failed to upload media to WordPress', { filename, error: message });
      throw new WordPressException(`WordPress ${filename} media upload failed: ${message}`, error);
    }
  }

  async deletePost(postId: number): Promise<void> {
    const fn = async () => {
      const res = await this.client.delete(`/wp/v2/posts/${postId}`, {
        params: { force: true },
      });
      return res.data;
    };

    const onRetryFn = (error: Error, attempt: number) => {
      const errorMsg = this.getAxiosErrorMessage(error);
      logger.warn(`Retrying WordPress post deletion (attempt ${attempt})`, {
        postId,
        error: errorMsg,
      });
    };

    try {
      await retryWithBackoff(fn, { onRetry: onRetryFn });
      logger.debug(`wordPress - Deleted WordPress post: ${postId}`);
    } catch (error: unknown) {
      const message = this.getAxiosErrorMessage(error);
      logger.warn(`Failed to delete WordPress post ${postId}`, { error: message });
      throw new WordPressException(`WordPress post ${postId} deletion failed: ${message}`, error);
    }
  }

  async deleteMedia(mediaId: number): Promise<void> {
    const fn = async () => {
      const res = await this.client.delete(`/wp/v2/media/${mediaId}`, {
        params: { force: true },
      });
      return res.data;
    };
    
    const onRetryFn = (error: Error, attempt: number) => {
      const errorMsg = this.getAxiosErrorMessage(error);
      logger.warn(`Retrying WordPress media deletion (attempt ${attempt})`, {
        mediaId,
        error: errorMsg,
      });
    };

    try {
      await retryWithBackoff(fn, { onRetry: onRetryFn });
      logger.debug(`wordPress - Deleted WordPress media: ${mediaId}`);
    } catch (error: unknown) {
      const message = this.getAxiosErrorMessage(error);
      logger.warn(`Failed to delete WordPress media ${mediaId}`, { error: message });
      throw new WordPressException(`WordPress media ${mediaId} deletion failed: ${message}`, error);
    }
  }

  private getAxiosErrorMessage(error: unknown): string {
    if (isAxiosError(error)) {
      return `${error.message}${error.response?.status ? ` (HTTP ${error.response.status})` : ''}`;
    } else {
      return asError(error).message;
    }
  } 
}

export const wordPress: IWordPress = new WordPress();
