import { WpPostStatus } from '../enum/wp.enums.js';

export interface CreatePostOptions {
  title: string;
  content: string;
}

export interface WpPost {
  id: number;
  title: string;
  link: string; // URL to the post
  status: WpPostStatus;
}

export interface UploadMediaOptions {
  buffer: Buffer;
  filename: string;
  contentType: string;
  altText?: string;
}

export interface WpMedia {
  id: number;
  url: string;
  mediaType: string;
  mimeType: string;
}

export interface IWordPress {

  /**
   * Create a post in WordPress
   * @param options - title, content
   * @returns WpPost with post details
   * @throws WordPressException if creation fails after retries
   */
  createPost(options: CreatePostOptions): Promise<WpPost>;
  
  /**
   * Upload media to WordPress
   * @param options - buffer, filename, contentType, altText(optional)
   * @returns WpMedia with media details
   * @throws WordPressException if upload fails after retries
   */
  uploadMedia(options: UploadMediaOptions): Promise<WpMedia>;
  
  /**
   * Delete a post in WordPress
   * @param postId - ID of the post to delete
   * @throws WordPressException if deletion fails after retries
   */
  deletePost(postId: number): Promise<void>;

  /**
   * Delete media in WordPress
   * @param mediaId - ID of the media to delete
   * @throws WordPressException if deletion fails after retries
   */
  deleteMedia(mediaId: number): Promise<void>;
}