/**
 * Metadata used to render a link preview card.
 */
export interface LinkPreviewMetadata {
  url: string;
  title: string;
  description?: string;
  featuredImage?: string;
  fetchedAt: string;
  error?: string;
}

export interface ILinkPreviewMetadataFetcher {
  /**
   * Fetch metadata used to render a link preview card.
   * @param url - The page URL to inspect.
   * @returns A promise that resolves to the fetched metadata.
   */
  fetchMetadata(url: string): Promise<LinkPreviewMetadata>;
}
