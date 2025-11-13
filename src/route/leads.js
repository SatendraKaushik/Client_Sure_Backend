import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getLeads,
  accessLead,
  getAccessedLeads,
  getAccessedLeadById,
  bulkAccessLeads
} from '../controller/UserController.js/leads.controller.js';

const router = express.Router();

// Lead access routes
router.get('/', authenticateToken, getLeads);
router.post('/:id/access', authenticateToken, accessLead);
router.get('/accessed', authenticateToken, getAccessedLeads);
router.get('/accessed/:id', authenticateToken, getAccessedLeadById);
router.post('/bulk-access', authenticateToken, bulkAccessLeads);

export default router;