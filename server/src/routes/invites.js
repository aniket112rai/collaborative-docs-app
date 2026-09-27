import { Router } from 'express';
import { getInvite, joinInvite } from '../controllers/inviteController.js';

const router = Router();

router.get('/:token', getInvite);
router.post('/:token/join', joinInvite);

export default router;
