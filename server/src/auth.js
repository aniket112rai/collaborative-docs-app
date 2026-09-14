import jwt from 'jsonwebtoken';
const cookieName = 'collab_token';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required');
export const signToken = (user) =>
  jwt.sign({ sub: user.id, email: user.email }, secret, { expiresIn: '7d' });
export const verifyToken = (token) => jwt.verify(token, secret);
export const setAuthCookie = (res, token) =>
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 86400000,
  });
export const clearAuthCookie = (res) => res.clearCookie(cookieName);
export const tokenFromCookie = (cookie = '') =>
  cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
