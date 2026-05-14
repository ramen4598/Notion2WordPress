import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../../../lib/logger.js';
import { retryWithBackoff } from '../../../lib/retry.js';
import { asError } from '../../../lib/utils.js';
import { BookmarkMetadata, BookmarkMetadataFetcher } from '../interface/bookmarkMetadata.js';

class CheerioBookmarkMetadataFetcher implements BookmarkMetadataFetcher {
  async fetchMetadata(url: string): Promise<BookmarkMetadata> {
    const fetchedAt = new Date().toISOString();

    try {
      const response = await retryWithBackoff(async () => {
        return await axios.get(url, {
          timeout: 60000,
          maxRedirects: 5,
          headers: {
            'User-Agent': 'Notion2WordPress link preview fetcher',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
      });

      const $ = cheerio.load(String(response.data ?? ''));
      const title = this.getMetaContent($, 'property', 'og:title') || $('title').first().text().trim() || url;
      const description = this.getMetaContent($, 'property', 'og:description') || undefined;
      const ogImage = this.getMetaContent($, 'property', 'og:image');
      const favicon = ogImage ? undefined : this.getFaviconUrl($);

      logger.debug('bookmarkMetadataFetcher - Fetched metadata', { url, title });

      return {
        url,
        title,
        description,
        featuredImage: ogImage ? this.resolveUrl(ogImage, url) : this.resolveFaviconUrl(favicon, url),
        fetchedAt,
      };
    } catch (error: unknown) {
      const fetchError = asError(error);

      logger.warn('Failed to fetch bookmark metadata', {
        url,
        error: fetchError.message,
      });

      return {
        url,
        title: url,
        description: undefined,
        featuredImage: undefined,
        fetchedAt,
        error: fetchError.message,
      };
    }
  }

  private getMetaContent($: cheerio.CheerioAPI, attribute: string, value: string): string | undefined {
    return $(`meta[${attribute}="${value}"]`).attr('content')?.trim() || undefined;
  }

  private getFaviconUrl($: cheerio.CheerioAPI): string | undefined {
    return $('link[rel~="icon"]').first().attr('href')?.trim() || undefined;
  }

  private resolveUrl(value: string, baseUrl: string): string {
    return new URL(value, baseUrl).toString();
  }

  private resolveFaviconUrl(value: string | undefined, pageUrl: string): string | undefined {
    if (!value) return undefined;

    const origin = new URL(pageUrl).origin;
    return new URL(value, `${origin}/`).toString();
  }
}

export const bookmarkMetadataFetcher: BookmarkMetadataFetcher = new CheerioBookmarkMetadataFetcher();
