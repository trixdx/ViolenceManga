import { getState, isFavorite, addFavorite, removeFavorite } from './store.js';
import { isLoggedIn, getCurrentUser } from './auth.js';
import { applyAvatarEl, refreshAllAvatars } from './avatars.js';
import { t } from './i18n.js';
import { resolveImageUrl } from './image-url.js';
import { getChapters } from './api.js';
import { checkAchievements } from './achievements.js';

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

export function showModal(title, bodyHtml, actions = []) {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="modal">
      <h3 class="modal-title">${title}</h3>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions">
        ${actions.map(a => `<button class="btn ${a.class || 'btn-ghost'}" data-action="${a.id}">${a.label}</button>`).join('')}
      </div>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) hideModal(); };
  actions.forEach(a => {
    overlay.querySelector(`[data-action="${a.id}"]`)?.addEventListener('click', () => {
      a.onClick?.();
      if (a.close !== false) hideModal();
    });
  });
}

export function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = true;
  overlay.innerHTML = '';
}

export function showNotificationsPanel() {
  const state = getState();
  const items = state.notifications.length
    ? state.notifications.map(n => `
        <div class="notif-item">
          <span class="notif-icon">${n.type === 'achievement' ? '🏆' : '🔔'}</span>
          <div>
            <strong>${escapeHtml(n.message)}</strong>
            ${n.detail ? `<p>${escapeHtml(n.detail)}</p>` : ''}
            <span class="notif-time">${new Date(n.at).toLocaleString('ru-RU')}</span>
          </div>
        </div>
      `).join('')
    : `<p class="empty-notif">${t('notif.empty')}</p>`;

  showModal(t('notif.title'), `<div class="notif-list">${items}</div>`, [
    { id: 'close', label: t('notif.close'), class: 'btn-primary' },
  ]);
}

export function showShortcutsHelp() {
  showModal(t('shortcuts.title'), `
    <div class="shortcuts-list">
      <div class="shortcut-row"><kbd>Ctrl</kbd> + <kbd>K</kbd><span>${t('shortcuts.search')}</span></div>
      <div class="shortcut-row"><kbd>?</kbd><span>${t('shortcuts.help')}</span></div>
      <div class="shortcut-row"><kbd>←</kbd> / <kbd>A</kbd><span>${t('shortcuts.prevPage')}</span></div>
      <div class="shortcut-row"><kbd>→</kbd> / <kbd>D</kbd><span>${t('shortcuts.nextPage')}</span></div>
      <div class="shortcut-row"><kbd>Shift</kbd> + <kbd>←</kbd><span>${t('shortcuts.prevChapter')}</span></div>
      <div class="shortcut-row"><kbd>Shift</kbd> + <kbd>→</kbd><span>${t('shortcuts.nextChapter')}</span></div>
      <div class="shortcut-row"><kbd>+</kbd> / <kbd>−</kbd><span>${t('shortcuts.zoom')}</span></div>
      <div class="shortcut-row"><kbd>Ctrl</kbd> + wheel<span>${t('shortcuts.zoomWheel')}</span></div>
      <div class="shortcut-row"><kbd>F</kbd><span>${t('shortcuts.fullscreen')}</span></div>
      <div class="shortcut-row"><kbd>T</kbd><span>${t('shortcuts.thumbs')}</span></div>
      <div class="shortcut-row"><kbd>S</kbd><span>${t('reader.autoscroll')}</span></div>
      <div class="shortcut-row"><kbd>H</kbd><span>${t('shortcuts.hideChrome')}</span></div>
      <div class="shortcut-row">${t('shortcuts.clickSides')}<span>${t('shortcuts.prevPage')}</span></div>
      <div class="shortcut-row"><kbd>Esc</kbd><span>${t('shortcuts.close')}</span></div>
    </div>
  `, [{ id: 'ok', label: t('shortcuts.ok'), class: 'btn-primary' }]);
}

export function showLoading(container) {
  container.innerHTML = '<div class="loading-spinner"></div>';
}

export function placeholderCover(text = '?', w = 300, h = 400) {
  const ch = String(text || '?').slice(0, 2).replace(/[<>&"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect fill="#1a1230" width="100%" height="100%"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#c4b5e8" font-size="${Math.round(Math.min(w, h) * 0.22)}" font-family="system-ui,sans-serif">${ch}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const COVER_PLACEHOLDER = placeholderCover('?');

function coverSrc(url, title, size = '300x400') {
  const resolved = resolveImageUrl(url);
  if (resolved) return resolved;
  const [w, h] = size.split('x').map(Number);
  return placeholderCover(title, w || 300, h || 400);
}

function coverImgTag(url, title, size = '300x400') {
  const src = coverSrc(url, title, size);
  const fb = COVER_PLACEHOLDER;
  return `<img src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${fb}'" />`;
}

export function renderMangaCard(manga, options = {}) {
  const isFav = typeof options.isFavorite === 'function'
    ? options.isFavorite(manga.id)
    : !!options.isFavorite;
  const favBtn = options.showFav
    ? `<button class="manga-card-fav ${isFav ? 'active' : ''}" data-fav="${manga.id}" aria-label="Избранное">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
      </button>`
    : '';

  const tagStr = (manga.tags || [])
    .map(t => typeof t === 'string' ? t : t.name)
    .slice(0, 2).join(' · ');

  return `
    <div class="manga-card" data-manga-id="${manga.id}">
      <div class="manga-card-cover">
        ${coverImgTag(manga.cover, manga.title)}
        ${manga.status ? `<span class="manga-card-badge">${manga.status}</span>` : ''}
        ${favBtn}
      </div>
      <div class="manga-card-info">
        <h3>${escapeHtml(manga.title)}</h3>
        <span>${manga.year || ''} ${tagStr}</span>
      </div>
    </div>
  `;
}

export function renderMangaRail(mangaList, options = {}) {
  if (!mangaList.length) return '';
  return `<div class="manga-rail">${mangaList.map(m => renderMangaTile(m, options)).join('')}</div>`;
}

export function renderMangaTile(manga, options = {}) {
  const tagStr = (manga.tags || [])
    .map(tg => typeof tg === 'string' ? tg : tg.name)
    .slice(0, 1).join('');

  return `
    <article class="manga-tile" data-manga-id="${manga.id}">
      <div class="manga-tile-cover">
        ${coverImgTag(manga.cover, manga.title, '200x280')}
      </div>
      <h4>${escapeHtml(manga.title)}</h4>
      <div class="manga-tile-meta">${manga.year || ''}${tagStr ? ` · ${tagStr}` : ''}</div>
    </article>
  `;
}

export function bindMangaTiles(container, onClick) {
  container.querySelectorAll('.manga-tile').forEach(tile => {
    tile.addEventListener('click', () => onClick(tile.dataset.mangaId));
  });
}

export function renderMangaGrid(mangaList, options = {}) {
  if (!mangaList.length) {
    return `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
      <p>${t('empty.nothing')}</p>
    </div>`;
  }
  return `<div class="manga-grid">${mangaList.map(m => renderMangaCard(m, options)).join('')}</div>`;
}

export function renderContinueSection(items, navigate) {
  if (!items.length) return '';
  return `
    <h3 class="section-title">${t('continue.title')}</h3>
    <div class="continue-grid">
      ${items.map(item => `
        <div class="continue-card" data-manga-id="${item.mangaId}">
          <img src="${resolveImageUrl(item.cover) || placeholderCover(item.mangaTitle || t('common.manga'), 80, 110)}" alt="" />
          <div class="continue-info">
            <h4>${escapeHtml(item.mangaTitle || t('common.manga'))}</h4>
            <p>${escapeHtml(item.chapterTitle || '')}</p>
            <span>${t('continue.page', { n: (item.pageIndex || 0) + 1 })}</span>
          </div>
          <button class="btn btn-primary btn-sm">${t('continue.read')}</button>
        </div>
      `).join('')}
    </div>
  `;
}

export function bindContinueCards(container, navigate, openReader) {
  container.querySelectorAll('.continue-card').forEach(card => {
    card.addEventListener('click', async () => {
      const mangaId = card.dataset.mangaId;
      const chapterId = card.dataset.chapterId;
      if (!openReader || !chapterId) {
        navigate('manga', { id: mangaId });
        return;
      }
      try {
        const { chapters } = await getChapters(mangaId, 500, 0);
        const ch = chapters.find(c => c.id === chapterId);
        if (!ch) {
          navigate('manga', { id: mangaId });
          return;
        }
        const pageIndex = parseInt(card.dataset.pageIndex || '0', 10);
        openReader(mangaId, card.dataset.mangaTitle || t('common.manga'), ch, {
          chapters,
          cover: card.dataset.cover || '',
          startPage: pageIndex,
        });
      } catch {
        navigate('manga', { id: mangaId });
      }
    });
  });
}

export function toggleFavCard(mangaId) {
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

export function updateSidebar() {
  const state = getState();
  document.querySelectorAll('[data-user-name]').forEach(el => {
    el.textContent = state.profile.name;
  });
  const hintText = isLoggedIn()
    ? (getCurrentUser()?.email || t('auth.level', { level: state.profile.level }))
    : t('auth.guestLevel', { level: state.profile.level });
  document.querySelectorAll('[data-user-hint]').forEach(el => {
    el.textContent = hintText;
  });
  document.querySelectorAll('[data-user-avatar]').forEach(el => {
    applyAvatarEl(el, state.profile);
  });

  const badge = document.getElementById('notif-badge');
  const count = state.notifications.length;
  if (count > 0) {
    badge.hidden = false;
    badge.textContent = count > 9 ? '9+' : count;
  } else {
    badge.hidden = true;
  }
}

export { applyTheme, applyVisualSettings, applyAllVisualSettings, animatePageEnter, PALETTES } from './theme.js';
export { refreshAllAvatars } from './avatars.js';

export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function formatReadTime(seconds) {
  if (seconds < 60) return t('time.sec', { n: seconds });
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return t('time.min', { n: mins });
  const hrs = Math.floor(mins / 60);
  return t('time.hr', { h: hrs, m: mins % 60 });
}

export function bindMangaCards(container, onClick) {
  container.querySelectorAll('.manga-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.manga-card-fav')) return;
      onClick(card.dataset.mangaId);
    });
  });
}

export function bindFavButtons(container, onToggle) {
  container.querySelectorAll('.manga-card-fav').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle(btn.dataset.fav);
    });
  });
}

export function bindTagButtons(container, onTag) {
  container.querySelectorAll('.tag[data-tag]').forEach(tag => {
    tag.addEventListener('click', () => onTag(tag.dataset.tag));
  });
}
