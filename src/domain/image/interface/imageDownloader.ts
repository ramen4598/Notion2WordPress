export interface DownloadImageOptions {
  url: string;
  timeout?: number;
}

export interface DownloadImageResponse {
  filename: string;
  buffer: Buffer;
  hash: string;
  contentType: string;
  size: number;
}

export interface IImageDownloader {

  /**
   * Download an image from a URL.
   * @param options - Download options including URL and optional timeout.
   * @returns A promise that resolves to the downloaded image details.
   * @throws ImageDownloadException if the download fails after retries.
   */
  download(options: DownloadImageOptions): Promise<DownloadImageResponse>;
}