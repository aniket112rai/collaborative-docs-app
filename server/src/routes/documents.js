import { Router } from 'express';
import {
  createDocument,
  createInvite,
  deleteDocument,
  getDocumentById,
  getDocumentHistory,
  getDocumentMembers,
  getDocuments,
  removeMember,
  updateDocument,
} from '../controllers/documentController.js';

const router = Router();

router.get('/', getDocuments);
router.post('/', createDocument);
router.get('/:id', getDocumentById);
router.patch('/:id', updateDocument);
router.delete('/:id', deleteDocument);
router.get('/:id/members', getDocumentMembers);
router.post('/:id/invites', createInvite);
router.delete('/:id/members/:userId', removeMember);
router.get('/:id/history', getDocumentHistory);

export default router;
