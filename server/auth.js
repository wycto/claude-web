// Auth middleware + cookie helpers.
import { parse as parseCookie } from 'cookie';
import { verifyToken } from './config.js';

export const COOKIE_NAME = 'claude_web_token';

export function tokenFromReq(req) {
  // Prefer Authorization: Bearer, fall back to cookie.
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookies = parseCookie(req.headers['cookie'] || '');
  return cookies[COOKIE_NAME] || null;
}

export function requireAuth(req, res, next) {
  const data = verifyToken(tokenFromReq(req));
  if (!data) return res.status(401).json({ error: 'unauthorized' });
  req.user = data.u;
  next();
}

// For the WebSocket upgrade: returns the decoded user or null.
export function authenticateUpgrade(req) {
  // Browsers send cookies on the WS handshake automatically. Also accept
  // ?token= for non-cookie clients.
  let token = tokenFromReq(req);
  if (!token) {
    try {
      const url = new URL(req.url, 'http://localhost');
      token = url.searchParams.get('token');
    } catch {
      /* ignore */
    }
  }
  return verifyToken(token);
}
