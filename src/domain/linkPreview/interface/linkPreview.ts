import type { NotionToMarkdown } from 'notion-to-md';

export interface ILinkPreview {
  /**
   * Registers link preview block transformers on a Notion-to-Markdown converter.
   * @param n2m - The Notion-to-Markdown instance used for page conversion.
   * @returns Nothing.
   */
  registerTransformers(n2m: NotionToMarkdown): void;
}
