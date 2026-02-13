import type { Page } from '../../page/interface/pageProcessor.js';
import type { ImageReference } from '../../notion/interface/notion.js';

/**
 * A record mapping a placeholder string to a WordPress URL string.
 */
export type Placeholder2WpUrlRecord = Record<string, string>;

/**
 * A map mapping a placeholder string to a WordPress URL string.
 */
export type Placeholder2WpUrlMap = Map<string, string>;

export interface IImageProcessor {
  /**
   * Downloads and uploads images from Notion to WordPress.
   * Processes images in batches to limit concurrency.
   * @param page - The page context.
   * @param images - The list of images to sync.
   * @returns A promise that resolves to a map storing placeholder and WordPress URL mappings.
   * @throws ImageProcessException. An aggregate error. Collect errors from individual image sync failures.
   */
  syncImages(page: Page, images: ImageReference[]): Promise<Placeholder2WpUrlMap>;

  /**
   * Syncs a single image from Notion to WordPress.
   * @param page - The page context.
   * @param image - The image reference to sync.
   * @returns A promise that resolves to a record storing placeholder and WordPress URL mapping for the image.
   * @throws ImageProcessException if the image sync fails.
   */
  syncImage(page: Page, image: ImageReference): Promise<Placeholder2WpUrlRecord>;

  /**
   * Replaces placeholder in HTML with WordPress image URLs.
   * @param html - The HTML content with placeholder URLs.
   * @param imageMap - Map of placeholders to WordPress URLs.
   * @returns The HTML content with URLs replaced.
   * @throws ImageProcessException if URL replacement fails.
   */
  replaceImageUrls(html: string, imageMap: Placeholder2WpUrlMap): Promise<string>;
}
