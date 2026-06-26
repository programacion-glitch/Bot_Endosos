import { JobInputUI, JobSummary } from './types';

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    let body: any = {};
    try { body = await res.json(); } catch { /* ignore */ }
    const err = new Error(body.error || body.errors?.join('; ') || `HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  login: (username: string, password: string) =>
    req<{ user: string }>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: true }>('/api/logout', { method: 'POST' }),
  me: () => req<{ user: string }>('/api/me'),
  createJob: (job: JobInputUI) =>
    req<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify(job) }),
  listJobs: () => req<JobSummary[]>('/api/jobs'),
  getJob: (id: string) => req<JobSummary>(`/api/jobs/${id}`),
};
