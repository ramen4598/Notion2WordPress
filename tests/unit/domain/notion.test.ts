import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mdBlockCalloutWithImageMarkdownInParent } from '../../helpers/dummyMdBlock.js';

const { pageToMarkdownMock, toMarkdownStringMock, setCustomTransformerMock } = vi.hoisted(() => ({
  pageToMarkdownMock: vi.fn(),
  toMarkdownStringMock: vi.fn(),
  setCustomTransformerMock: vi.fn(),
}));

vi.mock('@notionhq/client', () => ({
  Client: class {},
}));

vi.mock('notion-to-md', () => ({
  NotionToMarkdown: class {
    pageToMarkdown = pageToMarkdownMock;
    toMarkdownString = toMarkdownStringMock;
    setCustomTransformer = setCustomTransformerMock;
  },
}));

vi.mock('../../../src/lib/retry.js', () => ({
  retryWithBackoff: async <T>(fn: () => Promise<T>) => await fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function blocksToMarkdown(blocks: Array<{ parent: string; children?: unknown[] }>): string {
  return blocks
    .flatMap((block) => {
      const lines = [block.parent];
      if (Array.isArray(block.children) && block.children.length > 0) {
        lines.push(blocksToMarkdown(block.children as Array<{ parent: string; children?: unknown[] }>));
      }
      return lines;
    })
    .filter((line) => line.length > 0)
    .join('\n\n');
}

async function loadNotion() {
  vi.resetModules();
  const mod = await import('../../../src/domain/notion/impl/notionImpl.js');
  return mod.notion;
}

describe('Notion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toMarkdownStringMock.mockImplementation((blocks) => ({
      parent: blocksToMarkdown(blocks as Array<{ parent: string; children?: unknown[] }>),
    }));
  });

  it('getPageHtml returns HTML only while preserving image URLs and normalized callouts', async () => {
    pageToMarkdownMock.mockResolvedValue([
      {
        ...mdBlockCalloutWithImageMarkdownInParent[0],
        parent: 'Heads up ![icon](https://example.com/icon.png)',
        children: [
          {
            type: 'paragraph',
            blockId: 'child-1',
            parent: 'Nested detail',
            children: [],
          },
        ],
      },
      {
        type: 'image',
        blockId: 'image-1',
        parent: '![hero](https://example.com/hero.png)',
        children: [],
      },
    ]);

    const notion = await loadNotion();
    const response = await notion.getPageHtml('page-1');

    expect(response).toEqual(expect.any(String));
    expect(response).toContain('<p>Heads up </p>');
    expect(response).toContain('<p>Nested detail</p>');
    expect(response).toContain('src="https://example.com/hero.png"');
    expect(response).not.toContain('image-image-1');
  });

  it('registers link preview custom transformers on construction', async () => {
    await loadNotion();

    expect(setCustomTransformerMock).toHaveBeenCalledWith('bookmark', expect.any(Function));
    expect(setCustomTransformerMock).toHaveBeenCalledWith('link_preview', expect.any(Function));
    expect(setCustomTransformerMock).toHaveBeenCalledWith('embed', expect.any(Function));
    expect(setCustomTransformerMock).toHaveBeenCalledWith('video', expect.any(Function));
    expect(setCustomTransformerMock).not.toHaveBeenCalledWith('paragraph', expect.any(Function));
  });

  it('preserves custom transformer raw HTML when converting markdown to HTML', async () => {
    pageToMarkdownMock.mockResolvedValue([
      {
        type: 'bookmark',
        blockId: 'bookmark-1',
        parent:
          '<!-- wp:html -->\n<figure class="bookmark-card"><a href="https://example.com">Example</a></figure>\n<!-- /wp:html -->',
        children: [],
      },
    ]);

    const notion = await loadNotion();
    const response = await notion.getPageHtml('page-1');

    expect(response).toContain('<!-- wp:html -->');
    expect(response).toContain('<figure class="bookmark-card">');
    expect(response).toContain('href="https://example.com"');
  });
});
