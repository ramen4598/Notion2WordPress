import type { Page } from '../../page/interface/pageProcessor.js';

export type ProcessHtmlImagesOptions = {
  excludeSelectors?: string[];
};

export interface IImageProcessor {
  /**
   * Downloads and uploads eligible images from HTML to WordPress, then rewrites the HTML.
   * @param page - The page context.
   * @param html - The HTML content to process.
   * @param options - Optional selectors for image nodes to skip.
   * @returns A promise that resolves to the rewritten HTML.
   * @throws ImageProcessException if image processing fails.
   */
  processHtmlImages(page: Page, html: string, options?: ProcessHtmlImagesOptions): Promise<string>;
}
