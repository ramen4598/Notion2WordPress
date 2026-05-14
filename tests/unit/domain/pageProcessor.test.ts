import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobStatus, JobType } from '../../../src/domain/db/enum/db.enums.js';
import { NotionPageStatus } from '../../../src/domain/notion/enum/notion.enums.js';
import { WpPostStatus } from '../../../src/domain/wordPress/enum/wp.enums.js';

const {
  createPageMock,
  updatePageMock,
  createNPagePostMapMock,
  updateJobMock,
  getPageHtmlMock,
  updatePageStatusMock,
  processHtmlImagesMock,
  createPostMock,
  deleteMediaMock,
  deletePostMock,
} = vi.hoisted(() => ({
  createPageMock: vi.fn(),
  updatePageMock: vi.fn(),
  createNPagePostMapMock: vi.fn(),
  updateJobMock: vi.fn(),
  getPageHtmlMock: vi.fn(),
  updatePageStatusMock: vi.fn(),
  processHtmlImagesMock: vi.fn(),
  createPostMock: vi.fn(),
  deleteMediaMock: vi.fn(),
  deletePostMock: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../src/domain/db/impl/sqlite3.js', () => ({
  db: {
    createPage: createPageMock,
    updatePage: updatePageMock,
    createNPagePostMap: createNPagePostMapMock,
    updateJob: updateJobMock,
  },
}));

vi.mock('../../../src/domain/notion/impl/notionImpl.js', () => ({
  notion: {
    getPageHtml: getPageHtmlMock,
    updatePageStatus: updatePageStatusMock,
  },
}));

vi.mock('../../../src/domain/image/impl/imageProcessorImpl.js', () => ({
  imageProcessor: {
    processHtmlImages: processHtmlImagesMock,
  },
}));

vi.mock('../../../src/domain/wordPress/impl/wordPressImpl.js', () => ({
  wordPress: {
    createPost: createPostMock,
    deleteMedia: deleteMediaMock,
    deletePost: deletePostMock,
  },
}));

async function loadPageProcessor() {
  vi.resetModules();
  const mod = await import('../../../src/domain/page/impl/pageProcessorImpl.js');
  return mod.pageProcessor;
}

describe('PageProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPageMock.mockReturnValue(101);
    getPageHtmlMock.mockResolvedValue('<p>raw html</p>');
    updatePageStatusMock.mockResolvedValue({ success: true, updatedTime: '2026-05-13T00:00:00Z' });
    processHtmlImagesMock.mockResolvedValue('<p>final html</p>');
    createPostMock.mockResolvedValue({
      id: 202,
      title: 'Page title',
      link: 'https://example.com/post/202',
      status: WpPostStatus.DRAFT,
    });
    deleteMediaMock.mockResolvedValue(undefined);
    deletePostMock.mockResolvedValue(undefined);
  });

  it('syncPage pipes notion HTML through image processing before creating the WordPress post', async () => {
    const pageProcessor = await loadPageProcessor();
    const job = {
      jobId: 1,
      jobType: JobType.Manual,
      status: JobStatus.Running,
      pagesProcessed: 0,
      pagesSucceeded: 0,
      pagesFailed: 0,
      errors: [],
    };
    const notionPage = {
      id: 'notion-page-1',
      title: 'Page title',
      status: NotionPageStatus.Adding,
      lastEditedTime: '2026-05-13T00:00:00Z',
      createdTime: '2026-05-13T00:00:00Z',
      properties: {},
    };

    await pageProcessor.syncPage(job, notionPage);

    expect(createPageMock).toHaveBeenCalledWith({
      job_id: 1,
      notion_page_id: 'notion-page-1',
      status: 'pending',
    });
    expect(getPageHtmlMock).toHaveBeenCalledWith('notion-page-1');
    expect(processHtmlImagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 101,
        notionPageId: 'notion-page-1',
        uploadedMediaIds: [],
      }),
      '<p>raw html</p>',
      { excludeSelectors: ['.bookmark-card img'] }
    );
    expect(createPostMock).toHaveBeenCalledWith({
      title: 'Page title',
      content: '<p>final html</p>',
    });
    expect(updatePageStatusMock).toHaveBeenCalledWith('notion-page-1', NotionPageStatus.Done);
    expect(updatePageMock).toHaveBeenCalledWith(101, {
      wp_post_id: 202,
      status: 'success',
    });
    expect(createNPagePostMapMock).toHaveBeenCalledWith({
      notion_page_id: 'notion-page-1',
      wp_post_id: 202,
    });
    expect(job.pagesSucceeded).toBe(1);
    expect(job.pagesFailed).toBe(0);
  });
});
