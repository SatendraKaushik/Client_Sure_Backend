import { Lead, User } from "../../models/index.js";
import EmailFeedback from '../../models/EmailFeedback.js';
import * as XLSX from 'xlsx';
import { calculateEffectiveTokens, deductTokensWithPriority, cleanExpiredTokens } from '../../utils/tokenUtils.js';
import { createTransporter, sendEmailWithRetry } from '../../utils/emailUtils.js';

// GET /api/auth/leads
export const getLeads = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, category, city, country, startDate, endDate } = req.query;
    const skip = (page - 1) * limit;

    // Get user's accessed leads first
    const user = await User.findById(userId).select('accessedLeads');
    const accessedLeadIds = user?.accessedLeads?.map(item => item.leadId.toString()) || [];

    // Build query - only active leads that user hasn't accessed
    let query = { 
      isActive: true,
      _id: { $nin: accessedLeadIds } // Exclude accessed leads
    };

    // Apply filters
    if (category) {
      query.category = category;
    }
    if (city) {
      query.city = city;
    }
    if (country) {
      query.country = country;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const leads = await Lead.find(query)
      .sort({ uploadSequence: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(query);

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
        isAccessedByUser: false // All leads here are locked
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

    // Clean expired tokens first
    await cleanExpiredTokens(user);

    // Check if user has enough effective tokens (daily + prize)
    const effectiveTokens = calculateEffectiveTokens(user);
    if (effectiveTokens < 1) {
      return res.status(403).json({ 
        error: 'Insufficient tokens',
        message: 'You need 1 token to access this lead',
        availableTokens: effectiveTokens
      });
    }

    // Deduct 1 token using priority system (daily first, then prize)
    const deductionResult = await deductTokensWithPriority(user._id, 1);
    if (!deductionResult.success) {
      return res.status(500).json({ 
        error: 'Token deduction failed',
        message: 'Error processing token deduction'
      });
    }

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
      tokensRemaining: deductionResult.totalRemaining,
      tokenBreakdown: {
        dailyTokens: deductionResult.remainingDaily,
        prizeTokens: deductionResult.remainingTemporary
      }
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

    // Limit to maximum 100 leads per request
    if (leadIds.length > 100) {
      return res.status(400).json({ 
        error: 'Maximum 100 leads allowed per request',
        requested: leadIds.length,
        maximum: 100
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

    // Clean expired tokens first
    await cleanExpiredTokens(user);

    // Check if user has enough effective tokens (daily + prize)
    const effectiveTokens = calculateEffectiveTokens(user);
    if (effectiveTokens < tokensRequired) {
      return res.status(403).json({ 
        error: 'Insufficient tokens',
        required: tokensRequired,
        available: effectiveTokens,
        message: `You need ${tokensRequired} tokens to access these leads`
      });
    }

    // Deduct tokens using priority system (daily first, then prize)
    const deductionResult = await deductTokensWithPriority(user._id, tokensRequired);
    if (!deductionResult.success) {
      return res.status(500).json({ 
        error: 'Token deduction failed',
        message: 'Error processing token deduction'
      });
    }

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

    // Batch update leads' accessedBy arrays for better performance
    const leadsToUpdate = newLeads.filter(lead => !lead.accessedBy.includes(userId));
    
    if (leadsToUpdate.length > 0) {
      await Lead.bulkWrite(
        leadsToUpdate.map(lead => ({
          updateOne: {
            filter: { _id: lead._id },
            update: { $addToSet: { accessedBy: userId } }
          }
        }))
      );
    }

    await user.save();

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
      tokensRemaining: deductionResult.totalRemaining,
      tokenBreakdown: {
        dailyTokens: deductionResult.remainingDaily,
        prizeTokens: deductionResult.remainingTemporary
      },
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
        facebookLink: lead.facebookLink,
        googleMapLink: lead.googleMapLink,
        instagram: lead.instagram,
        addressStreet: lead.addressStreet,
        lastVerifiedAt: lead.lastVerifiedAt,
        createdAt: lead.createdAt,
        updatedAt: lead.updatedAt,
        isAccessedByUser: true
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

// POST /api/auth/leads/export
export const exportLeadData = async (req, res) => {
  try {
    const { leadId } = req.body;
    const userId = req.user.userId;

    const lead = await Lead.findById(leadId);
    if (!lead || !lead.isActive) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const user = await User.findById(userId).select('accessedLeads');
    const accessedLead = user?.accessedLeads?.find(item => 
      item.leadId.toString() === leadId
    );

    if (!accessedLead) {
      return res.status(403).json({ 
        error: 'Lead not accessed',
        message: 'You need to access this lead first to export data'
      });
    }

    const leadData = {
      'Lead ID': lead.leadId,
      'Name': lead.name,
      'Email': lead.email,
      'Phone': lead.phone || 'N/A',
      'Category': lead.category || 'N/A',
      'City': lead.city || 'N/A',
      'Country': lead.country || 'N/A',
      'Address': lead.addressStreet || 'N/A',
      'Website': lead.websiteLink || 'N/A',
      'LinkedIn': lead.linkedin || 'N/A',
      'Facebook': lead.facebookLink || 'N/A',
      'Instagram': lead.instagram || 'N/A',
      'Google Maps': lead.googleMapLink || 'N/A',
      'Last Verified': lead.lastVerifiedAt ? new Date(lead.lastVerifiedAt).toLocaleDateString() : 'N/A',
      'Accessed Date': new Date(accessedLead.accessedAt).toLocaleDateString()
    };

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([leadData]);
    XLSX.utils.book_append_sheet(wb, ws, 'Lead Data');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `lead_${lead.leadId}_${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /api/auth/leads/bulk-export
export const bulkExportLeads = async (req, res) => {
  try {
    const { leadIds } = req.body;
    const userId = req.user.userId;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'Lead IDs array is required' });
    }

    const user = await User.findById(userId).select('accessedLeads');
    const accessedLeadIds = user?.accessedLeads?.map(item => item.leadId.toString()) || [];
    
    const validLeadIds = leadIds.filter(id => accessedLeadIds.includes(id));
    
    if (validLeadIds.length === 0) {
      return res.status(403).json({ 
        error: 'No accessible leads found',
        message: 'You need to access leads first to export data'
      });
    }

    const leads = await Lead.find({ 
      _id: { $in: validLeadIds }, 
      isActive: true 
    });

    const leadsData = leads.map(lead => {
      const accessedLead = user.accessedLeads.find(item => 
        item.leadId.toString() === lead._id.toString()
      );
      
      return {
        'Lead ID': lead.leadId,
        'Name': lead.name,
        'Email': lead.email,
        'Phone': lead.phone || 'N/A',
        'Category': lead.category || 'N/A',
        'City': lead.city || 'N/A',
        'Country': lead.country || 'N/A',
        'Address': lead.addressStreet || 'N/A',
        'Website': lead.websiteLink || 'N/A',
        'LinkedIn': lead.linkedin || 'N/A',
        'Facebook': lead.facebookLink || 'N/A',
        'Instagram': lead.instagram || 'N/A',
        'Google Maps': lead.googleMapLink || 'N/A',
        'Last Verified': lead.lastVerifiedAt ? new Date(lead.lastVerifiedAt).toLocaleDateString() : 'N/A',
        'Accessed Date': accessedLead ? new Date(accessedLead.accessedAt).toLocaleDateString() : 'N/A'
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(leadsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Leads Data');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `leads_export_${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// POST /api/auth/leads/send-email
export const sendBulkEmail = async (req, res) => {
  try {
    const { subject, message, type, category, city, country, leadIds } = req.body;
    const userId = req.user.userId;

    if (!subject || !message || !type) {
      return res.status(400).json({ error: 'Subject, message, and type are required' });
    }

    const user = await User.findById(userId).select('accessedLeads name email');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const accessedLeadIds = user.accessedLeads?.map(item => item.leadId.toString()) || [];
    
    if (accessedLeadIds.length === 0) {
      return res.status(400).json({ error: 'No accessed leads found' });
    }

    let query = { _id: { $in: accessedLeadIds }, isActive: true };
    let filterCriteria = {};

    if (type === 'category' && category) {
      query.category = category;
      filterCriteria.category = category;
    } else if (type === 'city' && city) {
      query.city = city;
      filterCriteria.city = city;
    } else if (type === 'country' && country) {
      query.country = country;
      filterCriteria.country = country;
    } else if (type === 'selected' && leadIds && leadIds.length > 0) {
      query._id = { $in: leadIds.filter(id => accessedLeadIds.includes(id)) };
    }

    const leads = await Lead.find(query);

    if (leads.length === 0) {
      return res.status(400).json({ error: 'No leads found matching criteria' });
    }

    const transporter = createTransporter();
    if (!transporter) {
      return res.status(500).json({ error: 'Email service not available' });
    }

    const recipients = [];
    let successCount = 0;
    let failedCount = 0;

    for (const lead of leads) {
      try {
        const trackingId = `${userId}_${lead._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const mailOptions = {
          from: `"${user.name}" <${process.env.SMTP_USER}>`,
          to: lead.email,
          subject: subject,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <h2 style="color: #007cba;">HI ${lead.name},</h2>
                <div style="margin: 20px 0;">
                  ${message.replace(/\n/g, '<br>')}
                </div>
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 12px;">
                  <p>This email was sent by ${user.name} via ClientSure.</p>
                  <p>© ${new Date().getFullYear()} ClientSure. All rights reserved.</p>
                </div>
              </div>
              <img src="${process.env.BASE_URL || 'http://localhost:5000'}/api/admin/emails?trackingId=${trackingId}" width="1" height="1" style="display:none" />
            </body>
            </html>
          `
        };

        await sendEmailWithRetry(transporter, mailOptions, 2);
        recipients.push({
          leadId: lead._id,
          email: lead.email,
          name: lead.name,
          status: 'sent',
          trackingId
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to send email to ${lead.email}:`, error.message);
        recipients.push({
          leadId: lead._id,
          email: lead.email,
          name: lead.name,
          status: 'failed',
          errorMessage: error.message
        });
        failedCount++;
      }
    }

    const emailFeedback = new EmailFeedback({
      userId,
      userName: user.name,
      userEmail: user.email,
      subject,
      message,
      emailType: type,
      filterCriteria,
      recipients,
      totalRecipients: leads.length,
      successCount,
      failedCount
    });

    await emailFeedback.save();

    res.json({
      message: `Emails sent successfully to ${successCount} out of ${leads.length} leads`,
      totalRecipients: leads.length,
      successCount,
      failedCount,
      emailFeedbackId: emailFeedback._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/leads/email-feedback
export const getEmailFeedback = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;
    const total = await EmailFeedback.countDocuments({ userId });

    const emailFeedbacks = await EmailFeedback.find({ userId })
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-recipients');

    res.json({
      emailFeedbacks,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: skip + emailFeedbacks.length < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



// GET /api/auth/leads/filter-options
export const getFilterOptions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId).select('accessedLeads');
    const accessedLeadIds = user?.accessedLeads?.map(item => item.leadId.toString()) || [];
    
    const query = { isActive: true, _id: { $nin: accessedLeadIds } };
    const categories = await Lead.distinct('category', query);
    const cities = await Lead.distinct('city', query);
    const countries = await Lead.distinct('country', query);

    res.json({
      categories: categories.filter(Boolean).sort(),
      cities: cities.filter(Boolean).sort(),
      countries: countries.filter(Boolean).sort()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
