import mongoose from 'mongoose';

// A raw material, e.g. soy wax or glass jars.
// Materials are tracked either by exact quantity or by a rough level.
const materialSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    unit: { type: String, default: 'pieces' }, // e.g. g, ml, pieces
    trackingMode: { type: String, enum: ['quantity', 'level'], required: true },
    quantity: { type: Number, min: 0 }, // used when trackingMode is 'quantity'
    level: { type: String, enum: ['low', 'medium', 'high'] }, // used when trackingMode is 'level'
    lowStockThreshold: { type: Number, min: 0 }, // optional; can be set later

    // TODO (team decision): how do level-tracked materials interact with
    // auto-deduction? Write the rule down, then enforce it in services/inventory.js.
  },
  { timestamps: true }
);

export default mongoose.model('Material', materialSchema);
