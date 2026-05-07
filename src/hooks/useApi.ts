import { ADMIN_TOKEN_STORAGE_KEY, ROLE_STORAGE_KEY } from '../context/RoleContext';

const API_BASE = '/api';

function pathWithRole(path: string): string {
  if (typeof window === 'undefined') return `${API_BASE}${path}`;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  const role = window.localStorage.getItem(ROLE_STORAGE_KEY);
  if (role && !url.searchParams.has('role')) {
    url.searchParams.set('role', role);
  }
  return `${url.pathname}${url.search}`;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(typeof window !== 'undefined' && window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)
      ? { 'x-kbig-admin-token': window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '' }
      : {}),
    ...(options?.headers || {}),
  };

  const res = await fetch(pathWithRole(path), {
    ...options,
    cache: 'no-store',
    headers,
  });
  const contentType = res.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const baseMessage = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error: unknown }).error)
      : `API error: ${res.status}`;
    const details = typeof payload === 'object' && payload && 'details' in payload
      ? (payload as { details?: unknown }).details
      : null;
    const detailMessage = Array.isArray(details) ? ` ${details.join(', ')}` : '';
    throw new Error(`${baseMessage}${detailMessage}`);
  }

  return payload as T;
}
