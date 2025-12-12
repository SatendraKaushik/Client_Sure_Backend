import EmailFeedback from '../../models/EmailFeedback.js';

// GET /api/admin/emails
export const getAllEmailFeedbacks = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, emailType, startDate, endDate, trackingId } = req.query;

    // Handle tracking pixel request
    if (trackingId) {
      const emailFeedback = await EmailFeedback.findOne({ 'recipients.trackingId': trackingId });
      
      if (emailFeedback) {
        const recipient = emailFeedback.recipients.find(r => r.trackingId === trackingId);
        
        if (recipient && recipient.status === 'sent') {
          if (!recipient.opened) {
            recipient.opened = true;
            recipient.openedAt = new Date();
            emailFeedback.openedCount = (emailFeedback.openedCount || 0) + 1;
          }
          recipient.openCount = (recipient.openCount || 0) + 1;
          await emailFeedback.save();
        }
      }

      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private'
      });
      return res.end(pixel);
    }

    const skip = (page - 1) * limit;
    let query = {};

    if (userId) query.userId = userId;
    if (emailType) query.emailType = emailType;
    
    if (startDate || endDate) {
      query.sentAt = {};
      if (startDate) query.sentAt.$gte = new Date(startDate);
      if (endDate) query.sentAt.$lte = new Date(endDate);
    }

    const total = await EmailFeedback.countDocuments(query);
    const emailFeedbacks = await EmailFeedback.find(query)
      .populate('userId', 'name email')
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-recipients -message');

    const enrichedData = emailFeedbacks.map(ef => ({
      ...ef.toObject(),
      openRate: ef.successCount > 0 ? ((ef.openedCount / ef.successCount) * 100).toFixed(2) : 0,
      clickRate: ef.successCount > 0 ? ((ef.clickedCount / ef.successCount) * 100).toFixed(2) : 0
    }));

    res.json({
      emailFeedbacks: enrichedData,
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

// GET /api/admin/emails/:id
export const getEmailFeedbackById = async (req, res) => {
  try {
    const emailFeedback = await EmailFeedback.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('recipients.leadId', 'name email category city country');

    if (!emailFeedback) {
      return res.status(404).json({ error: 'Email feedback not found' });
    }

    const enrichedRecipients = emailFeedback.recipients.map(r => ({
      ...r.toObject(),
      engagementStatus: r.clicked ? 'clicked' : r.opened ? 'opened' : r.status === 'sent' ? 'sent' : 'failed'
    }));

    res.json({
      ...emailFeedback.toObject(),
      recipients: enrichedRecipients
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/emails/stats
export const getEmailStats = async (req, res) => {
  try {
    const { trackingId, url } = req.query;

    // Handle click tracking
    if (trackingId) {
      const emailFeedback = await EmailFeedback.findOne({ 'recipients.trackingId': trackingId });
      
      if (emailFeedback) {
        const recipient = emailFeedback.recipients.find(r => r.trackingId === trackingId);
        
        if (recipient && recipient.status === 'sent') {
          if (!recipient.clicked) {
            recipient.clicked = true;
            recipient.clickedAt = new Date();
            emailFeedback.clickedCount = (emailFeedback.clickedCount || 0) + 1;
          }
          recipient.clickCount = (recipient.clickCount || 0) + 1;
          await emailFeedback.save();
        }
      }

      return res.redirect(url || 'https://clientsure.com');
    }

    const totalEmails = await EmailFeedback.countDocuments();
    const totalSuccess = await EmailFeedback.aggregate([
      { $group: { _id: null, total: { $sum: '$successCount' } } }
    ]);
    const totalFailed = await EmailFeedback.aggregate([
      { $group: { _id: null, total: { $sum: '$failedCount' } } }
    ]);
    const totalOpened = await EmailFeedback.aggregate([
      { $group: { _id: null, total: { $sum: '$openedCount' } } }
    ]);
    const totalClicked = await EmailFeedback.aggregate([
      { $group: { _id: null, total: { $sum: '$clickedCount' } } }
    ]);

    const byType = await EmailFeedback.aggregate([
      { $group: { _id: '$emailType', count: { $sum: 1 } } }
    ]);

    const recentActivity = await EmailFeedback.find()
      .populate('userId', 'name email')
      .sort({ sentAt: -1 })
      .limit(10)
      .select('-recipients -message');

    const sentCount = totalSuccess[0]?.total || 0;
    const openedCount = totalOpened[0]?.total || 0;
    const clickedCount = totalClicked[0]?.total || 0;

    res.json({
      totalEmailCampaigns: totalEmails,
      totalEmailsSent: sentCount,
      totalEmailsFailed: totalFailed[0]?.total || 0,
      totalEmailsOpened: openedCount,
      totalEmailsClicked: clickedCount,
      openRate: sentCount > 0 ? ((openedCount / sentCount) * 100).toFixed(2) : 0,
      clickRate: sentCount > 0 ? ((clickedCount / sentCount) * 100).toFixed(2) : 0,
      byType,
      recentActivity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
