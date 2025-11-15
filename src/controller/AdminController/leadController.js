import Lead from '../../models/Lead.js';
import xlsx from 'xlsx';

// POST /api/admin/leads/upload
export const uploadLeads = async (req, res) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Excel file is required' });
    }

    // Parse Excel file with proper row order preservation
    console.log('Parsing Excel file...');
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get range to preserve row order
    const range = xlsx.utils.decode_range(worksheet['!ref']);
    const data = [];
    
    // Extract data row by row to maintain sequence
    for (let rowNum = range.s.r + 1; rowNum <= range.e.r; rowNum++) {
      const row = {};
      for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
        const cellAddress = xlsx.utils.encode_cell({ r: rowNum, c: colNum });
        const headerAddress = xlsx.utils.encode_cell({ r: range.s.r, c: colNum });
        const header = worksheet[headerAddress]?.v;
        const cellValue = worksheet[cellAddress]?.v || '';
        if (header) {
          row[header] = cellValue;
        }
      }
      if (Object.keys(row).length > 0) {
        data.push(row);
      }
    }

    console.log('Total rows parsed:', data.length);
    console.log('Sample row:', data[0]); // Debug log

    // Get all existing leadIds and find max sequence
    const existingLeads = await Lead.find({}, 'leadId uploadSequence').lean();
    const existingLeadIds = new Set(existingLeads.map(lead => lead.leadId));
    const maxSequence = existingLeads.length > 0 ? Math.max(...existingLeads.map(lead => lead.uploadSequence || 0)) : 0;

    const leadsToInsert = [];
    const errors = [];
    const skipped = [];
    let currentSequence = maxSequence + 1;

    // Process data in original Excel order
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Normalize column names (handle case variations)
      const normalizedRow = {};
      Object.keys(row).forEach(key => {
        const normalizedKey = key.toLowerCase().trim();
        normalizedRow[normalizedKey] = typeof row[key] === 'string' ? row[key].trim() : row[key];
      });
      
      // Extract leadId from multiple possible column names
      const leadId = normalizedRow.id || normalizedRow.leadid || normalizedRow['lead id'] || normalizedRow.leadId;
      const name = normalizedRow.name;
      const email = normalizedRow.email;
      
      // Skip empty rows
      if (!leadId && !name && !email) {
        continue;
      }
      
      // Validate required fields
      if (!leadId) {
        errors.push(`Row ${i + 2}: Missing Lead ID (column: id or leadId)`);
        continue;
      }
      
      if (!name) {
        errors.push(`Row ${i + 2}: Missing Name`);
        continue;
      }
      
      if (!email) {
        errors.push(`Row ${i + 2}: Missing Email`);
        continue;
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        errors.push(`Row ${i + 2}: Invalid email format: ${email}`);
        continue;
      }

      // Check for duplicates
      if (existingLeadIds.has(leadId)) {
        skipped.push(`Row ${i + 2}: Lead ID ${leadId} already exists`);
        continue;
      }

      // Parse date if provided
      let lastVerifiedAt = null;
      if (normalizedRow.lastverifiedat || normalizedRow['last verified at']) {
        const dateStr = normalizedRow.lastverifiedat || normalizedRow['last verified at'];
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          lastVerifiedAt = parsedDate;
        }
      }

      leadsToInsert.push({
        leadId: leadId.toString(),
        name: name.toString(),
        email: email.toLowerCase(),
        phone: normalizedRow.phone || null,
        category: normalizedRow.category || null,
        city: normalizedRow.city || null,
        country: normalizedRow.country || null,
        addressStreet: normalizedRow.addressstreet || normalizedRow['address street'] || null,
        linkedin: normalizedRow.linkedin || null,
        facebookLink: normalizedRow.facebooklink || normalizedRow['facebook link'] || null,
        websiteLink: normalizedRow.websitelink || normalizedRow['website link'] || null,
        googleMapLink: normalizedRow.googlemaplink || normalizedRow['google map link'] || null,
        instagram: normalizedRow.instagram || null,
        lastVerifiedAt,
        uploadSequence: currentSequence++
      });
    }

    // Insert leads in sequence order (ordered: true to maintain sequence)
    let totalInserted = 0;
    
    if (leadsToInsert.length > 0) {
      try {
        // Use ordered insertion to maintain sequence
        const result = await Lead.insertMany(leadsToInsert, { ordered: true });
        totalInserted = result.length;
      } catch (error) {
        // Handle errors while maintaining sequence
        if (error.code === 11000) {
          // Handle duplicate key errors
          const insertedCount = error.insertedDocs?.length || 0;
          totalInserted = insertedCount;
          
          // Try inserting remaining documents one by one to maintain sequence
          for (let i = insertedCount; i < leadsToInsert.length; i++) {
            try {
              await Lead.create(leadsToInsert[i]);
              totalInserted++;
            } catch (singleError) {
              if (singleError.code === 11000) {
                errors.push(`Duplicate leadId: ${leadsToInsert[i].leadId}`);
              } else {
                errors.push(`Error inserting ${leadsToInsert[i].leadId}: ${singleError.message}`);
              }
            }
          }
        } else {
          errors.push(`Bulk insert error: ${error.message}`);
        }
      }
    }

    res.json({
      message: `Upload completed: ${totalInserted} leads inserted`,
      uploaded: totalInserted,
      skipped: skipped.length,
      errors: errors.length,
      totalProcessed: data.length,
      details: {
        skippedDetails: skipped.slice(0, 10),
        errorDetails: errors.slice(0, 10)
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/admin/leads
export const getLeads = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    
    const leads = await Lead.find()
      .sort({ uploadSequence: -1, createdAt: -1 })
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