import express from 'express';
import { validateReferral, getMyReferrals, getReferralStats } from '../controller/referralController.js';
import { authenticateToken as auth } from '../middleware/auth.js';

const router = express.Router();

// Public route to validate referral code
router.get('/validate/:code', validateReferral);

// Protected routes
router.get('/my-referrals', auth, getMyReferrals);
router.get('/stats', auth, getReferralStats);

export default router;