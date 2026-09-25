import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variant: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

// A customer order. Customer details live on the order itself:
// research showed sellers did not want a separate customer directory.
const orderSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    customerName: { type: String, required: true, trim: true },
    customerContact: { type: String, trim: true },
    platform: { type: String, enum: ['whatsapp', 'instagram', 'telegram', 'tiktok', 'other'] },

    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    price: { type: Number, required: true, min: 0 },
    paymentStatus: { type: String, enum: ['unpaid', 'deposit', 'paid'], default: 'unpaid' },
    depositAmount: { type: Number, min: 0, default: 0 },

    fulfilmentMethod: { type: String, enum: ['self-collect', 'delivery'], required: true },
    deliveryAddress: { type: String, trim: true },
    dueAt: { type: Date, required: true },

    status: { type: String, enum: ['in-progress', 'ready', 'completed'], default: 'in-progress' },

    rawMessage: { type: String }, // the pasted customer message, kept for reference
    materialsDeducted: { type: Boolean, default: false }, // so cancellations can restore stock
  },
  { timestamps: true }
);

export default mongoose.model('Order', orderSchema);
