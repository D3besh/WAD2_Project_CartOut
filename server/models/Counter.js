import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true }, // "261028"
  seq: { type: Number, default: 0 },
});
counterSchema.index({ seller: 1, day: 1 }, { unique: true });

export default mongoose.model('Counter', counterSchema);