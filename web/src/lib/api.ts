import type { DirListing, GitStatus, SessionMeta } from './types';

async function req<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
  });
  if (res.status === 401) throw new ApiError('unauthorized', 401);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || res.statusText, res.status);
  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const api = {
  status: () => req<{ configured: boolean }>('/api/status'),
  me: () => req<{ user: string }>('/api/me'),
  login: (username: string, password: string) =>
    req<{ token: string; user: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req<{ ok: boolean }>('/api/logout', { method: 'POST' }),

  sessions: (dir?: string) =>
    req<{ sessions: SessionMeta[] }>(`/api/sessions${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`),
  loadSession: (id: string, dir?: string) =>
    req<{ messages: any[] }>(
      `/api/sessions/${id}${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`
    ),
  deleteSession: (id: string, dir?: string) =>
    req<{ ok: boolean }>(
      `/api/sessions/${id}${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`,
      { method: 'DELETE' }
    ),
  renameSession: (id: string, title: string, dir?: string) =>
    req<{ ok: boolean }>(
      `/api/sessions/${id}${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`,
      { method: 'PATCH', body: JSON.stringify({ title }) }
    ),
  forkSession: (id: string, body: { dir?: string; upToMessageId?: string; title?: string } = {}) =>
    req<{ sessionId: string }>(`/api/sessions/${id}/fork`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  fsHome: () => req<{ home: string; roots: string[] }>('/api/fs/home'),
  fsList: (dir?: string, showHidden = false) => {
    const params = new URLSearchParams();
    if (dir) params.set('dir', dir);
    if (showHidden) params.set('all', '1');
    const qs = params.toString();
    return req<DirListing>(`/api/fs${qs ? `?${qs}` : ''}`);
  },
  fsSearch: (cwd: string, q: string) =>
    req<{ files: { path: string; name: string }[] }>(
      `/api/fs/search?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`
    ),

  getSettings: () =>
    req<{ port: number; roots: string[]; portOverridden: boolean }>('/api/settings'),
  updateSettings: (body: { port?: number; roots?: string[] }) =>
    req<{ ok: boolean; port: number; roots: string[] }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  restart: () => req<{ ok: boolean; port: number }>('/api/restart', { method: 'POST' }),

  gitStatus: (cwd: string) =>
    req<GitStatus>(`/api/git/status?cwd=${encodeURIComponent(cwd)}`),
  gitDiff: (cwd: string, path?: string, staged?: boolean) =>
    req<{ diff: string }>(
      `/api/git/diff?cwd=${encodeURIComponent(cwd)}${
        path ? `&path=${encodeURIComponent(path)}` : ''
      }${staged ? '&staged=1' : ''}`
    ),
};
