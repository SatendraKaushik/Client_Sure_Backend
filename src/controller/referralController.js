import { User } from '../models/index.js';
import { validateReferralCode } from '../utils/referralUtils.js';

// GET /api/referrals/validate/:code
export const validateReferral = async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({ error: 'Referral code is required' });
    }

    const referrer = await validateReferralCode(code);
    
    if (!referrer) {
      return res.status(404).json({ 
        valid: false, 
        error: 'Invalid or expired referral code' 
      });
    }

    res.json({
      valid: true,
      referrer: {
        name: referrer.name,
        email: referrer.email
      }
    });
  } catch (error) {
    console.error('Validate referral error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/referrals/my-referrals
export const getMyReferrals = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId)
      .populate('referrals.userId', 'name email createdAt')
      .select('referralCode referrals referralStats');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      referralCode: user.referralCode,
      stats: user.referralStats,
      referrals: user.referrals.map(ref => ({
        user: ref.userId,
        joinedAt: ref.joinedAt,
        isActive: ref.isActive,
        subscriptionStatus: ref.subscriptionStatus
      }))
    });
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/referrals/stats
export const getReferralStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('referralStats referralCode');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      referralCode: user.referralCode,
      totalReferrals: user.referralStats.totalReferrals,
      activeReferrals: user.referralStats.activeReferrals,
      totalEarnings: user.referralStats.totalEarnings
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};