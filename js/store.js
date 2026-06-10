import { isServerMode, fetchStateFromServer, pushStateToServer } from './server-api.js';

const GUEST_STORAGE_KEY = 'violence_manga_data';

const defaultState = {
  profile: {
    name: 'Гость',
    avatar: 'G',
    avatarUrl: '',
    bio: '',
    xp: 0,
    level: 1,
    joinedAt: Date.now(),
  },
  settings: {
    theme: 'dark',
    palette: 'violet',
    animations: true,
    transitionSpeed: 'normal',
    effectsGlow: true,
    effectsBlur: true,
    effectsOrbs: true,
    effectsCardHover: true,
    readingMode: 'vertical',
    fitWidth: true,
    language: 'ru',
    autoTranslate: true,
    autoBookmark: true,
    showNsfw: false,
    chapterSort: 'desc',
    compactSidebar: false,
    pageSpread: false,
    imageProxy: true,
    prefetchEnabled: true,
    prefetchAhead: 3,
    uiLanguage: 'ru',
    autoScrollSpeed: 0,
    iosBoldFont: false,
  },
  readingLog: {},
  genreStats: {},
  favorites: [],
  history: [],
  readChapters: [],
  bookmarks: {},
  lists: { reading: [], plan: [], completed: [], dropped: [] },
  listMeta: {},
  stats: {
    chaptersRead: 0,
    pagesRead: 0,
    mangaOpened: 0,
    searchCount: 0,
    favoritesCount: 0,
    totalReadTime: 0,
  },
  achievements: {},
  notifications: [],
};

let activeUserId = null;
let saveTimer = null;
let saveInFlight = null;

function storageKeyFor(userId) {
  return userId ? `violence_manga_data_${userId}` : GUEST_STORAGE_KEY;
}

function mergeLoaded(parsed) {
  return {
    ...structuredClone(defaultState),
    ...parsed,
    settings: { ...defaultState.settings, ...parsed.settings },
    lists: { ...defaultState.lists, ...parsed.lists },
    listMeta: parsed.listMeta || {},
    bookmarks: parsed.bookmarks || {},
    readingLog: parsed.readingLog || {},
    genreStats: parsed.genreStats || {},
    stats: { ...defaultState.stats, ...parsed?.stats },
    profile: { ...defaultState.profile, ...parsed?.profile },
  };
}

function loadFromKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(defaultState);
    return mergeLoaded(JSON.parse(raw));
  } catch {
    return structuredClone(defaultState);
  }
}

let state = loadFromKey(GUEST_STORAGE_KEY);

function saveLocal() {
  localStorage.setItem(storageKeyFor(activeUserId), JSON.stringify(state));
}

function scheduleServerSave() {
  if (!activeUserId || !isServerMode()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveInFlight = pushStateToServer(structuredClone(state))
      .then(() => saveLocal())
      .catch(err => console.warn('State sync failed:', err.message))
      .finally(() => { saveInFlight = null; });
  }, 500);
}

function save() {
  saveLocal();
  scheduleServerSave();
}

export async function flushSave() {
  if (!activeUserId || !isServerMode()) return;
  clearTimeout(saveTimer);
  if (saveInFlight) await saveInFlight;
  try {
    await pushStateToServer(structuredClone(state));
  } catch (err) {
    console.warn('Flush save failed:', err.message);
  }
}

export async function initStoreFromSession(userId) {
  await flushSave();
  activeUserId = userId || null;

  if (userId && isServerMode()) {
    try {
      const remote = await fetchStateFromServer();
      state = mergeLoaded(remote);
      saveLocal();
      return;
    } catch (err) {
      console.warn('Load from server failed, using cache:', err.message);
    }
  }

  state = loadFromKey(storageKeyFor(activeUserId));
}

export function getActiveUserId() {
  return activeUserId;
}

export function exportCurrentState() {
  return structuredClone(state);
}

export function importState(data) {
  state = mergeLoaded(data);
  save();
}

export function mergeState(data) {
  if (!data || typeof data !== 'object') return false;

  if (Array.isArray(data.favorites)) {
    data.favorites.forEach(f => {
      if (f?.id && !state.favorites.some(x => x.id === f.id)) {
        state.favorites.unshift(f);
      }
    });
    state.stats.favoritesCount = state.favorites.length;
  }

  if (data.bookmarks && typeof data.bookmarks === 'object') {
    state.bookmarks = { ...state.bookmarks, ...data.bookmarks };
  }

  if (Array.isArray(data.readChapters)) {
    data.readChapters.forEach(id => {
      if (!state.readChapters.includes(id)) state.readChapters.push(id);
    });
  }

  if (Array.isArray(data.history)) {
    const seen = new Set(state.history.map(h => h.mangaId));
    data.history.forEach(h => {
      if (h?.mangaId && !seen.has(h.mangaId)) {
        state.history.push(h);
        seen.add(h.mangaId);
      }
    });
    state.history.sort((a, b) => (b.at || 0) - (a.at || 0));
    if (state.history.length > 50) state.history = state.history.slice(0, 50);
  }

  if (data.lists) {
    Object.keys(state.lists).forEach(key => {
      const incoming = data.lists[key];
      if (!Array.isArray(incoming)) return;
      incoming.forEach(id => {
        if (!state.lists[key].includes(id)) state.lists[key].push(id);
      });
    });
  }

  if (data.listMeta) state.listMeta = { ...state.listMeta, ...data.listMeta };
  if (data.achievements) {
    Object.entries(data.achievements).forEach(([id, val]) => {
      if (!state.achievements[id]) state.achievements[id] = val;
    });
  }
  if (data.readingLog) {
    Object.entries(data.readingLog).forEach(([day, log]) => {
      if (!state.readingLog[day]) state.readingLog[day] = { pages: 0, chapters: 0 };
      state.readingLog[day].pages += log.pages || 0;
      state.readingLog[day].chapters += log.chapters || 0;
    });
  }
  if (data.genreStats) {
    Object.entries(data.genreStats).forEach(([name, count]) => {
      state.genreStats[name] = (state.genreStats[name] || 0) + count;
    });
  }
  if (data.stats) {
    ['chaptersRead', 'pagesRead', 'mangaOpened', 'searchCount', 'totalReadTime'].forEach(key => {
      if (typeof data.stats[key] === 'number') {
        state.stats[key] = Math.max(state.stats[key] || 0, data.stats[key]);
      }
    });
  }
  if (data.profile) {
    if (typeof data.profile.xp === 'number') state.profile.xp = Math.max(state.profile.xp, data.profile.xp);
    if (typeof data.profile.level === 'number') state.profile.level = Math.max(state.profile.level, data.profile.level);
    if (data.profile.bio && !state.profile.bio) state.profile.bio = data.profile.bio;
  }

  save();
  return true;
}

export function isValidBackup(data) {
  return !!(data && typeof data === 'object' && (data.profile || data.settings || data.favorites));
}

export function getState() {
  return state;
}

export function updateProfile(updates) {
  state.profile = { ...state.profile, ...updates };
  if (updates.name && updates.avatarUrl === undefined && !state.profile.avatarUrl) {
    state.profile.avatar = updates.name[0].toUpperCase();
  }
  save();
}

export function updateSettings(updates) {
  state.settings = { ...state.settings, ...updates };
  save();
}

export function addFavorite(manga) {
  if (state.favorites.some(f => f.id === manga.id)) return false;
  state.favorites.unshift({ ...manga, addedAt: Date.now() });
  state.stats.favoritesCount = state.favorites.length;
  save();
  return true;
}

export function removeFavorite(mangaId) {
  state.favorites = state.favorites.filter(f => f.id !== mangaId);
  state.stats.favoritesCount = state.favorites.length;
  save();
}

export function isFavorite(mangaId) {
  return state.favorites.some(f => f.id === mangaId);
}

export function addToList(listName, mangaId, meta = {}) {
  if (!state.lists[listName]) return;
  Object.keys(state.lists).forEach(key => {
    state.lists[key] = state.lists[key].filter(id => id !== mangaId);
  });
  if (!state.lists[listName].includes(mangaId)) {
    state.lists[listName].push(mangaId);
  }
  if (meta.title || meta.cover) {
    state.listMeta[mangaId] = { ...state.listMeta[mangaId], ...meta, updatedAt: Date.now() };
  }
  save();
}

export function getListItems(listName) {
  return (state.lists[listName] || []).map(id => {
    const fav = state.favorites.find(f => f.id === id);
    const hist = state.history.find(h => h.mangaId === id);
    const meta = state.listMeta[id];
    return {
      id,
      title: fav?.title || hist?.title || meta?.title || '—',
      cover: fav?.cover || hist?.cover || meta?.cover || '',
    };
  });
}

export function removeFromList(listName, mangaId) {
  if (!state.lists[listName]) return;
  state.lists[listName] = state.lists[listName].filter(id => id !== mangaId);
  save();
}

export function removeFromAllLists(mangaId) {
  Object.keys(state.lists).forEach(key => {
    state.lists[key] = state.lists[key].filter(id => id !== mangaId);
  });
  save();
}

export function getMangaListStatus(mangaId) {
  for (const [name, ids] of Object.entries(state.lists)) {
    if (ids.includes(mangaId)) return name;
  }
  return null;
}

export function addHistory(entry) {
  state.history = state.history.filter(h => h.mangaId !== entry.mangaId);
  state.history.unshift({ ...entry, at: Date.now() });
  if (state.history.length > 50) state.history = state.history.slice(0, 50);
  save();
}

export function saveBookmark(mangaId, data) {
  if (!state.settings.autoBookmark) return;
  state.bookmarks[mangaId] = { ...data, updatedAt: Date.now() };
  save();
}

export function getBookmark(mangaId) {
  return state.bookmarks[mangaId] || null;
}

export function getContinueReading() {
  return Object.entries(state.bookmarks)
    .map(([mangaId, bm]) => ({ mangaId, ...bm }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDayLog(day = todayKey()) {
  if (!state.readingLog[day]) {
    state.readingLog[day] = { pages: 0, chapters: 0 };
  }
  return state.readingLog[day];
}

export function logPagesRead(count = 1) {
  ensureDayLog().pages += count;
  save();
}

export function logChapterDay() {
  ensureDayLog().chapters += 1;
  save();
}

export function logGenres(tags = []) {
  tags.forEach(tag => {
    const name = typeof tag === 'string' ? tag : tag?.name;
    if (!name) return;
    state.genreStats[name] = (state.genreStats[name] || 0) + 1;
  });
  save();
}

export function getReadingLogDays(days = 7) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = state.readingLog[key] || { pages: 0, chapters: 0 };
    result.push({
      date: key,
      label: d.toLocaleDateString(getState().settings.uiLanguage === 'en' ? 'en-US' : 'ru-RU', {
        weekday: 'short', day: 'numeric',
      }),
      ...entry,
    });
  }
  return result;
}

export function getTopGenres(limit = 8) {
  return Object.entries(state.genreStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

export function markChapterRead(chapterId, mangaId, pages) {
  if (!state.readChapters.includes(chapterId)) {
    state.readChapters.push(chapterId);
    state.stats.chaptersRead++;
    state.stats.pagesRead += pages;
    logChapterDay();
    const leveledUp = addXP(25);
    save();
    return { isNew: true, leveledUp };
  }
  return { isNew: false, leveledUp: false };
}

export function addXP(amount) {
  state.profile.xp += amount;
  const xpNeeded = state.profile.level * 100;
  if (state.profile.xp >= xpNeeded) {
    state.profile.xp -= xpNeeded;
    state.profile.level++;
    save();
    return true;
  }
  save();
  return false;
}

export function incrementStat(key, amount = 1) {
  state.stats[key] = (state.stats[key] || 0) + amount;
  save();
}

export function addReadingTime(seconds) {
  state.stats.totalReadTime += seconds;
  save();
}

export function unlockAchievement(id, title, desc) {
  if (state.achievements[id]) return false;
  state.achievements[id] = { unlockedAt: Date.now() };
  state.notifications.unshift({
    type: 'achievement',
    message: `🏆 ${title}`,
    detail: desc,
    at: Date.now(),
  });
  save();
  return true;
}

export function clearNotifications() {
  state.notifications = [];
  save();
}

export async function resetData() {
  state = structuredClone(defaultState);
  state.readingLog = {};
  state.genreStats = {};
  save();
  await flushSave();
}
