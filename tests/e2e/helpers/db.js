import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export async function deleteUserByUsername(username) {
  if (!username.startsWith('e2e_')) {
    throw new Error(`Refusing to delete non-test user "${username}"`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await mongoose.connection.collection('users').deleteOne({ username });
  } finally {
    await mongoose.disconnect();
  }
}

// Deletes a test seller AND everything that belongs to them:
// their orders, products, materials and order-number counters, then the user.
// Like deleteUserByUsername, it only works on usernames starting with "e2e_".
export async function deleteUserAndData(username) {
  if (!username.startsWith('e2e_')) {
    throw new Error(`Refusing to delete non-test user "${username}"`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const db = mongoose.connection;
    const user = await db.collection('users').findOne({ username });
    if (!user) return; // nothing to clean up

    // Everything this seller owns has seller: <their user id>
    const mine = { seller: user._id };
    await db.collection('orders').deleteMany(mine);
    await db.collection('products').deleteMany(mine);
    await db.collection('materials').deleteMany(mine);
    await db.collection('counters').deleteMany(mine);

    await db.collection('users').deleteOne({ _id: user._id });
  } finally {
    await mongoose.disconnect();
  }
}