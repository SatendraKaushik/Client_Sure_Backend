import crypto from 'crypto';
import { Order, Plan, User } from '../models/index.js';
import { sendPasswordSetupEmail } from './UserController.js/authController.js';

export const handleWebhook = async (req, res) => {
  try {
    const rawBody = JSON.stringify(req.body);
    
    // Verify signature (skip in dev for now)
    const signature = req.headers['x-signature'];
    if (process.env.NODE_ENV === 'production' && signature) {
      const expected = crypto
        .createHmac('sha256', process.env.WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
      
      if (expected !== signature) {
        console.log('Invalid webhook signature');
        return res.status(400).end();
      }
    }

    const event = req.body;
    console.log('Webhook received:', event.type);

    // Handle payment success
    if (event.type === 'payment.success') {
      const { order_id, clientOrderId, email, name, amount } = event.data;

      // Find local Order
      let order = await Order.findOne({ clientOrderId });
      if (!order) {
        order = await Order.findOne({ providerOrderId: order_id });
      }

      if (!order) {
        console.log('Order not found:', clientOrderId);
        return res.status(404).json({ error: 'Order not found' });
      }

      // Check idempotency - if already paid
      if (order.status === 'completed') {
        console.log('Order already processed:', order.clientOrderId);
        return res.status(200).json({ message: 'Already processed' });
      }

      // Update order status - keep original plan price
      order.status = 'completed';
      order.providerOrderId = order_id;
      await order.save();

      // Get plan details
      const plan = await Plan.findById(order.planId);
      if (!plan) {
        console.log('Plan not found:', order.planId);
        return res.status(404).json({ error: 'Plan not found' });
      }

      // Create or update User
      let user = await User.findOne({ email: email.toLowerCase() });
      
      if (!user) {
        // Calculate monthly allocation based on plan
        const monthlyAllocation = plan.durationDays * plan.dailyTokens;
        
        // Create new user
        user = new User({
          name: name || order.userName,
          email: email.toLowerCase(),
          tokens: plan.dailyTokens, // Use plan's daily tokens
          tokensUsedTotal: 0,
          tokensUsedToday: 0,
          monthlyTokensTotal: monthlyAllocation,
          monthlyTokensUsed: 0,
          monthlyTokensRemaining: monthlyAllocation,
          subscription: {
            planId: plan._id,
            startDate: new Date(),
            endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
            dailyTokens: plan.dailyTokens, // Use plan's daily tokens
            monthlyAllocation: monthlyAllocation,
            currentMonth: new Date().getMonth(),
            currentYear: new Date().getFullYear(),
            lastRefreshedAt: new Date()
          }
        });
      } else {
        // For existing user renewal - use plan data
        const monthlyAllocation = plan.durationDays * plan.dailyTokens;
        
        // Update existing user subscription
        user.tokens = plan.dailyTokens; // Use plan's daily tokens
        user.tokensUsedToday = 0;
        
        // Reset monthly tokens for new plan purchase
        user.monthlyTokensTotal = monthlyAllocation;
        user.monthlyTokensUsed = 0;
        user.monthlyTokensRemaining = monthlyAllocation;
        
        user.subscription = {
          planId: plan._id,
          startDate: new Date(),
          endDate: new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000),
          dailyTokens: plan.dailyTokens, // Use plan's daily tokens
          monthlyAllocation: monthlyAllocation,
          currentMonth: new Date().getMonth(),
          currentYear: new Date().getFullYear(),
          lastRefreshedAt: new Date()
        };
      }

      await user.save();

      // Send password setup email
      const isNewUser = !user.passwordHash;
      console.log(`Attempting to send email to ${user.email}, isNewUser: ${isNewUser}`);
      
      try {
        const emailSent = await sendPasswordSetupEmail(user, isNewUser);
        console.log(`Email send result: ${emailSent}`);
        if (emailSent) {
          console.log(`✅ Password setup email sent successfully to ${user.email}`);
        } else {
          console.log(`❌ Failed to send email to ${user.email}`);
        }
      } catch (emailError) {
        console.error(`❌ Email sending error for ${user.email}:`, emailError);
      }
      
      console.log(`Payment processed for ${user.email}`);
      
      res.status(200).json({ 
        message: 'Payment processed successfully',
        userId: user._id 
      });

    } else {
      console.log('Unhandled webhook type:', event.type);
      res.status(200).json({ message: 'Event received' });
    }

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};