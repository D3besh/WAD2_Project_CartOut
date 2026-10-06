// services/userService.js
import bcrypt from 'bcrypt';
import User from '../models/User.js';

export const registerUser = async ({ username, email, password, shopName }) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      shopName,
      passwordHash
    });

    const { passwordHash: _, ...safeUser } = user.toObject();

    return safeUser;

  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];

      const err = new Error(`${field} already taken`);
      err.status = 409;
      throw err;
    }

    throw error;
  }
};

export const loginUser = async (username, password) => {
  const user = await User.findOne({ username }).select('+passwordHash');

  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);

  if (!ok) return null;
  const { passwordHash: _, ...safeUser } = user.toObject();

  return safeUser;
};