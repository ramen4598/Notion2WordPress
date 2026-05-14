import { describe, expect, it } from 'vitest';
import { renderYouTubeEmbedHTML } from '../../../../src/domain/linkPreview/lib/youtubeEmbed.js';

describe('renderYouTubeEmbedHTML', () => {
  it('renders iframe HTML for youtube.com watch URLs', () => {
    const html = renderYouTubeEmbedHTML('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', 'Video title');

    expect(html).toContain('<!-- wp:html -->');
    expect(html).toContain('<iframe');
    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('title="Video title"');
    expect(html).toContain('allowfullscreen');
  });

  it('renders iframe HTML for youtu.be URLs', () => {
    const html = renderYouTubeEmbedHTML('https://youtu.be/dQw4w9WgXcQ');

    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('title="YouTube video"');
  });

  it('renders iframe HTML for existing embed URLs', () => {
    const html = renderYouTubeEmbedHTML('https://www.youtube.com/embed/dQw4w9WgXcQ');

    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
  });

  it('escapes iframe titles', () => {
    const html = renderYouTubeEmbedHTML('https://youtu.be/dQw4w9WgXcQ', '<bad "title">');

    expect(html).toContain('title="&lt;bad &quot;title&quot;&gt;"');
    expect(html).not.toContain('<bad');
  });

  it('returns undefined for non-YouTube URLs', () => {
    expect(renderYouTubeEmbedHTML('https://example.com/video')).toBeUndefined();
  });
});
