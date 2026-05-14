import type { NotionToMarkdown } from 'notion-to-md';

import type { ILinkPreviewTransformer } from '../interface/linkPreviewTransformer.js';
import { renderBookmarkHTML } from '../lib/bookmarkTemplate.js';
import { renderYouTubeEmbedHTML } from '../lib/youtubeEmbed.js';
import type { LinkPreviewMetadata } from '../interface/linkPreviewMetadata.js';
import { linkPreviewMetadataFetcher } from './linkPreviewMetadataFetcherImpl.js';

type RichText = { plain_text?: unknown };
type LinkPreviewBlockType = 'bookmark' | 'link_preview' | 'embed' | 'video';
type TransformerResult = Promise<string | false>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getBlockData(block: unknown, type: LinkPreviewBlockType): Record<string, unknown> | undefined {
  if (!isRecord(block)) return undefined;

  const data = block[type];
  return isRecord(data) ? data : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function getCaption(data: Record<string, unknown>): string | undefined {
  const caption = data.caption;
  if (!Array.isArray(caption)) return undefined;

  const text = caption
    .map((item: RichText) => (typeof item.plain_text === 'string' ? item.plain_text : ''))
    .join('')
    .trim();

  return text.length > 0 ? text : undefined;
}

function getExternalVideoUrl(data: Record<string, unknown>): string | undefined {
  const external = data.external;
  if (!isRecord(external)) return undefined;

  return getString(external.url);
}

function hasNotionHostedVideoFile(data: Record<string, unknown>): boolean {
  return data.type === 'file' || isRecord(data.file);
}

function fallbackMetadata(url: string): LinkPreviewMetadata {
  return {
    url,
    title: url,
    fetchedAt: new Date().toISOString(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeHref(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? url : '#';
  } catch {
    return '#';
  }
}

function renderFallbackBookmark(url: string): string {
  try {
    return renderBookmarkHTML(fallbackMetadata(url));
  } catch {
    const escapedHref = escapeHtml(safeHref(url));
    const escapedText = escapeHtml(url);

    return `<!-- wp:html -->\n<figure class="bookmark-card"><a href="${escapedHref}" target="_blank" rel="noopener noreferrer">${escapedText}</a></figure>\n<!-- /wp:html -->`;
  }
}

class LinkPreviewTransformer implements ILinkPreviewTransformer {
  registerTransformers(n2m: NotionToMarkdown): void {
    n2m.setCustomTransformer('bookmark', this.transformBookmark.bind(this));
    n2m.setCustomTransformer('link_preview', this.transformLinkPreview.bind(this));
    n2m.setCustomTransformer('embed', this.transformEmbed.bind(this));
    n2m.setCustomTransformer('video', this.transformVideo.bind(this));
  }

  private async renderBookmarkCard(url: string): TransformerResult {
    try {
      const metadata = await linkPreviewMetadataFetcher.fetchMetadata(url);
      return renderBookmarkHTML(metadata);
    } catch {
      return renderFallbackBookmark(url);
    }
  }

  private async transformBookmark(block: unknown): TransformerResult {
    const data = getBlockData(block, 'bookmark');
    const url = data ? getString(data.url) : undefined;

    return url ? await this.renderBookmarkCard(url) : false;
  }

  private async transformLinkPreview(block: unknown): TransformerResult {
    const data = getBlockData(block, 'link_preview');
    const url = data ? getString(data.url) : undefined;

    return url ? await this.renderBookmarkCard(url) : false;
  }

  private async transformEmbed(block: unknown): TransformerResult {
    const data = getBlockData(block, 'embed');
    const url = data ? getString(data.url) : undefined;
    if (!url || !data) return false;

    let youtubeHtml: string | undefined;
    try {
      youtubeHtml = renderYouTubeEmbedHTML(url, getCaption(data));
    } catch {
      return renderFallbackBookmark(url);
    }

    return youtubeHtml ?? (await this.renderBookmarkCard(url));
  }

  private async transformVideo(block: unknown): TransformerResult {
    const data = getBlockData(block, 'video');
    if (!data || hasNotionHostedVideoFile(data)) return false;

    const url = getExternalVideoUrl(data);
    if (!url) return false;

    let youtubeHtml: string | undefined;
    try {
      youtubeHtml = renderYouTubeEmbedHTML(url, getCaption(data));
    } catch {
      return renderFallbackBookmark(url);
    }

    return youtubeHtml ?? (await this.renderBookmarkCard(url));
  }
}

export const linkPreviewTransformer: ILinkPreviewTransformer = new LinkPreviewTransformer();
