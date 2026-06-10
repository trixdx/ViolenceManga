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
      <div class="page-header">
        <h2>${t('browse.title')}</h2>
        <p>${t('browse.subtitle')}</p>
      </div>

      ${partialError ? `<div class="browse-warn">⚠️ ${t('browse.warn', { msg: partialError })}</div>` : ''}

      <div class="browse-filters">
        <h3 class="section-title">${t('home.genres')}</h3>
        <div class="tags genre-tags">
          ${POPULAR_GENRES.map(g => `<span class="tag" data-tag="${g}">${translateGenre(g)}</span>`).join('')}
        </div>
      </div>

      ${trending.length ? `
        <h3 class="section-title" style="margin-top:28px">${t('browse.top')}</h3>
        ${renderMangaGrid(trending, cardOpts())}
      ` : ''}

      ${recent.length ? `
        <h3 class="section-title" style="margin-top:28px">${t('browse.updates')}</h3>
        ${renderMangaGrid(recent, cardOpts())}
      ` : ''}
    `;

    bindMangaCards(container, (id) => navigate('manga', { id }));
    bindFavButtons(container, toggleFav);
    container.querySelectorAll('.tag[data-tag]').forEach(tag => {
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
