import { Lead, User } from "../../models/index.js";

// GET /api/auth/leads
export const getLeads = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const leads = await Lead.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get user's accessed leads
    const user = await User.findById(userId).select('accessedLeads');
    const accessedLeadIds = user?.accessedLeads?.map(item => item.leadId.toString()) || [];

    const total = await Lead.countDocuments({ isActive: true });

    res.json({
      leads: leads.map(lead => ({
        id: lead._id,
        leadId: lead.leadId,
        name: lead.name,
        email: lead.email,
        linkedin: lead.linkedin,
        lastVerifiedAt: lead.lastVerifiedAt,
        phone: lead.phone,
        facebookLink: lead.facebookLink,
        websiteLink: lead.websiteLink,
        googleMapLink: lead.googleMapLink,
        instagram: lead.instagram,
        addressStreet: lead.addressStreet,
        city: lead.city,
        country: lead.country,
        category: lead.category,
        isActive: lead.isActive,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        isAccessedByUser: accessedLeadIds.includes(lead._id.toString())
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + leads.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/leads/:id/access
export const accessLead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const lead = await Lead.findById(id);
    if (!lead || !lead.isActive) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const user = await User.findById(userId).populate('subscription.planId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if subscription is active
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      return res.status(403).json({ 
        error: 'Subscription expired',
        needsRenewal: true 
      });
    }

    // Check if user has enough tokens
    if (user.tokens < 1) {
      return res.status(403).json({ 
        error: 'Insufficient tokens',
        message: 'You need 1 token to access this lead'
      });
    }

    // Deduct 1 token
    user.tokens -= 1;
    user.tokensUsedToday = (user.tokensUsedToday || 0) + 1;
    user.tokensUsedTotal = (user.tokensUsedTotal || 0) + 1;

    // Add to accessed leads history
    if (!user.accessedLeads) {
      user.accessedLeads = [];
    }
    user.accessedLeads.unshift({
      leadId: lead._id,
      accessedAt: new Date()
    });

    // Keep only last 100 accessed leads
    if (user.accessedLeads.length > 100) {
      user.accessedLeads = user.accessedLeads.slice(0, 100);
    }

    // Add user to lead's accessedBy array
    if (!lead.accessedBy.includes(userId)) {
      lead.accessedBy.push(userId);
      await lead.save();
    }

    await user.save();

    res.json({
      message: 'Lead access granted',
      lead: {
        id: lead._id,
        leadId: lead.leadId,
        name: lead.name,
        email: lead.email,
        linkedin: lead.linkedin,
        lastVerifiedAt: lead.lastVerifiedAt,
        phone: lead.phone,
        facebookLink: lead.facebookLink,
        websiteLink: lead.websiteLink,
        googleMapLink: lead.googleMapLink,
        instagram: lead.instagram,
        addressStreet: lead.addressStreet,
        city: lead.city,
        country: lead.country,
        category: lead.category
      },
      tokensRemaining: user.tokens
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/leads/get-accessed/:id
export const getAccessedLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const lead = await Lead.findById(id);
    if (!lead || !lead.isActive) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if user has accessed this lead
    const user = await User.findById(userId).select('accessedLeads');
    const accessedLead = user?.accessedLeads?.find(item => 
      item.leadId.toString() === id
    );

    if (!accessedLead) {
      return res.status(403).json({ 
        error: 'Lead not accessed',
        message: 'You need to access this lead first to view details'
      });
    }

    res.json({
      id: lead._id,
      leadId: lead.leadId,
      name: lead.name,
      email: lead.email,
      linkedin: lead.linkedin,
      lastVerifiedAt: lead.lastVerifiedAt,
      phone: lead.phone,
      facebookLink: lead.facebookLink,
      websiteLink: lead.websiteLink,
      googleMapLink: lead.googleMapLink,
      instagram: lead.instagram,
      addressStreet: lead.addressStreet,
      city: lead.city,
      country: lead.country,
      category: lead.category,
      isActive: lead.isActive,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      accessedAt: accessedLead.accessedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /auth/leads/bulk-access
export const bulkAccessLeads = async (req, res) => {
  try {
    const { leadIds } = req.body;
    const userId = req.user.userId;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'Lead IDs array is required' });
    }

    // Limit to maximum 10 leads per request
    if (leadIds.length > 10) {
      return res.status(400).json({ 
        error: 'Maximum 10 leads allowed per request',
        requested: leadIds.length,
        maximum: 10
      });
    }

    const user = await User.findById(userId).populate('subscription.planId');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if subscription is active
    const now = new Date();
    if (!user.subscription.endDate || user.subscription.endDate < now) {
      return res.status(403).json({ 
        error: 'Subscription expired',
        needsRenewal: true 
      });
    }

    // Find all requested leads
    const leads = await Lead.find({ 
      _id: { $in: leadIds }, 
      isActive: true 
    });

    if (leads.length !== leadIds.length) {
      return res.status(404).json({ 
        error: 'Some leads not found or inactive',
        found: leads.length,
        requested: leadIds.length
      });
    }

    // Filter out already accessed leads
    const accessedLeadIds = user.accessedLeads?.map(item => item.leadId.toString()) || [];
    const newLeads = leads.filter(lead => !accessedLeadIds.includes(lead._id.toString()));
    const tokensRequired = newLeads.length;

    if (tokensRequired === 0) {
      return res.status(400).json({ 
        error: 'All requested leads already accessed',
        alreadyAccessed: leads.length
      });
    }

    // Check if user has enough tokens
    if (user.tokens < tokensRequired) {
      return res.status(403).json({ 
        error: 'Insufficient tokens',
        required: tokensRequired,
        available: user.tokens,
        message: `You need ${tokensRequired} tokens to access these leads`
      });
    }

    // Deduct tokens
    user.tokens -= tokensRequired;
    user.tokensUsedToday = (user.tokensUsedToday || 0) + tokensRequired;
    user.tokensUsedTotal = (user.tokensUsedTotal || 0) + tokensRequired;

    // Add to accessed leads history
    if (!user.accessedLeads) {
      user.accessedLeads = [];
    }

    const accessTime = new Date();
    const newAccessEntries = newLeads.map(lead => ({
      leadId: lead._id,
      accessedAt: accessTime
    }));

    user.accessedLeads.unshift(...newAccessEntries);

    // Keep only last 100 accessed leads
    if (user.accessedLeads.length > 100) {
      user.accessedLeads = user.accessedLeads.slice(0, 100);
    }

    // Update leads' accessedBy arrays
    const leadUpdatePromises = newLeads.map(lead => {
      if (!lead.accessedBy.includes(userId)) {
        lead.accessedBy.push(userId);
        return lead.save();
      }
      return Promise.resolve();
    });

    await Promise.all([user.save(), ...leadUpdatePromises]);

    res.json({
      message: `Successfully accessed ${tokensRequired} leads`,
      accessedLeads: newLeads.map(lead => ({
        id: lead._id,
        leadId: lead.leadId,
        name: lead.name,
        email: lead.email,
        linkedin: lead.linkedin,
        lastVerifiedAt: lead.lastVerifiedAt,
        phone: lead.phone,
        facebookLink: lead.facebookLink,
        websiteLink: lead.websiteLink,
        googleMapLink: lead.googleMapLink,
        instagram: lead.instagram,
        addressStreet: lead.addressStreet,
        city: lead.city,
        country: lead.country,
        category: lead.category
      })),
      tokensUsed: tokensRequired,
      tokensRemaining: user.tokens,
      alreadyAccessed: leads.length - newLeads.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/leads/accessed
export const getAccessedLeads = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const user = await User.findById(userId).select('accessedLeads');
    if (!user || !user.accessedLeads) {
      return res.json({
        leads: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false
        }
      });
    }

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedLeads = user.accessedLeads.slice(startIndex, endIndex);

    // Get full lead details
    const leadIds = paginatedLeads.map(item => item.leadId);
    const leads = await Lead.find({ _id: { $in: leadIds } });

    const result = paginatedLeads.map(accessItem => {
      const lead = leads.find(l => l._id.toString() === accessItem.leadId.toString());
      if (!lead) return null;
      
      return {
        id: lead._id,
        leadId: lead.leadId,
        name: lead.name,
        email: lead.email,
        city: lead.city,
        country: lead.country,
        category: lead.category,
        accessedAt: accessItem.accessedAt,
        phone: lead.phone,
        websiteLink: lead.websiteLink,
        linkedin: lead.linkedin,
      };
    }).filter(item => item !== null);

    res.json({
      leads: result,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(user.accessedLeads.length / limit),
        totalItems: user.accessedLeads.length,
        hasNext: endIndex < user.accessedLeads.length,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};