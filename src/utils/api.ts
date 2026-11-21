import { useEffect, useRef } from 'react';
import type { UserRole } from '../types';

const TOKEN_KEYS: Record<UserRole, string> = {
  passenger: 'pr_token_passenger',
  partner: 'pr_token_partner',
  admin: 'pr_token_admin',
};

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
    }
  } catch {
    // ignore storage quota errors
  }
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
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 429 && data.quotaExceeded && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
    throw new Error(data.error || `Request failed (${res.status})`);
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
    let active = true;
    let retryTimer: number | undefined;

    const connect = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

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
        if (active) {
          retryTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [role, token]);

  return wsRef;
}
