import type { BookmarkMetadata } from '../interface/bookmarkMetadata.js';

type BookmarkTemplateData = Pick<BookmarkMetadata, 'url' | 'title' | 'description' | 'featuredImage'>;
type Style = Record<string, string | number>;

function camelToKebab(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function styleToString(style: Style): string {
  return Object.entries(style)
    .map(([key, value]) => `${camelToKebab(key)}: ${value}`)
    .join('; ');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const cardStyle: Style = {
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
  minHeight: '120px',
  margin: '1.5em 0',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  overflow: 'hidden',
  backgroundColor: '#fff',
};

const overlayStyle: Style = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  textDecoration: 'none',
};

const contentStyle: Style = {
  flex: 1,
  minWidth: 0,
  padding: '18px 20px',
};

const titleStyle: Style = {
  margin: '0 0 8px',
  fontSize: '18px',
  fontWeight: 700,
  lineHeight: 1.35,
  color: '#111827',
};

const descriptionStyle: Style = {
  margin: 0,
  fontSize: '14px',
  lineHeight: 1.5,
  color: '#4b5563',
};

const imageContainerStyle: Style = {
  flex: '0 0 160px',
  minHeight: '120px',
  backgroundColor: '#f3f4f6',
};

const imageStyle: Style = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block',
};

export function renderBookmarkHTML(data: BookmarkTemplateData): string {
  const escapedUrl = escapeHtml(data.url);
  const displayTitle = data.title.length > 0 ? data.title : data.url;
  const escapedTitle = escapeHtml(displayTitle);
  const escapedDescription = data.description ? escapeHtml(data.description) : undefined;
  const escapedFeaturedImage = data.featuredImage ? escapeHtml(data.featuredImage) : undefined;

  const descriptionHtml = escapedDescription
    ? `\n    <p class="bookmark-description" style="${styleToString(descriptionStyle)}">${escapedDescription}</p>`
    : '';
  const imageHtml = escapedFeaturedImage
    ? `\n    <img class="bookmark-featured-image-img" src="${escapedFeaturedImage}" alt="${escapedTitle}" style="${styleToString(imageStyle)}">\n  `
    : '';

  return `<!-- wp:html -->
<figure class="bookmark-card" style="${styleToString(cardStyle)}">
  <a class="bookmark-overlay-link" href="${escapedUrl}" target="_blank" rel="noopener noreferrer" aria-label="${escapedTitle}" style="${styleToString(overlayStyle)}"></a>
  <div class="bookmark-content" style="${styleToString(contentStyle)}">
    <div class="bookmark-title" style="${styleToString(titleStyle)}">${escapedTitle}</div>${descriptionHtml}
  </div>
  <div class="bookmark-featured-image" style="${styleToString(imageContainerStyle)}">${imageHtml}</div>
</figure>
<!-- /wp:html -->`;
}
