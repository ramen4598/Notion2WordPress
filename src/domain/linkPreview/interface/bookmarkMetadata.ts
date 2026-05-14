export interface BookmarkMetadata {
  url: string;
  title: string;
  description?: string;
  featuredImage?: string;
  fetchedAt: string;
  error?: string;
}

export interface BookmarkMetadataFetcher {
  fetchMetadata(url: string): Promise<BookmarkMetadata>;
}
