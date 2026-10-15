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

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// lets the service signal an HTTP status to the route
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function toPublic(user) {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.passwordHash;
  return obj;
}

export async function updateShopName(userId, shopName) {
  const value = typeof shopName === 'string' ? shopName.trim() : '';
  if (!value) throw new HttpError(400, 'Shop name is required.');
  if (value.length > 60) throw new HttpError(400, 'Shop name must be 60 characters or fewer.');

  const user = await User.findByIdAndUpdate(
    userId,
    { shopName: value },
    { new: true, runValidators: true }
  );
  if (!user) throw new HttpError(401, 'User not found');
  return toPublic(user);
}

export async function updateEmail(userId, email) {
  const value = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(value)) throw new HttpError(400, 'Enter a valid email address.');

  const taken = await User.findOne({ email: value, _id: { $ne: userId } });
  if (taken) throw new HttpError(409, 'That email is already in use.');

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { email: value },
      { new: true, runValidators: true }
    );
    if (!user) throw new HttpError(401, 'User not found');
    return toPublic(user);
  } catch (err) {
    // two requests racing past the check above: the unique index catches it
    if (err.code === 11000) throw new HttpError(409, 'That email is already in use.');
    throw err;
  }
}

export async function updatePassword(userId, currentPassword, newPassword) {
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    throw new HttpError(400, 'Current and new password are required.');
  }
  if (newPassword.length < 8) {
    throw new HttpError(400, 'New password must be at least 8 characters.');
  }
  if (newPassword === currentPassword) {
    throw new HttpError(400, 'New password must be different from the current one.');
  }

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new HttpError(401, 'User not found');

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  // 400, not 401: a 401 would make the frontend think the session expired
  if (!ok) throw new HttpError(400, 'Current password is incorrect.');

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
}

import Product from '../models/Product.js';
import Material from '../models/Material.js';
import Order from '../models/Order.js';

export async function deleteProfile(userId, password) {
  if (typeof password !== 'string' || !password) {
    throw new HttpError(400, 'Password is required to delete your account.');
  }

  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw new HttpError(401, 'User not found');

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new HttpError(400, 'Password is incorrect.');

  // remove everything the seller owns (adjust the field name, e.g. seller / user / owner)
  await Promise.all([
    Product.deleteMany({ seller: userId }),
    Material.deleteMany({ seller: userId }),
    Order.deleteMany({ seller: userId }),
  ]);

  await User.deleteOne({ _id: userId });
}