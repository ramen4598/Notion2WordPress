import { beforeEach, describe, expect, it, vi } from 'vitest';

const { pageToMarkdownMock, toMarkdownStringMock } = vi.hoisted(() => ({
  pageToMarkdownMock: vi.fn(),
  toMarkdownStringMock: vi.fn(),
}));

vi.mock('@notionhq/client', () => ({
  Client: class {},
}));

vi.mock('notion-to-md', () => ({
  NotionToMarkdown: class {
    pageToMarkdown = pageToMarkdownMock;
    toMarkdownString = toMarkdownStringMock;
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
        type: 'callout',
        blockId: 'callout-1',
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

    expect(response).toEqual({ html: expect.any(String) });
    expect(response.html).toContain('<p>Heads up </p>');
    expect(response.html).toContain('<p>Nested detail</p>');
    expect(response.html).toContain('src="https://example.com/hero.png"');
    expect(response.html).not.toContain('image-image-1');
  });
});
