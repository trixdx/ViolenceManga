import { getState } from './store.js';

export function resolveImageUrl(directUrl) {
  if (!directUrl) return directUrl;
  const s = getState().settings;
  if (s.imageProxy !== false && import.meta.env.DEV) {
    return `/mangadex-img?url=${encodeURIComponent(directUrl)}`;
  }
  return directUrl;
}

export function wrapPageUrls(pages) {
  return pages.map(p => ({
    ...p,
    url: resolveImageUrl(p.direct || p.url),
    direct: p.direct || p.url,
  }));
}
