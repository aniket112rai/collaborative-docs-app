import { verifyToken } from '../auth.js';
export function requireAuth(req, res, next) {
  try {
    req.auth = verifyToken(req.cookies.collab_token);
    next();
  } catch {
    res.status(401).json({ error: 'Authentication required' });
  }
}
