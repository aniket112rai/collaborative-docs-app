import { prisma } from '../db.js';
export async function documentRole(documentId, userId) {
  const member = await prisma.documentMember.findUnique({
    where: { documentId_userId: { documentId, userId } },
  });
  return member?.role || null;
}
export const canEdit = (role) => role === 'OWNER' || role === 'EDITOR';
export const canManage = (role) => role === 'OWNER';
