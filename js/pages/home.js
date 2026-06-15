import { searchManga, searchByTag, getTrending, getRecent, POPULAR_GENRES } from '../api.js';
import { getState, isFavorite, incrementStat, getContinueReading } from '../store.js';
import {
  renderMangaGrid, showLoading, bindMangaCards, bindMangaTiles,
  bindFavButtons, showToast, bindContinueCards, escapeHtml, placeholderCover,
  toggleFavCard,
} from '../ui.js';
import { checkAchievements } from '../achievements.js';
import { t } from '../i18n.js';
import { translateGenre } from '../translate.js';
import { resolveImageUrl } from '../image-url.js';
import { openReader } from '../reader.js';

const cardOpts = () => ({ showFav: true, isFavorite: (id) => isFavorite(id) });

export async function renderHome(container, navigate) {
  showLoading(container);

  try {
    const [trendRes, recentRes] = await Promise.allSettled([
      getTrending(12),
      getRecent(8),
    ]);
    const trending = trendRes.status === 'fulfilled' ? trendRes.value : [];
    const recent = recentRes.status === 'fulfilled' ? recentRes.value : [];
    if (!trending.length && !recent.length) {
      const err = trendRes.reason || recentRes.reason;
      throw err || new Error(t('home.apiError'));
    }

    const state = getState();
    const continueItems = getContinueReading();

    container.innerHTML = `
      <div class="dashboard-hero">
        <div class="dashboard-hero-main">
          <p class="eyebrow">MangaDex Reader</p>
          <h1>${t('home.welcome', { name: state.profile.name })}</h1>
          <p>${t('home.subtitle')}</p>
          <button type="button" class="hero-search-hint" id="hero-search-focus">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
            ${t('home.searchHint')} <kbd>Ctrl K</kbd>
          </button>
        </div>
        <div class="dashboard-stats">
          <div class="dash-stat-card">
            <strong class="dash-stat-value">${state.stats.chaptersRead}</strong>
            <span>${t('home.chapters')}</span>
          </div>
          <div class="dash-stat-card">
            <strong class="dash-stat-value">${state.stats.pagesRead}</strong>
            <span>${t('home.pages')}</span>
          </div>
          <div class="dash-stat-card">
            <strong class="dash-stat-value">${state.favorites.length}</strong>
            <span>${t('home.favorites')}</span>
          </div>
          <div class="dash-stat-card dash-stat-wide">
            <div>
              <strong class="dash-stat-value dash-stat-level">${t('auth.level', { level: state.profile.level })}</strong>
              <span>${state.profile.xp} XP</span>
            </div>
            <span class="dash-stat-note">${t('home.chaptersReadStat', { n: state.stats.chaptersRead })}</span>
          </div>
        </div>
      </div>

      ${continueItems.length ? `
        <div class="section-head"><h3>${t('continue.title')}</h3></div>
        <div class="manga-rail continue-rail">
          ${continueItems.map(item => `
            <div class="continue-card" data-manga-id="${item.mangaId}" data-chapter-id="${item.chapterId || ''}" data-manga-title="${escapeHtml(item.mangaTitle || '')}" data-chapter-title="${escapeHtml(item.chapterTitle || '')}" data-cover="${escapeHtml(item.cover || '')}" data-page-index="${item.pageIndex || 0}">
              <img src="${resolveImageUrl(item.cover) || placeholderCover(item.mangaTitle, 80, 110)}" alt="" />
              <div class="continue-info">
                <h4>${escapeHtml(item.mangaTitle || t('common.manga'))}</h4>
                <p>${escapeHtml(item.chapterTitle || '')}</p>
                <span>${t('continue.page', { n: (item.pageIndex || 0) + 1 })}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="section-head"><h3>${t('home.genres')}</h3></div>
      <div class="genre-strip">
        ${POPULAR_GENRES.map(g => `<button type="button" class="genre-chip" data-tag="${g}">${translateGenre(g)}</button>`).join('')}
      </div>

      ${trending.length ? `
        <div class="section-head">
          <h3>${t('home.trending')}</h3>
          <button type="button" class="see-all" data-goto="browse">${t('nav.browse')} →</button>
        </div>
        ${renderMangaGrid(trending.slice(0, 12), cardOpts())}
      ` : ''}

      ${recent.length ? `
        <div class="section-head"><h3>${t('home.recent')}</h3></div>
        ${renderMangaGrid(recent.slice(0, 12), cardOpts())}
      ` : ''}
    `;

    document.getElementById('hero-search-focus')?.addEventListener('click', () => {
      document.getElementById('search-input')?.focus();
    });
    container.querySelector('[data-goto="browse"]')?.addEventListener('click', () => navigate('browse'));

    bindMangaCards(container, (id) => navigate('manga', { id }));
    bindMangaTiles(container, (id) => navigate('manga', { id }));
    bindFavButtons(container, toggleFavCard);
    bindContinueCards(container, navigate, openReader);
    container.querySelectorAll('.genre-chip[data-tag]').forEach(tag => {
      tag.addEventListener('click', () => navigate('genre', { tag: tag.dataset.tag }));
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${t('home.loadError', { msg: err.message })}</p><button class="btn btn-primary" id="retry-btn">${t('home.retry')}</button></div>`;
    document.getElementById('retry-btn')?.addEventListener('click', () => renderHome(container, navigate));
  }
}

export async function renderSearch(container, query, navigate, offset = 0) {
  if (offset === 0) showLoading(container);
  if (offset === 0) incrementStat('searchCount');

  try {
    const { results, total } = await searchManga(query, 24, offset);
    checkAchievements();

    const gridHtml = renderMangaGrid(results, cardOpts());
    const hasMore = offset + results.length < total;

    if (offset === 0) {
      container.innerHTML = `
        <div class="page-header">
          <h2>${t('search.title')}: «${query}»</h2>
          <p>${t('search.found', { count: total })}</p>
        </div>
        <div id="search-results">${gridHtml}</div>
        ${hasMore ? `<button class="btn btn-ghost load-more-btn" id="search-more">${t('search.more')}</button>` : ''}
      `;
    } else {
      const grid = container.querySelector('.manga-grid');
      if (grid) {
        const temp = document.createElement('div');
        temp.innerHTML = gridHtml;
        temp.querySelectorAll('.manga-card').forEach(c => grid.appendChild(c));
      }
      const moreBtn = container.querySelector('#search-more');
      if (moreBtn) moreBtn.hidden = !hasMore;
    }

    bindMangaCards(container, (id) => navigate('manga', { id }));
    bindFavButtons(container, toggleFavCard);

    const moreBtn = container.querySelector('#search-more');
    if (moreBtn) {
      moreBtn.onclick = () => renderSearch(container, query, navigate, offset + 24);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${t('empty.error', { msg: err.message })}</p><button class="btn btn-primary" id="retry-search">${t('common.retry')}</button></div>`;
    document.getElementById('retry-search')?.addEventListener('click', () => renderSearch(container, query, navigate));
  }
}

export async function renderGenre(container, tagName, navigate, offset = 0) {
  if (offset === 0) showLoading(container);

  try {
    const { results, total } = await searchByTag(tagName, 24, offset);
    const gridHtml = renderMangaGrid(results, cardOpts());
    const hasMore = offset + results.length < total;

    if (offset === 0) {
      container.innerHTML = `
        <div class="page-header">
          <h2>${t('genre.title', { tag: tagName })}</h2>
          <p>${t('search.found', { count: total })}</p>
        </div>
        <div id="genre-results">${gridHtml}</div>
        ${hasMore ? `<button class="btn btn-ghost load-more-btn" id="genre-more">${t('search.more')}</button>` : ''}
      `;
    } else {
      const grid = container.querySelector('.manga-grid');
      const temp = document.createElement('div');
      temp.innerHTML = gridHtml;
      temp.querySelectorAll('.manga-card').forEach(c => grid.appendChild(c));
      container.querySelector('#genre-more').hidden = !hasMore;
    }

    bindMangaCards(container, (id) => navigate('manga', { id }));
    bindFavButtons(container, toggleFavCard);
    const genreMore = container.querySelector('#genre-more');
    if (genreMore) {
      genreMore.onclick = () => renderGenre(container, tagName, navigate, offset + 24);
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${t('empty.error', { msg: err.message })}</p></div>`;
  }
}
