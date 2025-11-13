import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: false,
    trim: true
  },
  avatar: {
    type: String,
    required: false
  },
  passwordHash: {
    type: String,
    required: false // Will be set after email verification
  },
  tokens: {
    type: Number,
    default: 0
  },
  tokensUsedTotal: {
    type: Number,
    default: 0
  },
  tokensUsedToday: {
    type: Number,
    default: 0
  },
  monthlyTokensTotal: {
    type: Number,
    default: 0
  },
  monthlyTokensUsed: {
    type: Number,
    default: 0
  },
  monthlyTokensRemaining: {
    type: Number,
    default: 0
  },
  subscription: {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: false
    },
    startDate: {
      type: Date,
      required: false
    },
    endDate: {
      type: Date,
      required: false
    },
    dailyTokens: {
      type: Number,
      default: 100
    },
    monthlyAllocation: {
      type: Number,
      default: 0
    },
    currentMonth: {
      type: Number,
      default: () => new Date().getMonth()
    },
    currentYear: {
      type: Number,
      default: () => new Date().getFullYear()
    },
    lastRefreshedAt: {
      type: Date,
      default: Date.now
    }
  },
  resetTokenHash: {
    type: String,
    required: false
  },
  resetTokenExpires: {
    type: Date,
    required: false
  },
  accessedResources: [{
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: true
    },
    accessedAt: {
      type: Date,
      default: Date.now
    }
  }],
  accessedLeads: [{
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead'
    },
    accessedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

export default mongoose.model('User', userSchema);