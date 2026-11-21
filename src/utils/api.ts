import { useEffect, useRef } from 'react';
import type { UserRole } from '../types';

const TOKEN_KEYS: Record<UserRole, string> = {
  passenger: 'pr_token_passenger',
  partner: 'pr_token_partner',
  admin: 'pr_token_admin',
};

const USER_KEYS: Record<UserRole, string> = {
  passenger: 'pr_user_passenger',
  partner: 'pr_user_partner',
  admin: 'pr_user_admin',
};

export class ApiRequestError extends Error {
  status: number;
  isBackendUnavailable: boolean;

  constructor(message: string, status: number, isBackendUnavailable = false) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.isBackendUnavailable = isBackendUnavailable;
  }
}

export function isBackendOfflineError(err: unknown): boolean {
  if (err instanceof ApiRequestError) {
    return err.isBackendUnavailable || [404, 405, 502, 503].includes(err.status);
  }
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('backend api unavailable') ||
    msg.includes('(404)') ||
    msg.includes('(405)')
  );
}

export function getRoleToken(role: UserRole): string | null {
  try {
    return localStorage.getItem(TOKEN_KEYS[role]);
  } catch {
    return null;
  }
}

export function setRoleToken(role: UserRole, token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEYS[role], token);
    } else {
      localStorage.removeItem(TOKEN_KEYS[role]);
      localStorage.removeItem(USER_KEYS[role]);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function getStoredRoleUser<T = any>(role: UserRole): T | null {
  try {
    const raw = localStorage.getItem(USER_KEYS[role]);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredRoleUser(role: UserRole, user: unknown | null) {
  try {
    if (user) {
      localStorage.setItem(USER_KEYS[role], JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEYS[role]);
    }
  } catch {
    // ignore
  }
}

let staticHostingDetected = false;
let backendHealthPromise: Promise<boolean> | null = null;

async function verifyLiveApiBackend(baseUrl: string): Promise<boolean> {
  if (staticHostingDetected) return false;
  if (!backendHealthPromise) {
    backendHealthPromise = fetch(`${baseUrl}/api/health`)
      .then((res) => {
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const ok = res.ok && ct.includes('application/json');
        if (!ok && !baseUrl) {
          staticHostingDetected = true;
        }
        return ok;
      })
      .catch(() => {
        if (!baseUrl) staticHostingDetected = true;
        return false;
      });
  }
  return backendHealthPromise;
}

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    role?: UserRole;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.role) {
    const token = getRoleToken(options.role);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  const baseUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || '';
  const fullUrl = path.startsWith('http') ? path : `${baseUrl}${path}`;

  // Avoid noisy 405 / HTML requests once static hosting (no Node/Express backend) is detected
  if (staticHostingDetected && !baseUrl && path !== '/api/health') {
    throw new ApiRequestError('Backend API unavailable on static hosting.', 405, true);
  }

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (networkErr: any) {
    throw new ApiRequestError(networkErr?.message || 'Backend server unreachable', 0, true);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text().catch(() => '');

  // Detect static SPA fallback returning index.html on GET /api/* routes (e.g. Vercel without serverless API)
  const trimmed = rawText.trim();
  const isHtml =
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html');

  if (isHtml) {
    if (!baseUrl) staticHostingDetected = true;
    throw new ApiRequestError('Backend API unavailable on static hosting (HTML received).', res.status || 404, true);
  }

  let data: any = {};
  if (trimmed) {
    try {
      data = JSON.parse(trimmed);
    } catch {
      if (res.ok) {
        if (!baseUrl) staticHostingDetected = true;
        throw new ApiRequestError('Invalid JSON response from API server.', res.status, true);
      }
    }
  }

  if (!res.ok) {
    if (res.status === 429 && data?.quotaExceeded && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    const unavailable = [404, 405, 502, 503, 504].includes(res.status);
    if (unavailable && !baseUrl) staticHostingDetected = true;
    throw new ApiRequestError(data?.error || `Request failed (${res.status})`, res.status, unavailable);
  }

  return data as T;
}

export function useRoleWebSocket(
  role: UserRole,
  token: string | null,
  onEvent: (event: string, data: any) => void
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;
    const customBase = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || '';
    if ((token.startsWith('pr_fb_') || staticHostingDetected) && !customBase) {
      return;
    }

    let active = true;
    let retryTimer: number | undefined;
    let retryCount = 0;

    const connect = () => {
      if (!active || retryCount > 4 || (staticHostingDetected && !customBase)) return;
      let wsHost = window.location.host;
      let proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      if (customBase) {
        try {
          const parsedUrl = new URL(customBase);
          wsHost = parsedUrl.host;
          proto = parsedUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        } catch {
          // ignore
        }
      }
      const url = `${proto}//${wsHost}/ws?token=${encodeURIComponent(token)}`;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          retryCount = 0;
        };

        ws.onmessage = (msg) => {
          try {
            const parsed = JSON.parse(msg.data) as { event: string; data: any };
            if (parsed.event) {
              handlerRef.current(parsed.event, parsed.data);
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          if (active && !(staticHostingDetected && !customBase)) {
            retryCount += 1;
            retryTimer = window.setTimeout(connect, Math.min(15000, 3000 * retryCount));
          }
        };
      } catch {
        // ignore WebSocket init errors
      }
    };

    void verifyLiveApiBackend(customBase).then((hasBackend) => {
      if (active && hasBackend) {
        connect();
      }
    });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [role, token]);

  return wsRef;
}
