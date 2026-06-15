import { getMangaById, getChapters, getLanguageName, getChapterPages } from '../api.js';
import {
  getState, isFavorite, addFavorite, removeFavorite, addHistory,
  incrementStat, getBookmark, addToList, getMangaListStatus, updateSettings, logGenres,
} from '../store.js';
import { showLoading, escapeHtml, showToast, bindTagButtons, placeholderCover } from '../ui.js';
import { resolveImageUrl } from '../image-url.js';
import { checkAchievements } from '../achievements.js';
import { t } from '../i18n.js';
import {
  listCachedChapters, cacheChapter, removeCachedChapter,
} from '../offline.js';

let cachedChapters = [];
let cachedOfflineIds = new Set();

export async function renderMangaDetail(container, mangaId, navigate, openReader) {
  showLoading(container);
  incrementStat('mangaOpened');
  checkAchievements();

  try {
    const manga = await getMangaById(mangaId);
    logGenres(manga.tags);
    const chapterData = await getChapters(mangaId, 100, 0);
    cachedChapters = chapterData.chapters;

    const offlineList = await listCachedChapters();
    cachedOfflineIds = new Set(offlineList.map(c => c.chapterId));

    const state = getState();
    const fav = isFavorite(mangaId);
    const bookmark = getBookmark(mangaId);
    const listStatus = getMangaListStatus(mangaId);
    const cover = resolveImageUrl(manga.cover) || placeholderCover(manga.title, 300, 400);

    addHistory({ mangaId, title: manga.title, cover, chapter: bookmark?.chapterTitle || '' });

    const resumeChapter = bookmark
      ? cachedChapters.find(c => c.id === bookmark.chapterId)
      : null;

    const sort = state.settings.chapterSort || 'asc';
    const firstChapter = sort === 'asc'
      ? cachedChapters[0]
      : cachedChapters[cachedChapters.length - 1];
    const startChapter = resumeChapter || firstChapter;

    const readBtnText = resumeChapter
      ? t('manga.continue', { chapter: resumeChapter.title })
      : cachedChapters.length
        ? t('manga.readStart')
        : t('manga.noChapters');

    const langNotice = chapterData.activeLanguage
      ? (chapterData.usedFallback || chapterData.noPreferredLang
        ? `<div class="chapter-lang-notice chapter-lang-warn">
            <p>${t('manga.langFallback', {
              active: getLanguageName(chapterData.activeLanguage),
              preferred: getLanguageName(chapterData.preferredLang),
            })}</p>
            <p class="chapter-lang-hint">${t('manga.langFallbackHint')}</p>
          </div>`
        : `<div class="chapter-lang-notice chapter-lang-ok">
            <p>${t('manga.langActive', { lang: getLanguageName(chapterData.activeLanguage) })}</p>
          </div>`)
      : '';

    const chapterList = cachedChapters.length
      ? langNotice + renderChapterList(cachedChapters, state)
      : chapterData.hasExternalOnly
        ? `<div class="chapter-empty-notice">
            <p>${t('manga.externalOnly')}</p>
            <p>${t('manga.noScans')}</p>
            ${chapterData.externalCount ? `<p style="margin-top:8px;color:var(--text-muted)">${t('manga.externalCount', { n: chapterData.externalCount })}</p>` : ''}
          </div>`
        : `<p class="chapter-empty-notice">${t('manga.noReadable')}</p>`;

    const desc = manga.description || t('manga.noDesc');
    const isLong = desc.length > 300;
    const listLabels = {
      reading: t('list.reading'),
      plan: t('list.plan'),
      completed: t('list.completed'),
      dropped: t('list.dropped'),
    };

    container.innerHTML = `
      <div class="manga-detail">
        <div class="manga-detail-cover">
          <img src="${cover}" alt="${escapeHtml(manga.title)}" />
        </div>
        <div class="manga-detail-info">
          <h1>${escapeHtml(manga.title)}</h1>
          <div class="manga-detail-meta">
            <div class="meta-item">${t('manga.status')}: <strong>${manga.status || '—'}</strong></div>
            <div class="meta-item">${t('manga.year')}: <strong>${manga.year || '—'}</strong></div>
            <div class="meta-item">${t('manga.chapters')}: <strong>${cachedChapters.length || chapterData.readableCount || 0}</strong>${chapterData.hasExternalOnly ? ` <span style="color:var(--text-muted)">${t('manga.external')}</span>` : ''}</div>
            ${manga.authors?.length ? `<div class="meta-item">${t('manga.author')}: <strong>${escapeHtml(manga.authors.join(', '))}</strong></div>` : ''}
          </div>
          <div class="tags">
            ${manga.tags.map(tag => `<span class="tag" data-tag="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}</span>`).join('')}
          </div>
          <p class="manga-detail-desc ${isLong ? 'collapsed' : ''}" id="manga-desc">${escapeHtml(desc)}</p>
          ${isLong ? `<button class="btn btn-ghost btn-sm" id="toggle-desc">${t('manga.showMore')}</button>` : ''}
          <div class="manga-actions">
            <button class="btn btn-primary" id="read-btn" ${cachedChapters.length ? '' : 'disabled'}>${readBtnText}</button>
            <button class="btn btn-ghost" id="toggle-fav">${fav ? t('manga.favRemove') : t('manga.favAdd')}</button>
          </div>
          <div class="list-buttons">
            <span class="list-label">${t('manga.lists')}</span>
            ${['reading', 'plan', 'completed', 'dropped'].map(l => `
              <button class="btn btn-sm ${listStatus === l ? 'btn-primary' : 'btn-ghost'}" data-list="${l}">${listLabels[l]}</button>
            `).join('')}
          </div>
          <div class="chapter-header">
            <h3 class="section-title">${t('manga.chaptersTitle')}</h3>
            <button class="btn btn-ghost btn-sm" id="sort-chapters">
              ${state.settings.chapterSort === 'desc' ? t('manga.sortNew') : t('manga.sortOld')}
            </button>
          </div>
          <div class="chapter-list" id="chapter-list">${chapterList}</div>
          ${!chapterData.allLoaded
            ? `<button class="btn btn-ghost load-more-btn" id="load-chapters">${t('manga.loadMore', { loaded: cachedChapters.length, total: chapterData.readableCount })}</button>`
            : ''}
        </div>
      </div>
    `;

    bindEvents(container, mangaId, manga, cover, startChapter, openReader, navigate, chapterData.readableCount);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${t('empty.error', { msg: err.message })}</p><button class="btn btn-ghost" id="back-btn">${t('empty.back')}</button></div>`;
    document.getElementById('back-btn')?.addEventListener('click', () => navigate('home'));
  }
}

function renderChapterList(chapters, state) {
  return chapters.map(ch => {
    const isRead = state.readChapters.includes(ch.id);
    const offline = cachedOfflineIds.has(ch.id);
    return `
      <div class="chapter-item ${isRead ? 'read' : ''}" data-chapter-id="${ch.id}">
        <div>
          <strong>${escapeHtml(ch.title)}</strong>
          ${ch.group ? `<span> · ${escapeHtml(ch.group)}</span>` : ''}
          <span class="chapter-lang" title="${getLanguageName(ch.language)}">${getLanguageName(ch.language)}</span>
          ${offline ? `<span class="offline-badge">${t('manga.offline')}</span>` : ''}
        </div>
        <div class="chapter-item-actions">
          <span>${ch.pages} ${t('manga.pages')}</span>
          <button class="btn btn-ghost btn-xs chapter-offline-btn" data-offline-id="${ch.id}" title="${offline ? t('manga.removeOffline') : t('manga.download')}">
            ${offline ? '✓' : '⬇'}
          </button>
        </div>
      </div>
    `;
  }).join('') || `<p style="color:var(--text-muted)">${t('manga.noReadable')}</p>`;
}

function bindChapterItems(container, mangaId, manga, cover, openReader) {
  const open = (ch) => openReader(mangaId, manga.title, ch, { chapters: cachedChapters, cover });

  container.querySelectorAll('.chapter-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chapter-offline-btn')) return;
      const ch = cachedChapters.find(c => c.id === item.dataset.chapterId);
      if (ch) open(ch);
    });
  });

  container.querySelectorAll('.chapter-offline-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chapterId = btn.dataset.offlineId;
      const ch = cachedChapters.find(c => c.id === chapterId);
      if (!ch) return;

      if (cachedOfflineIds.has(chapterId)) {
        await removeCachedChapter(chapterId);
        cachedOfflineIds.delete(chapterId);
        refreshChapterList(container);
        return;
      }

      btn.disabled = true;
      try {
        const pages = await getChapterPages(chapterId);
        await cacheChapter(chapterId, mangaId, {
          title: ch.title,
          mangaTitle: manga.title,
        }, pages, (cur, total) => {
          btn.textContent = `${cur}/${total}`;
          showToast(t('manga.downloading', { cur, total }), 'info');
        });
        cachedOfflineIds.add(chapterId);
        showToast(t('manga.downloadDone'), 'success');
      } catch (err) {
        showToast(t('manga.downloadFail', { msg: err.message }), 'error');
      } finally {
        btn.disabled = false;
        refreshChapterList(container);
      }
    });
  });
}

function refreshChapterList(container) {
  const list = document.getElementById('chapter-list');
  if (list) list.innerHTML = renderChapterList(cachedChapters, getState());
}

function bindEvents(container, mangaId, manga, cover, startChapter, openReader, navigate, totalChapters) {
  const open = (ch) => openReader(mangaId, manga.title, ch, { chapters: cachedChapters, cover });

  document.getElementById('read-btn')?.addEventListener('click', () => {
    if (startChapter) open(startChapter);
  });

  document.getElementById('toggle-fav')?.addEventListener('click', () => {
    const btn = document.getElementById('toggle-fav');
    if (isFavorite(mangaId)) {
      removeFavorite(mangaId);
      btn.textContent = t('manga.favAdd');
      showToast(t('toast.favRemove'));
    } else {
      addFavorite({ id: mangaId, title: manga.title, cover });
      btn.textContent = t('manga.favRemove');
      showToast(t('toast.favAdd'), 'success');
      checkAchievements();
    }
  });

  document.getElementById('toggle-desc')?.addEventListener('click', () => {
    const desc = document.getElementById('manga-desc');
    const btn = document.getElementById('toggle-desc');
    desc.classList.toggle('collapsed');
    btn.textContent = desc.classList.contains('collapsed') ? t('manga.showMore') : t('manga.showLess');
  });

  bindChapterItems(container, mangaId, manga, cover, openReader);

  container.querySelectorAll('[data-list]').forEach(btn => {
    btn.addEventListener('click', () => {
      addToList(btn.dataset.list, mangaId, { title: manga.title, cover });
      showToast(t('toast.listAdd'), 'success');
      renderMangaDetail(container, mangaId, navigate, openReader);
    });
  });

  bindTagButtons(container, (tag) => navigate('genre', { tag }));

    document.getElementById('sort-chapters')?.addEventListener('click', async () => {
    const sort = getState().settings.chapterSort === 'desc' ? 'asc' : 'desc';
    updateSettings({ chapterSort: sort });
    const data = await getChapters(mangaId, 500, 0);
    cachedChapters = data.chapters;
    refreshChapterList(container);
    document.getElementById('sort-chapters').textContent = sort === 'desc' ? t('manga.sortNew') : t('manga.sortOld');
    bindChapterItems(container, mangaId, manga, cover, openReader);
  });

  document.getElementById('load-chapters')?.addEventListener('click', async () => {
    const more = await getChapters(mangaId, 100, cachedChapters.length);
    cachedChapters = [...cachedChapters, ...more.chapters];
    refreshChapterList(container);
    const btn = document.getElementById('load-chapters');
    if (btn) {
      btn.textContent = t('manga.loadMore', { loaded: cachedChapters.length, total: totalChapters });
      if (more.allLoaded || cachedChapters.length >= totalChapters) btn.remove();
    }
    bindChapterItems(container, mangaId, manga, cover, openReader);
  });
}
