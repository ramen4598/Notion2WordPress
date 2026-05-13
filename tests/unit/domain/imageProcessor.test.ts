import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Page } from '../../../src/domain/page/interface/pageProcessor.js';

const {
  createImageAssetMock,
  updateImageAssetMock,
  downloadMock,
  uploadMediaMock,
} = vi.hoisted(() => ({
  createImageAssetMock: vi.fn(),
  updateImageAssetMock: vi.fn(),
  downloadMock: vi.fn(),
  uploadMediaMock: vi.fn(),
}));

vi.mock('../../../src/domain/db/impl/sqlite3.js', () => ({
  db: {
    createImageAsset: createImageAssetMock,
    updateImageAsset: updateImageAssetMock,
  },
}));

vi.mock('../../../src/domain/image/impl/notionImgDownloader.js', () => ({
  imageDownloader: {
    download: downloadMock,
  },
}));

vi.mock('../../../src/domain/wordPress/impl/wordPressImpl.js', () => ({
  wordPress: {
    uploadMedia: uploadMediaMock,
  },
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../src/config/config.js', () => ({
  config: {
    maxConcurrentImageDownloads: 2,
  },
}));

type HtmlProcessOptions = {
  excludeSelectors?: string[];
};

type HtmlImageProcessor = {
  processHtmlImages: (page: Page, html: string, options?: HtmlProcessOptions) => Promise<string>;
};

async function loadImageProcessor(): Promise<HtmlImageProcessor> {
  const mod = await import('../../../src/domain/image/impl/imageProcessorImpl.js');
  return mod.imageProcessor as HtmlImageProcessor;
}

function createPage(): Page {
  return {
    id: 1,
    notionPageId: 'np-1',
    wpPostId: undefined,
    uploadedMediaIds: [],
  };
}

describe('imageProcessor.processHtmlImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createImageAssetMock.mockReturnValue(101);
    downloadMock.mockResolvedValue({
      filename: 'photo',
      buffer: Buffer.from('img'),
      hash: '1234567890abcdef1234567890abcdef',
      contentType: 'image/png',
    });
    uploadMediaMock.mockResolvedValue({
      id: 55,
      url: 'https://wp.local/photo.png',
    });
  });

  it('rewrites a single img src and records rollback media ids', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<p><img src="https://cdn.local/a.png" alt="hero"></p>';

    const result = await imageProcessor.processHtmlImages(page, html);

    expect(result).toBe('<html><head></head><body><p><img src="https://wp.local/photo.png" alt="hero"></p></body></html>');
    expect(page.uploadedMediaIds).toEqual([55]);
  });

  it('leaves excluded selector matches unchanged', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<div class="link-preview"><img src="https://cdn.local/thumb.png"></div>';

    const result = await imageProcessor.processHtmlImages(page, html, {
      excludeSelectors: ['.link-preview img'],
    });

    expect(result).toBe(html);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(uploadMediaMock).not.toHaveBeenCalled();
  });

  it('passes HTML with no images through unchanged', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<p>no images</p>';

    await expect(imageProcessor.processHtmlImages(page, html)).resolves.toBe(html);
  });

  it('fails when an eligible image has an empty src', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<img src="   " alt="broken">';

    await expect(imageProcessor.processHtmlImages(page, html)).rejects.toThrow(/src/i);
  });

  it('fails the whole page when one image upload fails', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<p><img src="https://cdn.local/a.png"><img src="https://cdn.local/b.png"></p>';

    uploadMediaMock.mockResolvedValueOnce({
      id: 55,
      url: 'https://wp.local/photo-a.png',
    });
    uploadMediaMock.mockRejectedValueOnce(new Error('upload failed'));

    await expect(imageProcessor.processHtmlImages(page, html)).rejects.toThrow(/upload failed/i);
  });
});
