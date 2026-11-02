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