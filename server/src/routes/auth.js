import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { clearAuthCookie, setAuthCookie, signToken } from '../auth.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
const userView = ({ id, name, email }) => ({ id, name, email });
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || '') || password?.length < 8)
      return res
        .status(400)
        .json({ error: 'Provide a name, valid email and an 8+ character password' });
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    setAuthCookie(res, signToken(user));
    res.status(201).json({ user: userView(user) });
  } catch (error) {
    if (error.code === 'P2002')
      return res.status(409).json({ error: 'Email already registered' });
    next(error);
  }
});
router.post('/login', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { email: String(req.body.email || '').toLowerCase() },
  });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash)))
    return res.status(401).json({ error: 'Invalid email or password' });
  setAuthCookie(res, signToken(user));
  res.json({ user: userView(user) });
});
router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});
router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.sub } });
  if (!user) return res.status(401).json({ error: 'Session expired' });
  res.json({ user: userView(user) });
});
export default router;
