import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  providerOrderId: {
    type: String,
    required: true,
    unique: true // Payment gateway order ID
  },
  clientOrderId: {
    type: String,
    required: true
    // Removed unique constraint as it's a string representation
  },
  userEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  userName: {
    type: String,
    required: true,
    trim: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  referralCode: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true
});

export default mongoose.model('Order', orderSchema);