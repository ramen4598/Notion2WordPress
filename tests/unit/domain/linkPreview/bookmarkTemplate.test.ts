import { describe, expect, it } from 'vitest';
import { renderBookmarkHTML } from '../../../../src/domain/linkPreview/impl/bookmarkTemplate.js';

describe('renderBookmarkHTML', () => {
  it('renders a WordPress custom HTML bookmark card', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/post',
      title: 'Example Title',
      description: 'Example Description',
      featuredImage: 'https://example.com/cover.png',
    });

    expect(html).toContain('<!-- wp:html -->');
    expect(html).toContain('<!-- /wp:html -->');
    expect(html).toContain('<figure class="bookmark-card"');
    expect(html).toContain('href="https://example.com/post"');
    expect(html).toContain('Example Title');
    expect(html).toContain('Example Description');
    expect(html).toContain('src="https://example.com/cover.png"');
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

  it('uses the URL as title and empty image container when optional values are absent', () => {
    const html = renderBookmarkHTML({
      url: 'https://example.com/post',
      title: '',
    });

    expect(html).toContain('https://example.com/post');
    expect(html).not.toContain('bookmark-description');
    expect(html).not.toContain('<img');
    expect(html).toContain('<div class="bookmark-featured-image"');
  });

  it('falls back to a safe href for unsafe URL schemes', () => {
    const html = renderBookmarkHTML({
      url: 'javascript:alert(1)',
      title: '',
    });

    expect(html).toContain('href="#"');
    expect(html).toContain('javascript:alert(1)');
    expect(html).not.toContain('href="javascript:alert(1)"');
  });
});
