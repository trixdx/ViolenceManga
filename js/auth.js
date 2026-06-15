import {
  initStoreFromSession, exportCurrentState, importState,
  updateProfile, getState, flushSave,
} from './store.js';
import {
  checkServerHealth, isServerMode,
  apiRegister, apiLogin, apiLogout, apiMe,
} from './server-api.js';
import { randomId } from './uuid.js';

let currentUser = null;

export function getCurrentUser() {
  return currentUser;
}

export function isLoggedIn() {
  return !!currentUser;
}

export async function restoreSession() {
  await checkServerHealth();

  if (!isServerMode()) {
    return restoreLocalSession();
  }

  try {
    const { user } = await apiMe();
    currentUser = user;
    await initStoreFromSession(user.id);
    const profile = getState().profile;
    if (!profile.name || profile.name === 'Гость') {
      updateProfile({ name: user.displayName || user.login });
    }
    return true;
  } catch {
    currentUser = null;
    await initStoreFromSession(null);
    return false;
  }
}

function restoreLocalSession() {
  try {
    const raw = localStorage.getItem('violence_session');
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.userId) {
      initStoreFromSession(null);
      return false;
    }
    const users = JSON.parse(localStorage.getItem('violence_users') || '{}');
    if (!users[session.userId]) {
      localStorage.removeItem('violence_session');
      initStoreFromSession(null);
      return false;
    }
    currentUser = users[session.userId];
    initStoreFromSession(session.userId);
    const profile = getState().profile;
    if (!profile.name || profile.name === 'Гость') {
      updateProfile({ name: currentUser.displayName || currentUser.login });
    }
    return true;
  } catch {
    initStoreFromSession(null);
    return false;
  }
}

export async function register({ login, email, password, passwordConfirm }) {
  if (isServerMode()) {
    const guestState = exportCurrentState();
    const { user } = await apiRegister({ login, email, password, passwordConfirm, guestState });
    currentUser = user;
    await initStoreFromSession(user.id);
    updateProfile({ name: login.trim(), joinedAt: Date.now() });
    return user;
  }
  return registerLocal({ login, email, password, passwordConfirm });
}

export async function login({ identifier, password }) {
  if (isServerMode()) {
    const guestState = exportCurrentState();
    const { user } = await apiLogin({ identifier, password, guestState });
    currentUser = user;
    await initStoreFromSession(user.id);
    updateProfile({ name: user.displayName || user.login });
    return user;
  }
  return loginLocal({ identifier, password });
}

export async function logout() {
  await flushSave();
  if (isServerMode()) {
    try { await apiLogout(); } catch { /* ignore */ }
  } else {
    localStorage.removeItem('violence_session');
  }
  currentUser = null;
  await initStoreFromSession(null);
}

export function getUserPublicInfo(user) {
  if (!user) return null;
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt,
  };
}

// ── Local fallback (offline / no API) ───────────────────────

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem('violence_users') || '{}');
  } catch {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem('violence_users', JSON.stringify(users));
}

function setLocalSession(userId) {
  localStorage.setItem('violence_session', JSON.stringify({ userId, at: Date.now() }));
}

async function registerLocal({ login, email, password, passwordConfirm }) {
  if (password !== passwordConfirm) throw new Error('Пароли не совпадают');
  const displayLogin = login.trim();
  const normLogin = displayLogin.toLowerCase();
  const normEmail = email.trim().toLowerCase();
  const users = loadUsers();
  if (Object.values(users).some(u => u.login === normLogin)) throw new Error('Этот логин уже занят');
  if (Object.values(users).some(u => u.email === normEmail)) throw new Error('Этот email уже зарегистрирован');

  const salt = randomId();
  const userId = randomId();
  const guestData = exportCurrentState();
  users[userId] = {
    id: userId,
    login: normLogin,
    displayName: displayLogin,
    email: normEmail,
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: Date.now(),
  };
  saveUsers(users);
  setLocalSession(userId);
  currentUser = users[userId];
  initStoreFromSession(userId);
  importState(guestData);
  updateProfile({ name: displayLogin, joinedAt: Date.now() });
  return users[userId];
}

async function loginLocal({ identifier, password }) {
  const id = identifier.trim().toLowerCase();
  const users = loadUsers();
  const user = Object.values(users).find(u => u.login === id || u.email === id);
  if (!user) throw new Error('Пользователь не найден');
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) throw new Error('Неверный пароль');
  const guestData = exportCurrentState();
  setLocalSession(user.id);
  currentUser = user;
  initStoreFromSession(user.id);
  importState(mergeGuestIntoSaved(guestData, getState()));
  updateProfile({ name: user.displayName || user.login });
  return user;
}

function mergeGuestIntoSaved(guest, saved) {
  if (!guest) return saved;
  return {
    ...saved,
    favorites: saved.favorites?.length ? saved.favorites : guest.favorites,
    bookmarks: Object.keys(saved.bookmarks || {}).length ? saved.bookmarks : guest.bookmarks,
    readChapters: [...new Set([...(saved.readChapters || []), ...(guest.readChapters || [])])],
    history: saved.history?.length ? saved.history : guest.history,
    stats: { ...guest.stats, ...saved.stats },
  lists: {
    reading: (saved.lists?.reading?.length ? saved.lists.reading : guest.lists?.reading) || [],
    plan: (saved.lists?.plan?.length ? saved.lists.plan : guest.lists?.plan) || [],
    completed: (saved.lists?.completed?.length ? saved.lists.completed : guest.lists?.completed) || [],
    dropped: (saved.lists?.dropped?.length ? saved.lists.dropped : guest.lists?.dropped) || [],
  },
  };
}
