import { describe, expect, it } from 'vitest';
import { renderBookmarkHTML } from '../../../../src/domain/linkPreview/lib/bookmarkTemplate.js';

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

describe('renderBookmarkHTML', () => {
  it('renders bookmark card HTML matching the restored template structure', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/post',
      title: 'Example Title',
      description: 'Example Description',
      featuredImage: 'https://example.com/cover.png',
    });

    expect(normalizeHtml(html)).toBe(
      normalizeHtml(`<figure class="bookmark-card" style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; background-color: #ffffff; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05); margin: 12px 0; min-height: 80px; position: relative">
        <a class="bookmark-overlay-link" href="https://example.com/post" target="_blank" rel="noopener noreferrer" aria-label="Example Title" style="position: absolute; inset: 0; display: block; z-index: 3; text-decoration: none"></a>
        <div class="bookmark-row" style="display: flex; gap: 14px; align-items: stretch; position: relative; z-index: 1">
          <div class="bookmark-featured-image" style="position: relative; background-color: #f3f4f6; overflow: hidden; flex: 0 0 30%">
            <img src="https://example.com/cover.png" alt="Example Title" style="width: 100%; height: 100%; object-fit: cover; display: block" />
          </div>
          <div class="bookmark-content" style="padding: 12px 14px; display: flex; flex-direction: column; justify-content: center; flex: 1">
            <p class="bookmark-title" style="margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 500; color: #111827; line-height: 1.3; overflow-wrap: anywhere">
              Example Title
            </p>
            <p class="bookmark-description" style="margin: 4px 0 0 0; font-size: 0.85rem; color: #6b7280; line-height: 1.4; max-height: 3.6em; overflow: hidden">Example Description</p>
          </div>
        </div>
      </figure>`)
    );
  });

  it('escapes unsafe values', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/?q="bad"&x=<tag>',
      title: '<script>alert("x")</script>',
      description: "Tom & Jerry's link",
      featuredImage: 'https://example.com/image.png?x="bad"',
    });

    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('Tom &amp; Jerry&#039;s link');
    expect(html).toContain('href="https://example.com/?q=&quot;bad&quot;&amp;x=&lt;tag&gt;"');
    expect(html).toContain('src="https://example.com/image.png?x=&quot;bad&quot;"');
    expect(html).not.toContain('<script>');
  });

  it('uses the URL as title and renders an empty image container when optional values are absent', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/post',
      title: '',
    });

    expect(html).toContain('https://example.com/post');
    expect(html).not.toContain('bookmark-description');
    expect(html).not.toContain('<img');
    expect(html).toContain('<div class="bookmark-featured-image"');
    expect(html).toContain('class="bookmark-row"');
  });

  it('keeps provided URLs in href and image src while escaping HTML-sensitive characters', () => {
    const html = renderBookmarkHTML({
      url: 'javascript:alert("x")',
      title: 'Example Title',
      featuredImage: 'javascript:alert("y")',
    });

    expect(html).toContain('href="javascript:alert(&quot;x&quot;)"');
    expect(html).toContain('src="javascript:alert(&quot;y&quot;)"');
  });
});
