import type { NotionToMarkdown } from 'notion-to-md';

export interface ILinkPreviewTransformer {
  /**
   * Registers custom transformers for bookmark-like Notion blocks.
   * @param n2m - The Notion-to-Markdown instance used for page conversion.
   */
  registerTransformers(n2m: NotionToMarkdown): void;
}
