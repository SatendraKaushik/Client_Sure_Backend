import Lead from '../../models/Lead.js';
import xlsx from 'xlsx';

// POST /api/admin/leads/upload
export const uploadLeads = async (req, res) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Excel file is required' });
    }

    // Parse Excel file
    console.log('Parsing Excel file...');
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    // Get all existing leadIds in one query
    const existingLeadIds = new Set(
      (await Lead.find({}, 'leadId').lean()).map(lead => lead.leadId)
    );

    const leadsToInsert = [];
    const errors = [];

    // Process data in batches
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const leadId = row.id || row.leadId;
      
      if (!leadId || !row.name || !row.email) {
        errors.push(`Row ${i + 1}: Missing required fields (id, name, email)`);
        continue;
      }

      if (existingLeadIds.has(leadId)) {
        errors.push(`Row ${i + 1}: Lead with ID ${leadId} already exists`);
        continue;
      }

      leadsToInsert.push({
        leadId,
        name: row.name,
        email: row.email,
        linkedin: row.linkedin,
        lastVerifiedAt: row.lastVerifiedAt ? new Date(row.lastVerifiedAt) : null,
        phone: row.phone,
        facebookLink: row.facebookLink,
        websiteLink: row.websiteLink,
        googleMapLink: row.googleMapLink,
        instagram: row.instagram,
        addressStreet: row.addressStreet,
        city: row.city,
        country: row.country,
        category: row.category
      });
    }

    // Bulk insert in chunks of 1000
    const chunkSize = 1000;
    let totalInserted = 0;
    
    for (let i = 0; i < leadsToInsert.length; i += chunkSize) {
      const chunk = leadsToInsert.slice(i, i + chunkSize);
      try {
        await Lead.insertMany(chunk, { ordered: false });
        totalInserted += chunk.length;
      } catch (error) {
        // Handle duplicate key errors
        if (error.code === 11000) {
          totalInserted += chunk.length - error.writeErrors?.length || 0;
        } else {
          errors.push(`Batch ${Math.floor(i/chunkSize) + 1}: ${error.message}`);
        }
      }
    }

    res.json({
      message: `Successfully uploaded ${totalInserted} leads`,
      uploaded: totalInserted,
      errors: errors.length,
      errorDetails: errors.slice(0, 50) // Limit error details to first 50
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/leads
export const getLeads = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    
    const leads = await Lead.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Lead.countDocuments();
    
    res.json({
      leads,
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

// GET /api/admin/get-lead/:id
export const getLead = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// PUT /api/admin/update-leads/:id
export const updateLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json(lead);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// DELETE /api/admin/leads/:id
export const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};