import { Router } from 'express';
import { prisma } from '../db.js';
const router = Router();
async function validInvite(token) {
  return prisma.invite.findFirst({
    where: {
      token,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { document: { select: { id: true, title: true } } },
  });
}
router.get('/:token', async (req, res) => {
  const invite = await validInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite is invalid or expired' });
  res.json({
    invite: {
      token: invite.token,
      role: invite.role,
      document: invite.document,
      expiresAt: invite.expiresAt,
    },
  });
});
router.post('/:token/join', async (req, res) => {
  const invite = await validInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invite is invalid or expired' });
  await prisma.documentMember.upsert({
    where: {
      documentId_userId: { documentId: invite.documentId, userId: req.auth.sub },
    },
    create: { documentId: invite.documentId, userId: req.auth.sub, role: invite.role },
    update: {},
  });
  res.json({ documentId: invite.documentId });
});
export default router;
