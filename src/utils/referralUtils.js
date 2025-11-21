import crypto from 'crypto';
import User from '../models/User.js';

// Generate unique 12-character referral code
export const generateReferralCode = () => {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
};

// Validate referral code exists and is active
export const validateReferralCode = async (referralCode) => {
  if (!referralCode) return null;
  
  const referrer = await User.findOne({ 
    referralCode: referralCode.toUpperCase(),
    'subscription.endDate': { $gte: new Date() }
  });
  
  return referrer;
};

// Update referral stats
export const updateReferralStats = async (referrerId, isActive = false) => {
  const user = await User.findById(referrerId);
  if (!user) return;

  const totalReferrals = user.referrals.length;
  const activeReferrals = user.referrals.filter(ref => ref.isActive).length;
  
  user.referralStats.totalReferrals = totalReferrals;
  user.referralStats.activeReferrals = activeReferrals;
  
  await user.save();
};

// Process referral on successful payment
export const processReferralReward = async (referredUserId, referrerId) => {
  try {
    // Update referee status to active
    await User.findOneAndUpdate(
      { 
        _id: referrerId,
        'referrals.userId': referredUserId 
      },
      { 
        $set: { 
          'referrals.$.isActive': true,
          'referrals.$.subscriptionStatus': 'active'
        }
      }
    );

    // Update referrer stats
    await updateReferralStats(referrerId, true);
    
    console.log(`Referral processed: ${referredUserId} -> ${referrerId}`);
  } catch (error) {
    console.error('Error processing referral reward:', error);
  }
};