import { getTrending, getRecent, POPULAR_GENRES } from '../api.js';
import { isFavorite, addFavorite, removeFavorite } from '../store.js';
import { renderMangaGrid, showLoading, bindMangaCards, bindFavButtons, showToast } from '../ui.js';
import { checkAchievements } from '../achievements.js';
import { t } from '../i18n.js';
import { translateGenre } from '../translate.js';

const cardOpts = () => ({ showFav: true, isFavorite: (id) => isFavorite(id) });

export async function renderBrowse(container, navigate) {
  showLoading(container);

  try {
    const [trendRes, recentRes] = await Promise.allSettled([
      getTrending(18),
      getRecent(12),
    ]);
    const trending = trendRes.status === 'fulfilled' ? trendRes.value : [];
    const recent = recentRes.status === 'fulfilled' ? recentRes.value : [];
    const partialError = trendRes.reason?.message || recentRes.reason?.message || '';

    if (!trending.length && !recent.length) {
      throw new Error(partialError || t('browse.loadError'));
    }

    container.innerHTML = `
      <div class="page-hero-strip">
        <div>
          <p class="eyebrow">${t('nav.browse')}</p>
          <h2>${t('browse.title')}</h2>
          <p class="page-hero-desc">${t('browse.subtitle')}</p>
        </div>
      </div>

      ${partialError ? `<div class="browse-warn">⚠️ ${t('browse.warn', { msg: partialError })}</div>` : ''}

      <div class="section-head"><h3>${t('home.genres')}</h3></div>
      <div class="genre-strip">
        ${POPULAR_GENRES.map(g => `<button type="button" class="genre-chip" data-tag="${g}">${translateGenre(g)}</button>`).join('')}
      </div>

      ${trending.length ? `
        <div class="section-head"><h3>${t('browse.top')}</h3></div>
        ${renderMangaGrid(trending, cardOpts())}
      ` : ''}

      ${recent.length ? `
        <div class="section-head"><h3>${t('browse.updates')}</h3></div>
        ${renderMangaGrid(recent, cardOpts())}
      ` : ''}
    `;

    bindMangaCards(container, (id) => navigate('manga', { id }));
    bindFavButtons(container, toggleFav);
    container.querySelectorAll('.genre-chip[data-tag]').forEach(tag => {
      tag.addEventListener('click', () => navigate('genre', { tag: tag.dataset.tag }));
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${t('empty.error', { msg: err.message })}</p><button class="btn btn-primary" id="retry-browse">${t('common.retry')}</button></div>`;
    document.getElementById('retry-browse')?.addEventListener('click', () => renderBrowse(container, navigate));
  }
}

function toggleFav(mangaId) {
  const card = document.querySelector(`[data-manga-id="${mangaId}"]`);
  const btn = card?.querySelector('.manga-card-fav');
  if (isFavorite(mangaId)) {
    removeFavorite(mangaId);
    btn?.classList.remove('active');
    btn?.querySelector('svg')?.setAttribute('fill', 'none');
    showToast('Удалено из избранного');
  } else {
    addFavorite({
      id: mangaId,
      title: card?.querySelector('h3')?.textContent || '',
      cover: card?.querySelector('img')?.src || '',
    });
    btn?.classList.add('active');
    btn?.querySelector('svg')?.setAttribute('fill', 'currentColor');
    showToast('Добавлено в избранное', 'success');
    checkAchievements();
  }
}
