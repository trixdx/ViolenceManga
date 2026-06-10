import {
  getState, getListItems, isFavorite, removeFavorite,
  getContinueReading, removeFromList,
} from '../store.js';
import {
  renderMangaGrid, bindMangaCards, bindFavButtons,
  showToast, escapeHtml, renderContinueSection, bindContinueCards,
} from '../ui.js';
import { t, getListLabel } from '../i18n.js';

const LIST_ICONS = {
  favorites: '❤️',
  reading: '📖',
  plan: '📋',
  completed: '✅',
  dropped: '🚫',
  history: '🕐',
};

export function renderLibrary(container, navigate, activeTab = 'favorites') {
  const state = getState();
  const continueItems = getContinueReading();
  const tabs = Object.keys(LIST_ICONS);

  container.innerHTML = `
    <div class="page-header">
      <h2>${t('library.title')}</h2>
      <p>${t('library.items', { count: getTabCount(state, activeTab), tab: getListLabel(activeTab) })}</p>
    </div>

    ${renderContinueSection(continueItems, navigate)}

    <div class="library-tabs" style="${continueItems.length ? 'margin-top:24px' : ''}">
      ${tabs.map(tab => {
        const count = getTabCount(state, tab);
        return `
          <button class="tab-btn ${activeTab === tab ? 'active' : ''}" data-tab="${tab}">
            ${LIST_ICONS[tab]} ${getListLabel(tab)} <span class="tab-count">${count}</span>
          </button>
        `;
      }).join('')}
    </div>

    <div id="library-content"></div>
  `;

  bindContinueCards(container, navigate);
  renderTabContent(container, navigate, activeTab);

  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate('library', { tab: btn.dataset.tab }));
  });
}

function getTabCount(state, tab) {
  if (tab === 'favorites') return state.favorites.length;
  if (tab === 'history') return state.history.length;
  return state.lists[tab]?.length || 0;
}

function renderTabContent(container, navigate, tab) {
  const state = getState();
  const content = container.querySelector('#library-content');

  if (tab === 'history') {
    content.innerHTML = state.history.length
      ? `<div class="history-list">${state.history.map(h => `
          <div class="history-item" data-manga-id="${h.mangaId}">
            <img src="${h.cover || 'https://placehold.co/40x56/7c3aed/f0eaff?text=?'}" alt="" />
            <div class="info">
              <h4>${escapeHtml(h.title)}</h4>
              <span>${escapeHtml(h.chapter || t('library.recently'))}</span>
            </div>
            <span class="history-date">${formatDate(h.at)}</span>
          </div>
        `).join('')}</div>`
      : `<div class="empty-state"><p>${t('library.historyEmpty')}</p></div>`;

    content.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => navigate('manga', { id: item.dataset.mangaId }));
    });
    return;
  }

  const items = tab === 'favorites' ? state.favorites : getListItems(tab);

  if (!items.length) {
    content.innerHTML = `<div class="empty-state">
      <p>${getListLabel(tab)} — ${t('library.listEmpty')}</p>
      <button class="btn btn-primary" id="go-browse">${t('browse.title')}</button>
    </div>`;
    document.getElementById('go-browse')?.addEventListener('click', () => navigate('browse'));
    return;
  }

  content.innerHTML = renderMangaGrid(items, {
    showFav: tab === 'favorites',
    isFavorite: (id) => isFavorite(id),
  });

  bindMangaCards(content, (id) => navigate('manga', { id }));

  if (tab === 'favorites') {
    bindFavButtons(content, (id) => {
      removeFavorite(id);
      showToast(t('toast.favRemove'));
      navigate('library', { tab });
    });
  } else {
    content.querySelectorAll('.manga-card').forEach(card => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (confirm(t('library.remove') + '?')) {
          removeFromList(tab, card.dataset.mangaId);
          showToast(t('toast.favRemove'));
          navigate('library', { tab });
        }
      });
    });
  }
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const locale = getState().settings.uiLanguage === 'en' ? 'en-US' : 'ru-RU';
  return d.toLocaleDateString(locale);
}
