import type { NotionToMarkdown } from 'notion-to-md';
import type { ILinkPreview } from '../interface/linkPreview.js';
import { registerLinkPreviewTransformers } from '../lib/linkPreviewTransformer.js';

class LinkPreview implements ILinkPreview {
  registerTransformers(n2m: NotionToMarkdown): void {
    registerLinkPreviewTransformers(n2m);
  }
}

export const linkPreview: ILinkPreview = new LinkPreview();
