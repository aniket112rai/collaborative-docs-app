import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import documentRoutes from './routes/documents.js';
import inviteRoutes from './routes/invites.js';
import { requireAuth } from './middleware/auth.js';
import { attachCollaboration } from './collaboration.js';
const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15 * 60e3, limit: 100 }), authRoutes);
app.use('/api/documents', requireAuth, documentRoutes);
app.use('/api/invites', requireAuth, inviteRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error' });
});
const server = http.createServer(app);
attachCollaboration(server);
server.listen(process.env.PORT || 3001, () =>
  console.log(`API listening on ${process.env.PORT || 3001}`),
);
