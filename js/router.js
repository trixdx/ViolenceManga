import { t, getListLabel } from './i18n.js';

const ROUTES = {
  home:       { titleKey: 'route.home',      nav: 'home',          parentRoute: null },
  browse:     { titleKey: 'route.browse',    nav: 'browse',        parentRoute: null },
  library:    { titleKey: 'route.library',   nav: 'library',       parentRoute: null },
  profile:    { titleKey: 'route.profile',   nav: 'profile',       parentRoute: null },
  achievements:{ titleKey: 'route.achievements', nav: 'achievements', parentRoute: null },
  settings:   { titleKey: 'route.settings',  nav: 'settings',      parentRoute: null },
  search:     { titleKey: 'route.search',    nav: null,            parentRoute: null },
  genre:      { titleKey: 'route.genre',     nav: 'browse',        parentRoute: 'browse' },
  manga:      { titleKey: 'route.manga',     nav: null,            parentRoute: null },
  login:      { titleKey: 'route.login',     nav: null,            parentRoute: null },
  register:   { titleKey: 'route.register',  nav: null,            parentRoute: null },
  stats:      { titleKey: 'route.stats',     nav: 'stats',         parentRoute: null },
};

let currentRoute = 'home';
let currentParams = {};
let onRouteChange = null;

export function setRouteHandler(fn) {
  onRouteChange = fn;
}

export function getCurrentRoute() {
  return { route: currentRoute, params: currentParams };
}

export function getRouteMeta(route) {
  const meta = ROUTES[route] || ROUTES.home;
  return { ...meta, title: t(meta.titleKey) };
}

export function buildHash(route, params = {}) {
  if (route === 'manga' && params.id) return `#/manga/${params.id}`;
  if (route === 'search' && params.query) return `#/search?q=${encodeURIComponent(params.query)}`;
  if (route === 'genre' && params.tag) return `#/genre/${encodeURIComponent(params.tag)}`;
  if (route === 'library' && params.tab) return `#/library/${params.tab}`;
  if (route === 'settings' && params.tab) return `#/settings/${params.tab}`;
  if (route === 'achievements' && params.filter) return `#/achievements/${params.filter}`;
  return `#/${route}`;
}

export function parseHash() {
  const raw = location.hash.slice(2) || 'home';
  const [route, param1] = raw.split('/');

  if (route === 'manga' && param1) return { route: 'manga', params: { id: param1 } };
  if (route === 'search') {
    const q = new URLSearchParams(location.hash.split('?')[1] || '').get('q');
    return { route: 'search', params: { query: q || '' } };
  }
  if (route === 'genre' && param1) return { route: 'genre', params: { tag: decodeURIComponent(param1) } };
  if (route === 'library') return { route: 'library', params: { tab: param1 || 'favorites' } };
  if (route === 'settings') return { route: 'settings', params: { tab: param1 || 'appearance' } };
  if (route === 'achievements') return { route: 'achievements', params: { filter: param1 || 'all' } };
  return { route: route || 'home', params: {} };
}

let skipNextHashChange = false;

export function navigate(route, params = {}) {
  currentRoute = route;
  currentParams = params;
  const hash = buildHash(route, params);
  if (location.hash !== hash) {
    skipNextHashChange = true;
    history.pushState(null, '', hash);
  }
  onRouteChange?.(route, params);
}

export function initRouter() {
  window.addEventListener('hashchange', () => {
    if (skipNextHashChange) {
      skipNextHashChange = false;
      return;
    }
    const { route, params } = parseHash();
    currentRoute = route;
    currentParams = params;
    onRouteChange?.(route, params);
  });
}

export function getBreadcrumbs(route, params = {}) {
  const meta = ROUTES[route] || ROUTES.home;
  const crumbs = [];
  if (meta.parentRoute) crumbs.push(t(ROUTES[meta.parentRoute].titleKey));
  crumbs.push(t(meta.titleKey));
  if (route === 'search' && params.query) crumbs.push(`«${params.query}»`);
  if (route === 'genre' && params.tag) crumbs.push(params.tag);
  if (route === 'manga') crumbs.push(t('route.details'));
  if (route === 'library' && params.tab) crumbs.push(getListLabel(params.tab));
  return crumbs;
}

export function getBreadcrumbRoute(route, crumbIndex) {
  const meta = ROUTES[route] || ROUTES.home;
  if (crumbIndex === 0) {
    if (meta.parentRoute) return meta.parentRoute;
    return route;
  }
  return route;
}
