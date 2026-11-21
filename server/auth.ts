import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, SUPER_ADMIN_ALLOWLIST } from './db.ts';

export type UserRole = 'passenger' | 'partner' | 'admin';

export interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  tv?: number;
  exp: number;
}

export interface AuthedRequest extends Request {
  auth?: AuthTokenPayload;
}

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`prorider-ai-${process.cwd()}-secret`).digest('hex');

export function signAuthToken(payload: Omit<AuthTokenPayload, 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string {
  const fullPayload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthTokenPayload;
    if (!payload.sub || !payload.role || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  const user = db
    .prepare('SELECT id, role, email, status, token_version, admin_setup_completed FROM users WHERE id = ?')
    .get(payload.sub) as
    | {
        id: string;
        role: UserRole;
        email: string;
        status: string;
        token_version: number;
        admin_setup_completed: number;
      }
    | undefined;
  if (!user || user.role !== payload.role || user.status === 'suspended') {
    res.status(403).json({ error: 'Account access denied or suspended' });
    return;
  }
  if (typeof payload.tv === 'number' && payload.tv !== user.token_version) {
    res.status(401).json({ error: 'Session invalidated due to password or security change' });
    return;
  }
  if (user.role === 'admin' && user.admin_setup_completed !== 1) {
    res.status(403).json({ error: 'Super Admin setup has not been completed' });
    return;
  }
  req.auth = payload;
  next();
}

export function requireRole(role: UserRole) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      if (!req.auth || req.auth.role !== role) {
        res.status(403).json({ error: `Access restricted to ${role} accounts` });
        return;
      }
      if (role === 'admin') {
        const emailNorm = (req.auth.email || '').trim().toLowerCase();
        if (!SUPER_ADMIN_ALLOWLIST.has(emailNorm)) {
          res.status(403).json({ error: 'Unauthorized Super Admin identity' });
          return;
        }
      }
      next();
    });
  };
}
