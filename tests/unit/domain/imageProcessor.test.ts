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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
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

  it('rewrites an image src within an HTML fragment and records rollback media ids', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<p>Lead</p><img src="https://cdn.local/a.png" alt="hero"><p>Tail</p>';

    const result = await imageProcessor.processHtmlImages(page, html);

    expect(result).toBe(
      '<p>Lead</p><img src="https://wp.local/photo.png" alt="hero"><p>Tail</p>'
    );
    expect(page.uploadedMediaIds).toEqual([55]);
  });

  it('uses page-local temporary notion block ids for html image assets', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<p><img src="https://cdn.local/a.png"><img src="https://cdn.local/b.png"></p>';

    await imageProcessor.processHtmlImages(page, html);

    expect(createImageAssetMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ notion_block_id: 'np-1#image-1' })
    );
    expect(createImageAssetMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ notion_block_id: 'np-1#image-2' })
    );
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

  it('aggregates image processing failures after attempting every eligible image', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html =
      '<p><img src="https://cdn.local/a.png"><img src="https://cdn.local/b.png"><img src="https://cdn.local/c.png"></p>';

    uploadMediaMock
      .mockRejectedValueOnce(new Error('upload failed a'))
      .mockResolvedValueOnce({
        id: 55,
        url: 'https://wp.local/photo-b.png',
      })
      .mockRejectedValueOnce(new Error('upload failed c'));

    await expect(imageProcessor.processHtmlImages(page, html)).rejects.toThrow(/sync 2 images/i);

    expect(uploadMediaMock).toHaveBeenCalledTimes(3);
    expect(page.uploadedMediaIds).toEqual([55]);
    expect(updateImageAssetMock).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ status: 'failed', error_message: expect.stringMatching(/upload failed a/i) })
    );
    expect(updateImageAssetMock).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ status: 'failed', error_message: expect.stringMatching(/upload failed c/i) })
    );
  });

  it('still attempts valid html images when another eligible image has a blank src', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html = '<p><img src="   " alt="broken"><img src="https://cdn.local/b.png"></p>';

    uploadMediaMock.mockResolvedValueOnce({
      id: 55,
      url: 'https://wp.local/photo-b.png',
    });

    await expect(imageProcessor.processHtmlImages(page, html)).rejects.toThrow(/sync 1 images/i);

    expect(uploadMediaMock).toHaveBeenCalledTimes(1);
    expect(page.uploadedMediaIds).toEqual([55]);
  });

  it('processes html images in batches using maxConcurrentImageDownloads', async () => {
    const imageProcessor = await loadImageProcessor();
    const page = createPage();
    const html =
      '<p><img src="https://cdn.local/a.png"><img src="https://cdn.local/b.png"><img src="https://cdn.local/c.png"></p>';
    const first = createDeferred<{
      id: number;
      url: string;
    }>();
    const second = createDeferred<{
      id: number;
      url: string;
    }>();

    uploadMediaMock
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce({
        id: 57,
        url: 'https://wp.local/photo-c.png',
      });

    const processingPromise = imageProcessor.processHtmlImages(page, html);

    await vi.waitFor(() => {
      expect(uploadMediaMock).toHaveBeenCalledTimes(2);
    });

    first.resolve({ id: 55, url: 'https://wp.local/photo-a.png' });
    second.resolve({ id: 56, url: 'https://wp.local/photo-b.png' });

    await vi.waitFor(() => {
      expect(uploadMediaMock).toHaveBeenCalledTimes(3);
    });
    await expect(processingPromise).resolves.toBe(
      '<p><img src="https://wp.local/photo-a.png"><img src="https://wp.local/photo-b.png"><img src="https://wp.local/photo-c.png"></p>'
    );
  });
});
