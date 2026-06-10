import { getState } from './store.js';
import { getRouteMeta, getBreadcrumbs, getBreadcrumbRoute, navigate } from './router.js';
import { updateSidebar } from './ui.js';
import { applyAvatarEl } from './avatars.js';
import { t, applyDocumentI18n } from './i18n.js';
import { isLoggedIn, getCurrentUser, logout, getUserPublicInfo } from './auth.js';
import { showToast } from './ui.js';

export function initMenu() {
  initSidebar();
  initUserMenu();
  initBottomNav();
  initSidebarOverlay();
  updateAuthMenu();
}

function initSidebar() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.route);
      closeSidebar();
    });
  });

  document.getElementById('menu-toggle')?.addEventListener('click', toggleSidebar);
  const brand = document.getElementById('sidebar-brand');
  brand?.addEventListener('click', () => navigate('home'));
  brand?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate('home');
    }
  });

  document.getElementById('sidebar-user')?.addEventListener('click', () => {
    toggleUserMenu();
  });
}

function initUserMenu() {
  document.getElementById('user-menu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-user-action]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.userAction;
    closeUserMenu();

    if (action === 'profile') navigate('profile');
    if (action === 'achievements') navigate('achievements');
    if (action === 'settings') navigate('settings');
    if (action === 'library') navigate('library');
    if (action === 'login') navigate('login');
    if (action === 'register') navigate('register');
    if (action === 'logout') {
      logout().then(() => {
        updateAuthMenu();
        updateSidebar();
        showToast(t('toast.logout'));
        navigate('home');
      });
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-menu') && !e.target.closest('#sidebar-user') && !e.target.closest('#topbar-user')) {
      closeUserMenu();
    }
  });
}

function initBottomNav() {
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.route));
  });
}

function initSidebarOverlay() {
  const overlay = document.getElementById('sidebar-overlay');
  overlay?.addEventListener('click', closeSidebar);
}

export function updateAuthMenu() {
  const menu = document.getElementById('user-menu');
  if (!menu) return;

  const loggedIn = isLoggedIn();
  const user = getCurrentUser();

  if (loggedIn && user) {
    const info = getUserPublicInfo(user);
    menu.innerHTML = `
      <div class="user-menu-header">
        <strong>${info.displayName}</strong>
        <span>${info.email}</span>
      </div>
      <button data-user-action="profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        ${t('nav.profile')}
      </button>
      <button data-user-action="library">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        ${t('nav.library')}
      </button>
      <button data-user-action="achievements">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg>
        ${t('nav.achievements')}
      </button>
      <button data-user-action="settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2"/></svg>
        ${t('nav.settings')}
      </button>
      <div class="user-menu-divider"></div>
      <button class="user-menu-danger" data-user-action="logout">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        ${t('auth.logout')}
      </button>
    `;
  } else {
    menu.innerHTML = `
      <div class="user-menu-header guest">
        <strong>${t('auth.guestName')}</strong>
        <span>${t('auth.guestHint')}</span>
      </div>
      <button data-user-action="login">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
        ${t('auth.login')}
      </button>
      <button data-user-action="register">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
        ${t('auth.register')}
      </button>
      <div class="user-menu-divider"></div>
      <button data-user-action="settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/></svg>
        ${t('nav.settings')}
      </button>
    `;
  }

  const sidebarHint = document.getElementById('user-auth-hint');
  if (sidebarHint) {
    sidebarHint.textContent = loggedIn ? user.email : t('auth.guest');
  }
}

export function updateMenu(route, params = {}) {
  const meta = getRouteMeta(route);

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.route === meta.nav);
  });

  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.route === meta.nav);
  });

  const titleKeys = {
    home: 'nav.home', browse: 'nav.browse', library: 'nav.library',
    profile: 'nav.profile', achievements: 'nav.achievements',
    settings: 'nav.settings', stats: 'nav.stats',
  };
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.textContent = titleKeys[route] ? t(titleKeys[route]) : meta.title;
  }
  applyDocumentI18n();

  const breadcrumbs = document.getElementById('breadcrumbs');
  if (breadcrumbs) {
    const crumbs = getBreadcrumbs(route, params);
    breadcrumbs.innerHTML = crumbs.map((c, i) => {
      const isLast = i === crumbs.length - 1;
      return isLast
        ? `<span class="crumb active">${c}</span>`
        : `<button class="crumb" data-crumb-index="${i}">${c}</button><span class="crumb-sep">/</span>`;
    }).join('');

    breadcrumbs.querySelectorAll('.crumb:not(.active)').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.crumbIndex, 10);
        navigate(getBreadcrumbRoute(route, idx), params);
      });
    });
  }

  updateSidebar();
  updateTopbarUser();
  updateAuthMenu();
}

function updateTopbarUser() {
  const state = getState();
  const el = document.getElementById('topbar-user-name');
  const av = document.getElementById('topbar-user-avatar');
  if (el) el.textContent = state.profile.name;
  if (av) applyAvatarEl(av, state.profile);
}

function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('sidebar-overlay')?.classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');
}

function toggleUserMenu() {
  document.getElementById('user-menu')?.classList.toggle('open');
}

function closeUserMenu() {
  document.getElementById('user-menu')?.classList.remove('open');
}

export function openUserMenuFromTopbar() {
  toggleUserMenu();
}
