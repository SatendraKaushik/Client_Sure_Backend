import User from '../../models/User.js';
import Order from '../../models/Order.js';
import Plan from '../../models/Plan.js';
import Resource from '../../models/Resource.js';
import Lead from '../../models/Lead.js';

// GET /api/admin/analytics
export const getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // User Analytics
    const totalUsers = await User.countDocuments();
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: startOfDay } });
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: startOfWeek } });
    const newUsersThisMonth = await User.countDocuments({ createdAt: { $gte: startOfMonth } });
    const activeSubscriptions = await User.countDocuments({ 'subscription.planId': { $exists: true } });

    // Order Analytics
    const totalOrders = await Order.countDocuments();
    const completedOrders = await Order.countDocuments({ status: 'completed' });
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const failedOrders = await Order.countDocuments({ status: 'failed' });
    const ordersToday = await Order.countDocuments({ createdAt: { $gte: startOfDay } });
    const ordersThisMonth = await Order.countDocuments({ createdAt: { $gte: startOfMonth } });

    // Revenue Analytics
    const totalRevenue = await Order.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const monthlyRevenue = await Order.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Token Analytics
    const totalTokensDistributed = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$tokens' } } }
    ]);
    const totalTokensUsed = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$tokensUsedTotal' } } }
    ]);

    // Resource Analytics
    const totalResources = await Resource.countDocuments();
    const activeResources = await Resource.countDocuments({ isActive: true });
    const resourcesByType = await Resource.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    // Plan Analytics
    const planStats = await Plan.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'subscription.planId',
          as: 'subscribers'
        }
      },
      {
        $project: {
          name: 1,
          price: 1,
          subscriberCount: { $size: '$subscribers' }
        }
      }
    ]);

    // Recent Activity
    const recentUsers = await User.find()
      .select('name email createdAt')
      .sort({ createdAt: -1 })
      .limit(10);

    // Lead Analytics
    const totalLeads = await Lead.countDocuments();
    const activeLeads = await Lead.countDocuments({ isActive: true });

    res.json({
      users: {
        total: totalUsers,
        newToday: newUsersToday,
        newThisWeek: newUsersThisWeek,
        newThisMonth: newUsersThisMonth,
        activeSubscriptions
      },
      orders: {
        total: totalOrders,
        completed: completedOrders,
        pending: pendingOrders,
        failed: failedOrders,
        today: ordersToday,
        thisMonth: ordersThisMonth
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
        monthly: monthlyRevenue[0]?.total || 0
      },
      tokens: {
        distributed: totalTokensDistributed[0]?.total || 0,
        used: totalTokensUsed[0]?.total || 0
      },
      resources: {
        total: totalResources,
        active: activeResources,
        byType: resourcesByType
      },
      leads: {
        total: totalLeads,
        active: activeLeads
      },
      plans: planStats,
      recentUsers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/analytics/user-growth
export const getUserGrowthData = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const userData = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.json(userData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/analytics/revenue
export const getRevenueData = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const revenueData = await Order.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.json(revenueData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};