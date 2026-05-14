import type { NotionToMarkdown } from 'notion-to-md';
import type { ILinkPreview } from '../interface/linkPreview.js';
import { linkPreviewTransformer } from './linkPreviewTransformerImpl.js';

class LinkPreview implements ILinkPreview {
  registerTransformers(n2m: NotionToMarkdown): void {
    linkPreviewTransformer.registerTransformers(n2m);
  }
}

export const linkPreview: ILinkPreview = new LinkPreview();
