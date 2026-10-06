import mongoose from 'mongoose';

// A seller. Every product, material and order belongs to one seller.
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
    passwordHash: { type: String, required: true, select: false },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true,  match: [/^\S+@\S+\.\S+$/, 'Invalid email format'] },
    shopName: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);

