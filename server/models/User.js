import mongoose from 'mongoose';

// A seller. Every product, material and order belongs to one seller.
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    shopName: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
