import mongoose from 'mongoose';

// A raw material, e.g. matcha powder or bottles.
// Materials are tracked either by exact quantity or by a rough level.
//
// Team rule for level-tracked materials and auto-deduction:
//   Level-tracked materials are NEVER auto-deducted (there's no number to subtract).
//   The seller updates the level by hand ("Mark as restocked" sets it to High).
//   The feasibility check only WARNS when a level material is Low; it never blocks an order.
//   services/inventory.js must only deduct/restore materials with trackingMode 'quantity'.
const materialSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 60 },
    unit: { type: String, enum: ['g', 'ml', 'pieces'], default: 'pieces' },
    trackingMode: { type: String, enum: ['quantity', 'level'], required: true },

    // Each field is only required in its own mode.
    // (Normal functions, not arrow functions, so `this` is the material.)
    quantity: {
      type: Number,
      min: [0, 'Quantity cannot be negative'],
      required: [function () { return this.trackingMode === 'quantity'; }, 'Enter how much you have'],
    },
    level: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: [function () { return this.trackingMode === 'level'; }, 'Choose a level'],
    },

    lowStockThreshold: { type: Number, min: [0, 'Threshold cannot be negative'], default: null }, // optional
  },
  { timestamps: true, toJSON: { virtuals: true } } // virtuals → isLow and id appear in JSON
);

// A seller can't have two materials with the same name.
materialSchema.index({ seller: 1, name: 1 }, { unique: true });

// Calculated every time it's read, so it can never be out of date.
materialSchema.virtual('isLow').get(function () {
  if (this.trackingMode === 'level') return this.level === 'low';
  return this.lowStockThreshold != null && this.quantity <= this.lowStockThreshold;
});

export default mongoose.model('Material', materialSchema);
