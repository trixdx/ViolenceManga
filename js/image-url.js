export function needsImageProxy(url) {
  if (!url || url.startsWith('data:') || url.startsWith('/')) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === 'uploads.mangadex.org'
      || hostname.endsWith('.mangadex.network')
      || hostname === 'mangadex.network'
      || hostname.endsWith('.mangadex.org');
  } catch {
    return /mangadex\.(org|network)/i.test(url);
  }
}

export function resolveImageUrl(directUrl) {
  if (!directUrl) return directUrl;
  if (directUrl.startsWith('/mangadex-img') || directUrl.startsWith('/api/img-proxy')) {
    return directUrl;
  }
  if (!needsImageProxy(directUrl)) return directUrl;

  const encoded = encodeURIComponent(directUrl);
  return `/mangadex-img?url=${encoded}`;
}

export function wrapPageUrls(pages) {
  return pages.map(p => ({
    ...p,
    url: resolveImageUrl(p.direct || p.url),
    direct: p.direct || p.url,
  }));
}
