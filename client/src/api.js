const isDev = import.meta.env.DEV;
const API_BASE = import.meta.env.VITE_API_BASE || (isDev ? 'http://127.0.0.1:5000' : '');
const KEY_STORE = 'emberlink-operator-key';

export function setOperatorKey(key) {
  if (typeof window === 'undefined') return;
  if (!key) {
    window.localStorage.removeItem(KEY_STORE);
    return;
  }
  window.localStorage.setItem(KEY_STORE, key);
}

export function getOperatorKey() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(KEY_STORE) || '';
}

export function clearOperatorKey() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY_STORE);
}

export function connectWebSocket() {
  return () => {};
}

export function disconnectWebSocket() {
  return () => {};
}

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const key = getOperatorKey();
  const headers = {
    'Content-Type': 'application/json',
    ...(key ? { 'x-operator-key': key } : {}),
    ...(options.headers || {})
  };

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (!res.ok) {
    let message = `API ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }

  return res.json();
}

export const apiClient = {
  getMessages: () => api('/api/messages'),
  sendMessage: (data) => api('/api/messages', { method: 'POST', body: JSON.stringify(data) }),
  updateMessage: (id, data) => api(`/api/messages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getRelays: () => api('/api/relays'),
  updateRelay: (id, data) => api(`/api/relays/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getTasks: () => api('/api/tasks'),
  addTask: (data) => api('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  toggleTask: (id, completed) => api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ completed }) }),
  getCapsules: () => api('/api/capsules'),
  addCapsule: (data) => api('/api/capsules', { method: 'POST', body: JSON.stringify(data) }),
  getStats: () => api('/api/stats'),
  getHealth: () => api('/api/health')
};
