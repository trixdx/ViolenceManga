import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const COOKIE = 'violence_token';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '30d' });
}

export function authMiddleware(req, res, next) {
  const token = req.cookies?.[COOKIE] || bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function bearerToken(req) {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

export function setAuthCookie(res, userId) {
  const token = signToken(userId);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE, { path: '/', secure: config.cookieSecure });
}

export { COOKIE };
