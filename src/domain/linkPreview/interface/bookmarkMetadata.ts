export interface BookmarkMetadata {
  url: string;
  title: string;
  description?: string;
  featuredImage?: string;
  fetchedAt: string;
  error?: string;
}

export interface IBookmarkMetadataFetcher {
  fetchMetadata(url: string): Promise<BookmarkMetadata>;
}
