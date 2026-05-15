import type { LinkPreviewMetadata } from '../interface/linkPreviewMetadata.js';

type BookmarkTemplateData = Pick<LinkPreviewMetadata, 'url' | 'title' | 'description' | 'featuredImage'>;

function camelToKebab(value: string): string {
  return value.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function styleToString(styles: Record<string, string | number | undefined>): string {
  return Object.entries(styles)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
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

function getCardStyles(): Record<string, string> {
  return {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.05)',
    margin: '12px 0',
    minHeight: '80px',
  };
}

function getImageContainerStyles(): Record<string, string> {
  return {
    position: 'relative',
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
    flex: '0 0 30%',
  };
}

function getImageStyles(): Record<string, string> {
  return {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  };
}

function getContentContainerStyles(): Record<string, string> {
  return {
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    flex: '1',
  };
}

function getTitleStyles(): Record<string, string> {
  return {
    margin: '0 0 4px 0',
    fontSize: '0.95rem',
    fontWeight: '500',
    color: '#111827',
    lineHeight: '1.3',
    overflowWrap: 'anywhere',
  };
}

function getRowContainerStyles(): Record<string, string> {
  return {
    display: 'flex',
    gap: '14px',
    alignItems: 'stretch',
    position: 'relative',
    zIndex: '1',
  };
}

function getCardPositioningStyles(): Record<string, string> {
  return {
    position: 'relative',
  };
}

function getOverlayLinkStyles(): Record<string, string> {
  return {
    position: 'absolute',
    inset: '0',
    display: 'block',
    zIndex: '3',
    textDecoration: 'none',
  };
}

function getDescriptionStyles(): Record<string, string> {
  return {
    margin: '4px 0 0 0',
    fontSize: '0.85rem',
    color: '#6b7280',
    lineHeight: '1.4',
    maxHeight: '3.6em',
    overflow: 'hidden',
  };
}

export function renderBookmarkHTML(data: BookmarkTemplateData): string {
  const displayTitle = data.title.trim().length > 0 ? data.title : data.url;
  const overlayLinkHtml = `<a class="bookmark-overlay-link" href="${escapeHtml(
    data.url
  )}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(
    displayTitle
  )}" style="${styleToString(getOverlayLinkStyles())}"></a>`;

  const imageHtml = data.featuredImage
    ? `<div class="bookmark-featured-image" style="${styleToString(getImageContainerStyles())}">
        <img src="${escapeHtml(data.featuredImage)}" alt="${escapeHtml(
          displayTitle
        )}" style="${styleToString(getImageStyles())}" />
      </div>`
    : `<div class="bookmark-featured-image" style="${styleToString(getImageContainerStyles())}"></div>`;

  const descriptionHtml = data.description
    ? `<p class="bookmark-description" style="${styleToString(
        getDescriptionStyles()
      )}">${escapeHtml(data.description)}</p>`
    : '';

  const contentHtml = `<div class="bookmark-content" style="${styleToString(getContentContainerStyles())}">
      <p class="bookmark-title" style="${styleToString(getTitleStyles())}">
        ${escapeHtml(displayTitle)}
      </p>
      ${descriptionHtml}
    </div>`;

  const rowHtml = `<div class="bookmark-row" style="${styleToString(getRowContainerStyles())}">
    ${imageHtml}
    ${contentHtml}
  </div>`;

  return `<figure class="bookmark-card" style="${styleToString({
    ...getCardStyles(),
    ...getCardPositioningStyles(),
  })}">
    ${overlayLinkHtml}
    ${rowHtml}
  </figure>`;
}
