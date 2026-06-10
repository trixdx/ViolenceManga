const API = '/api';

let serverAvailable = null;

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function checkServerHealth() {
  try {
    const data = await request('/health');
    serverAvailable = !!data.ok && !!data.db;
    return serverAvailable;
  } catch {
    serverAvailable = false;
    return false;
  }
}

export function isServerMode() {
  return serverAvailable === true;
}

export async function apiRegister(body) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

export async function apiLogin(body) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

export async function apiLogout() {
  return request('/auth/logout', { method: 'POST' });
}

export async function apiMe() {
  return request('/auth/me');
}

export async function fetchStateFromServer() {
  return request('/state');
}

export async function pushStateToServer(state) {
  return request('/state', { method: 'PUT', body: JSON.stringify(state) });
}

export async function flushStateToServer(state) {
  if (!serverAvailable) return;
  await pushStateToServer(state);
}
