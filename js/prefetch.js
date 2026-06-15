import { getState } from './store.js';
import { resolveImageUrl, wrapPageUrls, needsImageProxy } from './image-url.js';

export { resolveImageUrl, wrapPageUrls };

const inflight = new Map();

export function shouldUseImageProxy() {
  return true;
}

function loadImage(url) {
  const existing = inflight.get(url);
  if (existing) return existing;

  const task = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { inflight.delete(url); resolve(url); };
    img.onerror = () => {
      inflight.delete(url);
      const direct = url.includes('mangadex-img?url=') || url.includes('img-proxy?url=')
        ? decodeURIComponent(url.split('url=')[1])
        : null;
      if (direct && direct !== url && !needsImageProxy(direct)) {
        loadImage(direct).then(resolve).catch(reject);
        return;
      }
      reject(new Error('Prefetch failed'));
    };
    img.src = url;
  });

  inflight.set(url, task);
  return task;
}

export function prefetchImages(urls = []) {
  if (getState().settings.prefetchEnabled === false) return;
  const ahead = getState().settings.prefetchAhead || 3;
  urls.slice(0, ahead).forEach(url => {
    loadImage(url).catch(() => {});
  });
}

export function prefetchAround(pages, index) {
  if (!pages?.length || getState().settings.prefetchEnabled === false) return;
  const ahead = getState().settings.prefetchAhead || 3;
  const urls = [];
  for (let i = index + 1; i <= index + ahead && i < pages.length; i++) {
    urls.push(pages[i].url);
  }
  prefetchImages(urls);
}

let nextChapterPrefetch = null;

export function prefetchNextChapter(getPages, chapter) {
  if (!chapter?.id || getState().settings.prefetchEnabled === false) return;
  if (nextChapterPrefetch?.id === chapter.id) return;

  nextChapterPrefetch = { id: chapter.id, promise: null };
  nextChapterPrefetch.promise = getPages(chapter.id)
    .then(pages => {
      prefetchImages(wrapPageUrls(pages).slice(0, 4).map(p => p.url));
      return pages;
    })
    .catch(() => null);
}

export function getPrefetchedChapterPages(chapterId) {
  if (nextChapterPrefetch?.id === chapterId) {
    return nextChapterPrefetch.promise;
  }
  return null;
}

export function clearPrefetchCache() {
  inflight.clear();
  nextChapterPrefetch = null;
}
