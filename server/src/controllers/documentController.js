import { nanoid } from 'nanoid';
import { prisma } from '../db.js';
import { canManage, documentRole } from '../services/access.js';

const include = {
  owner: { select: { id: true, name: true, email: true } },
  members: { include: { user: { select: { id: true, name: true, email: true } } } },
};

export async function getDocuments(req, res) {
  const rawDocuments = await prisma.document.findMany({
    where: { members: { some: { userId: req.auth.sub } } },
    include: {
      ...include,
      updates: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { authorId: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const authorIds = [
    ...new Set(rawDocuments.map((doc) => doc.updates[0]?.authorId).filter(Boolean)),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true },
  });
  const namesMap = new Map(users.map((u) => [u.id, u.name]));

  const documents = rawDocuments.map((doc) => {
    const lastAuthorId = doc.updates[0]?.authorId;
    const lastEditorName = lastAuthorId ? namesMap.get(lastAuthorId) : doc.owner.name;
    const { updates, ...cleanDoc } = doc;
    return {
      ...cleanDoc,
      lastEditorName: lastEditorName || doc.owner.name,
    };
  });

  res.json({ documents });
}

export async function createDocument(req, res) {
  const title = String(req.body.title || '').trim();
  if (!title || title.length > 160) {
    return res.status(400).json({ error: 'A title up to 160 characters is required' });
  }
  const document = await prisma.document.create({
    data: {
      title,
      ownerId: req.auth.sub,
      members: { create: { userId: req.auth.sub, role: 'OWNER' } },
    },
    include,
  });
  res.status(201).json({ document });
}

export async function getDocumentById(req, res) {
  const role = await documentRole(req.params.id, req.auth.sub);
  if (!role) return res.status(404).json({ error: 'Document not found' });
  const document = await prisma.document.findUnique({
    where: { id: req.params.id },
    include,
  });
  res.json({ document, role });
}

export async function updateDocument(req, res) {
  const role = await documentRole(req.params.id, req.auth.sub);
  if (!role) {
    return res.status(404).json({ error: 'Document not found' });
  }
  if (!canManage(role)) {
    return res.status(403).json({ error: 'Only the owner can rename this document' });
  }
  const title = String(req.body.title || '').trim();
  if (!title || title.length > 160) {
    return res.status(400).json({ error: 'Valid title required' });
  }
  res.json({
    document: await prisma.document.update({
      where: { id: req.params.id },
      data: { title },
    }),
  });
}

export async function deleteDocument(req, res) {
  const role = await documentRole(req.params.id, req.auth.sub);
  if (!role) {
    return res.status(404).json({ error: 'Document not found' });
  }
  if (!canManage(role)) {
    return res.status(403).json({ error: 'Only the owner can delete this document' });
  }
  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).end();
}

export async function getDocumentMembers(req, res) {
  if (!(await documentRole(req.params.id, req.auth.sub))) {
    return res.status(404).json({ error: 'Document not found' });
  }
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    include,
  });
  res.json({ members: doc.members });
}

export async function createInvite(req, res) {
  if (!canManage(await documentRole(req.params.id, req.auth.sub))) {
    return res.status(403).json({ error: 'Only the owner can invite' });
  }
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
}

export async function removeMember(req, res) {
  if (!canManage(await documentRole(req.params.id, req.auth.sub))) {
    return res.status(403).json({ error: 'Only the owner can remove members' });
  }
  if (req.params.userId === req.auth.sub) {
    return res.status(400).json({ error: 'Owner cannot remove themselves' });
  }
  try {
    await prisma.documentMember.delete({
      where: {
        documentId_userId: { documentId: req.params.id, userId: req.params.userId },
      },
    });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Member not found' });
    }
    throw err;
  }
}

export async function getDocumentHistory(req, res) {
  if (!(await documentRole(req.params.id, req.auth.sub))) {
    return res.status(404).json({ error: 'Document not found' });
  }
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
}
