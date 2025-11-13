import express from 'express';
// import { login, register, requestReset, resetPassword, logout, accessResource, getAccessedResources, getUserProfile } from '../controller/authController.js';
import { authenticateToken } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { getUserProfile, login, logout, register, requestReset, resetPassword, updateUserProfile } from '../controller/UserController.js/authController.js';
import { accessResource, getAccessedResourceById, getAccessedResources } from '../controller/UserController.js/resources.controller.js';
// leads
import { getLeads, accessLead, getAccessedLeads, getAccessedLeadById, bulkAccessLeads } from '../controller/UserController.js/leads.controller.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', register);

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', logout);

// POST /api/auth/request-reset
router.post('/request-reset', requestReset);

// POST /api/auth/reset/:token
router.post('/reset/:token', resetPassword);

// POST /api/auth/access/:id - Access resource (reduces tokens)
router.post('/access/:id', authenticateToken, accessResource);

// GET /api/auth/accessed-resources - Get user's accessed resources
router.get('/accessed-resources', authenticateToken, getAccessedResources);

// Get /auth/resources/:id
router.get('/resources/:id', authenticateToken, getAccessedResourceById);

// GET /api/auth/profile - Get user profile data
router.get('/profile', authenticateToken, getUserProfile);

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticateToken, upload.single('avatar'), updateUserProfile);



// GET /api/auth/leads
router.get('/leads', authenticateToken, getLeads);

// POST /api/auth/leads/:id/access
router.post('/leads/:id/access', authenticateToken, accessLead);

// GET /api/auth/leads/accessed
router.get('/get-accesse-leads/accessed', authenticateToken, getAccessedLeads);

router.get('/leads/get-accessed/:id', authenticateToken, getAccessedLeadById);

// bulk lead

router.post('/leads/bulk-access', authenticateToken, bulkAccessLeads);



export default router;