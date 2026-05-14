function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getYouTubeVideoId(rawUrl: string): string | undefined {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if (url.hostname === 'youtu.be') {
    return url.pathname.split('/').filter(Boolean)[0];
  }

  if (url.hostname !== 'www.youtube.com' && url.hostname !== 'youtube.com') {
    return undefined;
  }

  if (url.pathname === '/watch') {
    return url.searchParams.get('v') ?? undefined;
  }

  if (url.pathname.startsWith('/embed/')) {
    return url.pathname.split('/').filter(Boolean)[1];
  }

  return undefined;
}

export function renderYouTubeEmbedHTML(rawUrl: string, title = 'YouTube video'): string | undefined {
  const videoId = getYouTubeVideoId(rawUrl);

  if (!videoId) {
    return undefined;
  }

  const escapedTitle = escapeHtml(title);

  return `<!-- wp:html -->
<figure class="youtube-embed" style="position: relative; width: 100%; margin: 1.5em 0; padding-bottom: 56.25%; height: 0; overflow: hidden;">
  <iframe src="https://www.youtube.com/embed/${escapeHtml(videoId)}" title="${escapedTitle}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position: absolute; inset: 0; width: 100%; height: 100%; border: 0;"></iframe>
</figure>
<!-- /wp:html -->`;
}
