import { getState, updateSettings, clearNotifications } from './store.js';
import { applyAllVisualSettings, animatePageEnter, showNotificationsPanel, updateSidebar } from './ui.js';
import { navigate, parseHash, initRouter, setRouteHandler } from './router.js';
import { initMenu, updateMenu, openUserMenuFromTopbar } from './menu.js';
import { renderHome, renderSearch, renderGenre } from './pages/home.js';
import { renderBrowse } from './pages/browse.js';
import { renderMangaDetail } from './pages/manga.js';
import { renderLibrary } from './pages/library.js';
import { renderProfile } from './pages/profile.js';
import { renderAchievements } from './pages/achievements-page.js';
import { renderSettings } from './pages/settings.js';
import { renderLogin, renderRegister } from './pages/auth.js';
import { openReader, initReader, closeReader } from './reader.js';
import { showShortcutsHelp } from './ui.js';
import { restoreSession } from './auth.js';
import { applyDocumentI18n, setLanguageChangeHandler } from './i18n.js';
import { getCurrentRoute } from './router.js';
import { initPwa } from './pwa.js';
import { refreshAllAvatars } from './avatars.js';
import { renderStats } from './pages/stats.js';

const content = document.getElementById('content');
let searchTimeout = null;

function renderRoute(route, params = {}) {
  closeReader();
  updateMenu(route, params);

  switch (route) {
    case 'home':
      renderHome(content, navigate);
      break;
    case 'browse':
      renderBrowse(content, navigate);
      break;
    case 'search':
      if (params.query) {
        document.getElementById('search-input').value = params.query;
        renderSearch(content, params.query, navigate);
      } else {
        navigate('home');
      }
      break;
    case 'genre':
      renderGenre(content, params.tag, navigate);
      break;
    case 'manga':
      renderMangaDetail(content, params.id, navigate, (mangaId, title, chapter, opts) => {
        openReader(mangaId, title, chapter, opts);
      });
      break;
    case 'library':
      renderLibrary(content, navigate, params.tab || 'favorites');
      break;
    case 'profile':
      renderProfile(content, navigate);
      break;
    case 'achievements':
      renderAchievements(content, navigate, params.filter || 'all');
      break;
    case 'settings':
      renderSettings(content, navigate, params.tab || 'appearance');
      break;
    case 'login':
      renderLogin(content, navigate);
      break;
    case 'register':
      renderRegister(content, navigate);
      break;
    case 'stats':
      renderStats(content);
      break;
    default:
      renderHome(content, navigate);
  }
  animatePageEnter();
}

function initSearch() {
  const input = document.getElementById('search-input');

  input?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = input.value.trim();
    if (query.length < 2) return;
    searchTimeout = setTimeout(() => navigate('search', { query }), 400);
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = input.value.trim();
      if (query) navigate('search', { query });
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      input?.focus();
    }
    if (e.key === '?' && document.getElementById('reader-overlay')?.hidden) {
      showShortcutsHelp();
    }
  });
}

function initTopbar() {
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const state = getState();
    const newTheme = state.settings.theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: newTheme });
    applyAllVisualSettings({ ...getState().settings, theme: newTheme });
  });

  document.getElementById('topbar-user')?.addEventListener('click', openUserMenuFromTopbar);

  document.getElementById('notif-btn')?.addEventListener('click', () => {
    showNotificationsPanel();
    clearNotifications();
    updateSidebar();
  });
}

function init() {
  restoreSession().then(() => {
    const state = getState();
    applyAllVisualSettings(state.settings);
    applyDocumentI18n();
    refreshAllAvatars();
    document.documentElement.lang = state.settings.uiLanguage || 'ru';
    if (state.settings.compactSidebar) document.body.classList.add('compact-sidebar');

    setRouteHandler(renderRoute);
    initRouter();
    initMenu();
    initSearch();
    initTopbar();
    initReader();
    closeReader();
    initPwa();

    setLanguageChangeHandler(() => {
      const { route, params } = getCurrentRoute();
      renderRoute(route, params);
    });

    const { route, params } = parseHash();
    if (location.hash) {
      renderRoute(route, params);
    } else {
      navigate('home');
    }
  });
}

init();
