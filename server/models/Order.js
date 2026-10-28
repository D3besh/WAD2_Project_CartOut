import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // Which variant was ordered. variantId points at product.variants[]._id;
    // variant and unitPrice are copies taken when the order is saved, so the
    // order still reads correctly if the seller later renames or reprices it.
    // variantId null = "Regular" (the plain product, main recipe only).
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    variant: { type: String, trim: true },
    unitPrice: { type: Number, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

import Counter from './Counter.js';

const TZ = process.env.SHOP_TZ ?? 'Asia/Singapore'; // timezone used for the date part

function dayStamp(date) {
  // en-CA gives "26-10-28"; strip the dashes -> "261028"
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: '2-digit', month: '2-digit', day: '2-digit',
  }).format(date).replaceAll('-', '');
}

export async function nextOrderNo(sellerId, date = new Date()) {
  const day = dayStamp(date);
  const c = await Counter.findOneAndUpdate(
    { seller: sellerId, day },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `ORD-${day}-${String(c.seq).padStart(2, '0')}`;
}

// A customer order. Customer details live on the order itself:
// research showed sellers did not want a separate customer directory.
const orderSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderNo: { type: String, required: true, trim: true },

    customerName: { type: String, required: true, trim: true },
    customerContact: { type: String, trim: true },
    customerEmail: { type: String, trim: true, lowercase: true },
    platform: { type: String, enum: ['whatsapp', 'instagram', 'telegram', 'tiktok', 'other'] },

    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    price: { type: Number, required: true, min: 0 },
    paymentStatus: { type: String, enum: ['unpaid', 'deposit', 'paid'], default: 'unpaid' },
    depositAmount: { type: Number, min: 0, default: 0 },

    fulfilmentMethod: { type: String, enum: ['self-collect', 'delivery'], required: true },
    deliveryAddress: { type: String, trim: true },
    dueAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ['in-progress', 'ready', 'completed', 'cancelled'],
      default: 'in-progress',
    },

    rawMessage: { type: String }, // the pasted customer message, kept for reference
    materialsDeducted: { type: Boolean, default: false }, // so cancellations can restore stock

    // ---- Disputes: cancellations and refunds ----
    cancelReason: { type: String, trim: true },
    cancelledAt: { type: Date },
    materialsWasted: { type: Boolean, default: false }, // cancelled after materials were used
    forfeitedAmount: { type: Number, min: 0, default: 0 }, // deposit kept after a cancellation
    refundAmount: { type: Number, min: 0, default: 0 },
    refundReason: { type: String, trim: true },
    refundedAt: { type: Date },
  },
  { timestamps: true }
);

// unique per seller, not globally
orderSchema.index({ seller: 1, orderNo: 1 }, { unique: true });

// assign automatically on first save
orderSchema.pre('validate', async function () {
  if (this.isNew && !this.orderNo) {
    this.orderNo = await nextOrderNo(this.seller, this.createdAt ?? new Date());
  }
});


export default mongoose.model('Order', orderSchema);