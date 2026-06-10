import { getChapterPages } from './api.js';
import {
  getState, markChapterRead, addHistory, saveBookmark,
  getBookmark, updateSettings, addReadingTime, logPagesRead,
} from './store.js';
import { checkAchievements } from './achievements.js';
import { showToast, updateSidebar } from './ui.js';
import {
  prefetchAround, prefetchNextChapter, getPrefetchedChapterPages,
} from './prefetch.js';
import { getOfflineChapter } from './offline.js';
import { t } from './i18n.js';

let currentPages = [];
let currentPage = 0;
let currentChapter = null;
let currentManga = null;
let allChapters = [];
let chapterIndex = 0;
let coverUrl = '';
let readTimer = null;
let scrollHandler = null;
let zoomLevel = 1;
let thumbsVisible = false;
let chromeVisible = true;
let lastTrackedPage = -1;
let autoScrollTimer = null;
let autoScrollPaused = false;

const AUTO_SCROLL_SPEEDS = [0, 1, 2, 4, 6, 10];
const AUTO_SCROLL_LABEL_KEYS = [
  'settings.autoScrollOff',
  'settings.autoScrollSlow',
  'settings.autoScrollNormal',
  'settings.autoScrollFast',
  'settings.autoScrollFaster',
  'settings.autoScrollFaster',
];

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.15;

const overlay = () => document.getElementById('reader-overlay');
const viewport = () => document.getElementById('reader-viewport');
const thumbs = () => document.getElementById('reader-thumbnails');

export async function openReader(mangaId, mangaTitle, chapter, options = {}) {
  if (!chapter?.id) {
    showToast(t('reader.noChapter'), 'error');
    return;
  }

  if (chapter.readable === false || chapter.externalUrl) {
    showToast(t('reader.external'), 'error');
    return;
  }

  currentManga = { id: mangaId, title: mangaTitle };
  currentChapter = chapter;
  allChapters = (options.chapters || [chapter]).filter(ch => ch.readable !== false && !ch.externalUrl);
  if (!allChapters.length) allChapters = [chapter];
  coverUrl = options.cover || '';
  chapterIndex = allChapters.findIndex(c => c.id === chapter.id);
  if (chapterIndex < 0) chapterIndex = 0;

  const bookmark = getBookmark(mangaId);
  if (bookmark?.chapterId === chapter.id && bookmark.pageIndex > 0) {
    currentPage = bookmark.pageIndex;
  } else {
    currentPage = 0;
  }

  zoomLevel = 1;
  chapterCompleted = false;
  const settings = getState().settings;
  overlay().removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  updateReaderTitle();
  applyReaderClasses(settings);
  updateZoomLabel();
  syncControlButtons();

  showReaderLoading();
  startReadTimer();

  try {
    const offlinePages = await getOfflineChapter(chapter.id);
    if (offlinePages?.length) {
      currentPages = offlinePages;
      showToast(t('reader.offline'), 'info');
    } else {
      const cached = await getPrefetchedChapterPages(chapter.id);
      currentPages = cached ? await cached : await getChapterPages(chapter.id);
    }
    if (!currentPages.length) {
      showReaderError(t('reader.loadFail'));
      return;
    }
    if (currentPage >= currentPages.length) currentPage = 0;
    renderPages();
    renderThumbnails();
    if (currentPage > 0) setTimeout(() => goToPage(currentPage, false), 150);
    updatePageInfo();
    updateChapterButtons();
    lastTrackedPage = currentPage;
    prefetchAround(currentPages, currentPage);
    if (chapterIndex < allChapters.length - 1) {
      prefetchNextChapter(getChapterPages, allChapters[chapterIndex + 1]);
    }
    syncAutoScroll();
  } catch (err) {
    showReaderError(err.message);
    showToast(t('reader.loadError', { msg: err.message }), 'error');
  }
}

function showReaderLoading() {
  viewport().innerHTML = `
    <div class="reader-loading">
      <div class="loading-spinner"></div>
      <p>${t('reader.loading')}</p>
    </div>
  `;
}

function showReaderError(message) {
  viewport().innerHTML = `
    <div class="reader-error">
      <p>${t('reader.loadFail')}</p>
      <span>${message}</span>
      <button class="btn btn-primary" id="reader-retry">${t('reader.retry')}</button>
      <button class="btn btn-ghost" id="reader-close-err">${t('reader.back')}</button>
    </div>
  `;
  document.getElementById('reader-retry')?.addEventListener('click', () => {
    openReader(currentManga.id, currentManga.title, currentChapter, {
      chapters: allChapters, cover: coverUrl,
    });
  });
  document.getElementById('reader-close-err')?.addEventListener('click', closeReader);
}

function applyReaderClasses(settings) {
  const vp = viewport();
  vp.className = 'reader-viewport';
  if (settings.readingMode === 'horizontal') vp.classList.add('horizontal');
  if (settings.fitWidth) vp.classList.add('fit-width');
  if (settings.pageSpread) vp.classList.add('spread');
  applyZoom();
}

function syncControlButtons() {
  const vp = viewport();
  const s = getState().settings;
  document.getElementById('reader-fit')?.classList.toggle('active', vp?.classList.contains('fit-width') ?? s.fitWidth);
  document.getElementById('reader-mode')?.classList.toggle('active', vp?.classList.contains('horizontal') ?? s.readingMode === 'horizontal');
  document.getElementById('reader-spread')?.classList.toggle('active', vp?.classList.contains('spread') ?? s.pageSpread);
  document.getElementById('reader-thumbs')?.classList.toggle('active', thumbsVisible);
  const speed = getState().settings.autoScrollSpeed || 0;
  document.getElementById('reader-autoscroll')?.classList.toggle('active', speed > 0);
}

function updateReaderTitle() {
  document.getElementById('reader-title').textContent =
    `${currentManga.title} — ${currentChapter.title}`;
}

function isSpreadMode() {
  return viewport().classList.contains('spread');
}

function pageStep() {
  return isSpreadMode() ? 2 : 1;
}

function pageImgTag(url, label, eager) {
  return `<img src="${url}" alt="${label}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" />`;
}

function bindPageImages(vp) {
  vp.querySelectorAll('.reader-page').forEach(page => {
    const img = page.querySelector('img');
    if (!img) return;
    page.classList.add('loading');

    const direct = page.dataset.direct;
    let triedFallback = false;
    let timeout;

    const markDone = () => {
      clearTimeout(timeout);
      page.classList.remove('loading');
      page.classList.remove('error');
    };
    const markError = () => {
      clearTimeout(timeout);
      page.classList.remove('loading');
      page.classList.add('error');
    };

    const armTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!img.complete || img.naturalWidth === 0) markError();
      }, 25000);
    };

    img.addEventListener('load', markDone);
    img.addEventListener('error', () => {
      if (!triedFallback && direct && img.src !== direct) {
        triedFallback = true;
        img.src = direct;
        armTimeout();
        return;
      }
      markError();
    });

    armTimeout();
    if (img.complete && img.naturalWidth > 0) markDone();
  });
}

function renderPages() {
  const vp = viewport();
  if (scrollHandler) vp.removeEventListener('scroll', scrollHandler);

  if (isSpreadMode()) {
    let html = '';
    for (let i = 0; i < currentPages.length; i += 2) {
      const p1 = currentPages[i];
      const p2 = currentPages[i + 1];
      html += `
        <div class="reader-spread" data-page="${i}">
          <div class="reader-page" data-sub="0" data-direct="${p1.direct || p1.url}">
            ${pageImgTag(p1.url, t('reader.page', { n: i + 1 }), i < 2)}
          </div>
          ${p2 ? `<div class="reader-page" data-sub="1" data-direct="${p2.direct || p2.url}">
            ${pageImgTag(p2.url, t('reader.page', { n: i + 2 }), i < 2)}
          </div>` : ''}
        </div>`;
    }
    vp.innerHTML = html;
  } else {
    vp.innerHTML = currentPages.map((page, i) => `
      <div class="reader-page" data-page="${i}" data-direct="${page.direct || page.url}">
        ${pageImgTag(page.url, t('reader.page', { n: i + 1 }), i < 3)}
      </div>
    `).join('');
  }

  bindPageImages(vp);
  scrollHandler = onScroll;
  vp.addEventListener('scroll', scrollHandler, { passive: true });
  applyZoom();
}

function renderThumbnails() {
  const bar = thumbs();
  if (!bar) return;
  bar.innerHTML = currentPages.map((p, i) => `
    <button class="reader-thumb ${i === currentPage ? 'active' : ''}" data-thumb="${i}" title="${t('reader.page', { n: i + 1 })}">
      <img src="${p.url}" alt="" loading="lazy" />
      <span>${i + 1}</span>
    </button>
  `).join('');

  bar.querySelectorAll('.reader-thumb').forEach(btn => {
    btn.addEventListener('click', () => goToPage(parseInt(btn.dataset.thumb)));
  });
}

function updateThumbnails() {
  thumbs()?.querySelectorAll('.reader-thumb').forEach((btn, i) => {
    btn.classList.toggle('active', i === currentPage);
  });
  const active = thumbs()?.querySelector('.reader-thumb.active');
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function onScroll() {
  const vp = viewport();
  const settings = getState().settings;
  const items = isSpreadMode() ? vp.querySelectorAll('.reader-spread') : vp.querySelectorAll('.reader-page');

  if (settings.readingMode === 'horizontal') {
    const itemWidth = items[0]?.offsetWidth || 1;
    const idx = Math.round(vp.scrollLeft / (itemWidth + 4));
    currentPage = isSpreadMode() ? idx * 2 : idx;
  } else {
    const vpRect = vp.getBoundingClientRect();
    let closest = 0;
    let minDist = Infinity;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top - vpRect.top);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    currentPage = isSpreadMode() ? closest * 2 : closest;
  }

  if (currentPage >= currentPages.length) currentPage = currentPages.length - 1;

  if (currentPage > lastTrackedPage) {
    logPagesRead(currentPage - lastTrackedPage);
    lastTrackedPage = currentPage;
    prefetchAround(currentPages, currentPage);
  }

  updatePageInfo();
  updateThumbnails();
  saveProgress();

  if (currentPage >= currentPages.length - 1) checkChapterComplete();
}

function saveProgress() {
  saveBookmark(currentManga.id, {
    chapterId: currentChapter.id,
    chapterTitle: currentChapter.title,
    mangaTitle: currentManga.title,
    pageIndex: currentPage,
    cover: coverUrl,
  });
}

function updatePageInfo() {
  const total = currentPages.length;
  const info = document.getElementById('reader-page-info');
  if (isSpreadMode()) {
    const spreadNum = Math.floor(currentPage / 2) + 1;
    const totalSpreads = Math.ceil(total / 2);
    info.textContent = `${spreadNum} / ${totalSpreads} (стр. ${currentPage + 1})`;
  } else {
    info.textContent = `${currentPage + 1} / ${total}`;
  }
  document.getElementById('reader-progress-bar').style.width =
    `${((currentPage + 1) / total) * 100}%`;
}

function updateChapterButtons() {
  document.getElementById('reader-prev-chapter').disabled = chapterIndex <= 0;
  document.getElementById('reader-next-chapter').disabled = chapterIndex >= allChapters.length - 1;
}

let chapterCompleted = false;

function checkChapterComplete() {
  if (chapterCompleted) return;
  chapterCompleted = true;
  finishChapter();
}

function finishChapter() {
  const { isNew, leveledUp } = markChapterRead(
    currentChapter.id, currentManga.id, currentPages.length
  );
  addHistory({
    mangaId: currentManga.id,
    title: currentManga.title,
    cover: coverUrl,
    chapter: currentChapter.title,
  });
  checkAchievements();
  updateSidebar();
  if (isNew) showToast(t('reader.chapterRead'), 'success');
  if (leveledUp) showToast(t('reader.levelUp', { level: getState().profile.level }), 'achievement');
}

function goToPage(index, smooth = true) {
  if (index < 0) return;
  if (index >= currentPages.length) {
    if (chapterIndex < allChapters.length - 1) goToChapter(chapterIndex + 1);
    else checkChapterComplete();
    return;
  }
  currentPage = index;
  const selector = isSpreadMode()
    ? `.reader-spread[data-page="${Math.floor(index / 2) * 2}"]`
    : `[data-page="${index}"]`;
  viewport().querySelector(selector)?.scrollIntoView({
    behavior: smooth ? 'smooth' : 'instant',
    block: 'start',
    inline: 'start',
  });
  updatePageInfo();
  updateThumbnails();
  saveProgress();
}

async function goToChapter(index) {
  if (index < 0 || index >= allChapters.length) return;
  saveProgress();
  chapterCompleted = false;
  await openReader(currentManga.id, currentManga.title, allChapters[index], {
    chapters: allChapters, cover: coverUrl,
  });
}

function setZoom(level) {
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
  applyZoom();
  updateZoomLabel();
}

function applyZoom() {
  viewport().style.setProperty('--reader-zoom', zoomLevel);
}

function updateZoomLabel() {
  const el = document.getElementById('reader-zoom-label');
  if (el) el.textContent = `${Math.round(zoomLevel * 100)}%`;
}

function toggleSpread() {
  const vp = viewport();
  vp.classList.toggle('spread');
  const on = vp.classList.contains('spread');
  updateSettings({ pageSpread: on });
  renderPages();
  renderThumbnails();
  goToPage(currentPage, false);
  syncControlButtons();
  showToast(on ? t('reader.spreadOn') : t('reader.spreadOff'));
}

function toggleThumbnails() {
  thumbsVisible = !thumbsVisible;
  const bar = thumbs();
  if (bar) bar.hidden = !thumbsVisible;
  syncControlButtons();
  if (thumbsVisible) updateThumbnails();
}

function toggleFullscreen() {
  const el = overlay();
  if (!document.fullscreenElement) {
    el.requestFullscreen?.().catch(() => showToast(t('reader.fullscreenFail')));
  } else {
    document.exitFullscreen?.();
  }
}

function toggleChrome() {
  chromeVisible = !chromeVisible;
  overlay().classList.toggle('chrome-hidden', !chromeVisible);
}

function startReadTimer() {
  stopReadTimer();
  readTimer = setInterval(() => addReadingTime(10), 10000);
}

function stopReadTimer() {
  if (readTimer) { clearInterval(readTimer); readTimer = null; }
}

function stopAutoScroll() {
  if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
}

function syncAutoScroll() {
  stopAutoScroll();
  const idx = getState().settings.autoScrollSpeed || 0;
  const px = AUTO_SCROLL_SPEEDS[idx] || 0;
  if (!px) return;

  autoScrollTimer = setInterval(() => {
    if (autoScrollPaused || overlay().hasAttribute('hidden')) return;
    const vp = viewport();
    const horizontal = getState().settings.readingMode === 'horizontal';
    const max = horizontal ? vp.scrollWidth - vp.clientWidth : vp.scrollHeight - vp.clientHeight;
    const pos = horizontal ? vp.scrollLeft : vp.scrollTop;
    if (pos >= max - 2) {
      stopAutoScroll();
      return;
    }
    if (horizontal) vp.scrollLeft += px;
    else vp.scrollTop += px;
  }, 16);
}

function pauseAutoScrollBriefly() {
  autoScrollPaused = true;
  clearTimeout(pauseAutoScrollBriefly._t);
  pauseAutoScrollBriefly._t = setTimeout(() => { autoScrollPaused = false; }, 2000);
}

function cycleAutoScroll() {
  const cur = getState().settings.autoScrollSpeed || 0;
  const next = cur >= AUTO_SCROLL_SPEEDS.length - 1 ? 0 : cur + 1;
  updateSettings({ autoScrollSpeed: next });
  syncAutoScroll();
  syncControlButtons();
  if (next === 0) showToast(t('reader.autoscrollOff'));
  else showToast(t('reader.autoscrollOn', { speed: t(AUTO_SCROLL_LABEL_KEYS[next]) }));
}

export function closeReader() {
  if (currentManga && currentChapter) saveProgress();
  stopReadTimer();
  stopAutoScroll();
  if (document.fullscreenElement) document.exitFullscreen?.();
  overlay().hidden = true;
  overlay().setAttribute('hidden', '');
  overlay().classList.remove('chrome-hidden');
  document.body.style.overflow = '';
  if (scrollHandler) viewport().removeEventListener('scroll', scrollHandler);
  thumbsVisible = false;
  if (thumbs()) thumbs().hidden = true;
  currentPages = [];
  currentPage = 0;
  chapterCompleted = false;
  zoomLevel = 1;
}

export function initReader() {
  document.getElementById('reader-back')?.addEventListener('click', closeReader);
  document.getElementById('reader-prev')?.addEventListener('click', () => goToPage(currentPage - pageStep()));
  document.getElementById('reader-next')?.addEventListener('click', () => goToPage(currentPage + pageStep()));
  document.getElementById('reader-prev-chapter')?.addEventListener('click', () => goToChapter(chapterIndex - 1));
  document.getElementById('reader-next-chapter')?.addEventListener('click', () => goToChapter(chapterIndex + 1));

  document.getElementById('reader-zoom-in')?.addEventListener('click', () => setZoom(zoomLevel + ZOOM_STEP));
  document.getElementById('reader-zoom-out')?.addEventListener('click', () => setZoom(zoomLevel - ZOOM_STEP));

  document.getElementById('reader-fit')?.addEventListener('click', () => {
    viewport().classList.toggle('fit-width');
    updateSettings({ fitWidth: viewport().classList.contains('fit-width') });
    syncControlButtons();
  });

  document.getElementById('reader-mode')?.addEventListener('click', () => {
    viewport().classList.toggle('horizontal');
    const mode = viewport().classList.contains('horizontal') ? 'horizontal' : 'vertical';
    updateSettings({ readingMode: mode });
    syncControlButtons();
  });

  document.getElementById('reader-spread')?.addEventListener('click', toggleSpread);
  document.getElementById('reader-thumbs')?.addEventListener('click', toggleThumbnails);
  document.getElementById('reader-fullscreen')?.addEventListener('click', toggleFullscreen);
  document.getElementById('reader-autoscroll')?.addEventListener('click', cycleAutoScroll);

  viewport()?.addEventListener('wheel', (e) => {
    pauseAutoScrollBriefly();
    if (overlay().hasAttribute('hidden')) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }
  }, { passive: false });

  viewport()?.addEventListener('click', (e) => {
    pauseAutoScrollBriefly();
    if (overlay().hasAttribute('hidden')) return;
    if (e.target.closest('.reader-controls, .reader-footer, .reader-thumb, button')) return;
    if (e.target.closest('.reader-header, .reader-thumbnails, .reader-footer')) return;
    const rect = viewport().getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.3) goToPage(currentPage - pageStep());
    else if (x > rect.width * 0.7) goToPage(currentPage + pageStep());
  });

  let lastTap = 0;
  viewport()?.addEventListener('touchend', () => {
    pauseAutoScrollBriefly();
    const now = Date.now();
    if (now - lastTap < 300) toggleChrome();
    lastTap = now;
  });

  document.addEventListener('fullscreenchange', () => {
    document.getElementById('reader-fullscreen')?.classList.toggle('active', !!document.fullscreenElement);
  });

  document.addEventListener('keydown', (e) => {
    if (overlay().hasAttribute('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === 'd') {
      e.shiftKey ? goToChapter(chapterIndex + 1) : goToPage(currentPage + pageStep());
    }
    if (e.key === 'ArrowLeft' || e.key === 'a') {
      e.shiftKey ? goToChapter(chapterIndex - 1) : goToPage(currentPage - pageStep());
    }
    if (e.key === '+' || e.key === '=') setZoom(zoomLevel + ZOOM_STEP);
    if (e.key === '-') setZoom(zoomLevel - ZOOM_STEP);
    if (e.key === '0') setZoom(1);
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    if (e.key === 't' || e.key === 'T') toggleThumbnails();
    if (e.key === 'h' || e.key === 'H') toggleChrome();
    if (e.key === 's' || e.key === 'S') cycleAutoScroll();
    if (e.key === 'Escape') {
      if (document.fullscreenElement) document.exitFullscreen();
      else closeReader();
    }
  });
}
