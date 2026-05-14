import type { NotionToMarkdown } from 'notion-to-md';

import { bookmarkMetadataFetcher } from './bookmarkMetadataFetcher.js';
import { renderBookmarkHTML } from './bookmarkTemplate.js';
import { renderYouTubeEmbedHTML } from './youtubeEmbed.js';
import type { BookmarkMetadata } from '../interface/bookmarkMetadata.js';

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

function fallbackMetadata(url: string): BookmarkMetadata {
  return {
    url,
    title: url,
    fetchedAt: new Date().toISOString(),
  };
}

function renderFallbackBookmark(url: string): string {
  try {
    return renderBookmarkHTML(fallbackMetadata(url));
  } catch {
    return `<!-- wp:html -->\n<figure class="bookmark-card"><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></figure>\n<!-- /wp:html -->`;
  }
}

async function renderBookmarkCard(url: string): TransformerResult {
  try {
    const metadata = await bookmarkMetadataFetcher.fetchMetadata(url);
    return renderBookmarkHTML(metadata);
  } catch {
    return renderFallbackBookmark(url);
  }
}

async function transformBookmark(block: unknown): TransformerResult {
  const data = getBlockData(block, 'bookmark');
  const url = data ? getString(data.url) : undefined;

  return url ? await renderBookmarkCard(url) : false;
}

async function transformLinkPreview(block: unknown): TransformerResult {
  const data = getBlockData(block, 'link_preview');
  const url = data ? getString(data.url) : undefined;

  return url ? await renderBookmarkCard(url) : false;
}

async function transformEmbed(block: unknown): TransformerResult {
  const data = getBlockData(block, 'embed');
  const url = data ? getString(data.url) : undefined;
  if (!url || !data) return false;

  let youtubeHtml: string | undefined;
  try {
    youtubeHtml = renderYouTubeEmbedHTML(url, getCaption(data));
  } catch {
    return renderFallbackBookmark(url);
  }

  return youtubeHtml ?? (await renderBookmarkCard(url));
}

async function transformVideo(block: unknown): TransformerResult {
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

  return youtubeHtml ?? (await renderBookmarkCard(url));
}

export function registerLinkPreviewTransformers(n2m: NotionToMarkdown): void {
  n2m.setCustomTransformer('bookmark', transformBookmark);
  n2m.setCustomTransformer('link_preview', transformLinkPreview);
  n2m.setCustomTransformer('embed', transformEmbed);
  n2m.setCustomTransformer('video', transformVideo);
}
