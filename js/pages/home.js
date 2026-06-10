import { searchManga, searchByTag, getTrending, getRecent, POPULAR_GENRES } from '../api.js';
import { getState, getContinueReading, isFavorite, addFavorite, removeFavorite, incrementStat } from '../store.js';
import {
  renderMangaGrid, showLoading, bindMangaCards, bindFavButtons,
  showToast, renderContinueSection, bindContinueCards,
} from '../ui.js';
import { checkAchievements } from '../achievements.js';
import { t } from '../i18n.js';
import { translateGenre } from '../translate.js';

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
      <div class="hero-banner">
        <div>
          <h2>${t('home.welcome', { name: state.profile.name })}</h2>
          <p>${t('home.subtitle')}</p>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><strong>${state.stats.chaptersRead}</strong><span>${t('home.chapters')}</span></div>
          <div class="hero-stat"><strong>${state.stats.pagesRead}</strong><span>${t('home.pages')}</span></div>
          <div class="hero-stat"><strong>${state.favorites.length}</strong><span>${t('home.favorites')}</span></div>
        </div>
      </div>

      ${renderContinueSection(continueItems, navigate)}

      <h3 class="section-title" style="${continueItems.length ? 'margin-top:32px' : ''}">${t('home.genres')}</h3>
      <div class="tags genre-tags">
        ${POPULAR_GENRES.map(g => `<span class="tag" data-tag="${g}">${translateGenre(g)}</span>`).join('')}
      </div>

      ${trending.length ? `
        <h3 class="section-title" style="margin-top:32px">${t('home.trending')}</h3>
        ${renderMangaGrid(trending, cardOpts())}
      ` : ''}

      ${recent.length ? `
        <h3 class="section-title" style="margin-top:32px">${t('home.recent')}</h3>
        ${renderMangaGrid(recent, cardOpts())}
      ` : ''}
    `;

    bindMangaCards(container, (id) => navigate('manga', { id }));
    bindFavButtons(container, (id) => toggleFav(id));
    bindContinueCards(container, navigate);
    container.querySelectorAll('.tag[data-tag]').forEach(tag => {
      tag.addEventListener('click', () => navigate('genre', { tag: tag.dataset.tag }));
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${t('home.loadError', { msg: err.message })}</p><button class="btn btn-primary" id="retry-btn">${t('home.retry')}</button></div>`;
    document.getElementById('retry-btn')?.addEventListener('click', () => renderHome(container, navigate));
  }
}

export async function renderSearch(container, query, navigate, offset = 0) {
  if (offset === 0) showLoading(container);
  incrementStat('searchCount');

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
    bindFavButtons(container, (id) => toggleFav(id));

    container.querySelector('#search-more')?.addEventListener('click', () => {
      renderSearch(container, query, navigate, offset + 24);
    });
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
    bindFavButtons(container, (id) => toggleFav(id));
    container.querySelector('#genre-more')?.addEventListener('click', () => {
      renderGenre(container, tagName, navigate, offset + 24);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Ошибка: ${err.message}</p></div>`;
  }
}

function toggleFav(mangaId) {
  const card = document.querySelector(`[data-manga-id="${mangaId}"]`);
  const btn = card?.querySelector('.manga-card-fav');

  if (isFavorite(mangaId)) {
    removeFavorite(mangaId);
    btn?.classList.remove('active');
    btn?.querySelector('svg')?.setAttribute('fill', 'none');
    showToast(t('toast.favRemove'));
  } else {
    const title = card?.querySelector('h3')?.textContent || '';
    const cover = card?.querySelector('img')?.src || '';
    addFavorite({ id: mangaId, title, cover });
    btn?.classList.add('active');
    btn?.querySelector('svg')?.setAttribute('fill', 'currentColor');
    showToast(t('toast.favAdd'), 'success');
    checkAchievements();
  }
}
