import { Router } from 'express';
import { nanoid } from 'nanoid';
import { prisma } from '../db.js';
import { canManage, documentRole } from '../services/access.js';
const router = Router();
const include = {
  owner: { select: { id: true, name: true, email: true } },
  members: { include: { user: { select: { id: true, name: true, email: true } } } },
};
router.get('/', async (req, res) => {
  const documents = await prisma.document.findMany({
    where: { members: { some: { userId: req.auth.sub } } },
    include,
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ documents });
});
router.post('/', async (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title || title.length > 160)
    return res.status(400).json({ error: 'A title up to 160 characters is required' });
  const document = await prisma.document.create({
    data: {
      title,
      ownerId: req.auth.sub,
      members: { create: { userId: req.auth.sub, role: 'OWNER' } },
    },
    include,
  });
  res.status(201).json({ document });
});
router.get('/:id', async (req, res) => {
  const role = await documentRole(req.params.id, req.auth.sub);
  if (!role) return res.status(404).json({ error: 'Document not found' });
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    include,
  });
  res.json({ document, role });
});
router.patch('/:id', async (req, res) => {
  const role = await documentRole(req.params.id, req.auth.sub);
  if (!canManage(role))
    return res.status(403).json({ error: 'Only the owner can rename this document' });
  const title = String(req.body.title || '').trim();
  if (!title || title.length > 160)
    return res.status(400).json({ error: 'Valid title required' });
  res.json({
    document: await prisma.document.update({
      where: { id: req.params.id },
      data: { title },
    }),
  });
});
router.delete('/:id', async (req, res) => {
  if (!canManage(await documentRole(req.params.id, req.auth.sub)))
    return res.status(403).json({ error: 'Only the owner can delete this document' });
  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
router.get('/:id/members', async (req, res) => {
  if (!(await documentRole(req.params.id, req.auth.sub)))
    return res.status(404).json({ error: 'Document not found' });
  res.json({
    members: (
      await prisma.document.findUnique({ where: { id: req.params.id }, include })
    ).members,
  });
});
router.post('/:id/invites', async (req, res) => {
  if (!canManage(await documentRole(req.params.id, req.auth.sub)))
    return res.status(403).json({ error: 'Only the owner can invite' });
  const role = req.body.role === 'VIEWER' ? 'VIEWER' : 'EDITOR';
  const invite = await prisma.invite.create({
    data: {
      documentId: req.params.id,
      createdById: req.auth.sub,
      token: nanoid(16),
      role,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
    },
  });
  res.status(201).json({ invite });
});
router.delete('/:id/members/:userId', async (req, res) => {
  if (!canManage(await documentRole(req.params.id, req.auth.sub)))
    return res.status(403).json({ error: 'Only the owner can remove members' });
  if (req.params.userId === req.auth.sub)
    return res.status(400).json({ error: 'Owner cannot remove themselves' });
  await prisma.documentMember.delete({
    where: {
      documentId_userId: { documentId: req.params.id, userId: req.params.userId },
    },
  });
  res.status(204).end();
});
router.get('/:id/history', async (req, res) => {
  if (!(await documentRole(req.params.id, req.auth.sub)))
    return res.status(404).json({ error: 'Document not found' });
  const rawUpdates = await prisma.documentUpdate.findMany({
    where: { documentId: req.params.id },
    select: { id: true, authorId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const userIds = [...new Set(rawUpdates.map((item) => item.authorId).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((user) => [user.id, user.name]));

  const groupedEvents = [];
  const THREE_MINUTES_MS = 3 * 60 * 1000;

  for (const item of rawUpdates) {
    const authorName = names.get(item.authorId) || 'Collaborator';
    const itemTime = new Date(item.createdAt).getTime();

    if (groupedEvents.length > 0) {
      const lastGroup = groupedEvents[groupedEvents.length - 1];
      const lastGroupTime = new Date(lastGroup.createdAt).getTime();
      const sameAuthor = lastGroup.authorId === item.authorId;
      const withinTimeWindow = Math.abs(lastGroupTime - itemTime) <= THREE_MINUTES_MS;

      if (sameAuthor && withinTimeWindow) {
        lastGroup.count += 1;
        continue;
      }
    }

    groupedEvents.push({
      id: item.id,
      authorId: item.authorId,
      author: authorName,
      createdAt: item.createdAt,
      count: 1,
    });
  }

  res.json({ events: groupedEvents.slice(0, 50) });
});
export default router;
