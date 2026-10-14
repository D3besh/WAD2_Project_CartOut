// Adds 8 weeks of PAST orders so the forecast has history to learn from.
// Run it AFTER your normal seed (seed.js wipes everything, including these):
//   cd server
//   node seed/seedHistory.js
//
// Pattern (per product, per day):  Mon–Thu 1 · Fri 2 · Sat 4 · Sun 2
// → Saturday is the spike day.
//
// These orders are "completed" and marked materialsDeducted: true,
// so they DON'T change your current stock.
// Running it again first removes the old history orders (customerName "Demo history").

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

// Load .env the same way seed.js does: it's in the folder holding client and server
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

// The seller to add history for (from seed.js: amy@example.com or ben@example.com)
const SELLER_EMAIL = 'ben@example.com';

// How many of each product sold on Sun, Mon, Tue, Wed, Thu, Fri, Sat
const PER_WEEKDAY = [2, 1, 1, 1, 1, 2, 4];

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set (check the .env file in the project folder)');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  let seller = await User.findOne({ email: SELLER_EMAIL });
  if (!seller) {
    throw new Error('No user with email ' + SELLER_EMAIL + '. Change SELLER_EMAIL at the top of this file.');
  }

  let products = await Product.find({ seller: seller._id, archived: { $ne: true } });
  if (products.length === 0) {
    throw new Error(SELLER_EMAIL + ' has no products yet, so there is nothing to make orders for.');
  }

  // Remove history from a previous run
  await Order.deleteMany({ seller: seller._id, customerName: 'Demo history' });

  let orders = [];
  for (let daysAgo = 1; daysAgo <= 56; daysAgo++) {
    let due = new Date();
    due.setDate(due.getDate() - daysAgo);
    due.setHours(14, 0, 0, 0); // 2 pm

    let howMany = PER_WEEKDAY[due.getDay()];
    let items = [];
    let price = 0;
    for (let p of products) {
      // Use the product's first variant if it has any
      let variant = p.variants.length > 0 ? p.variants[0] : null;
      items.push({ product: p._id, variant: variant ? variant.name : null, quantity: howMany });
      let unitPrice = variant && variant.price != null ? variant.price : p.price;
      price = price + unitPrice * howMany;
    }

    orders.push({
      seller: seller._id,
      customerName: 'Demo history',
      platform: 'whatsapp',
      items: items,
      price: price,
      paymentStatus: 'paid',
      depositAmount: price,
      fulfilmentMethod: 'self-collect',
      dueAt: due,
      status: 'completed',
      materialsDeducted: true,
    });
  }

  await Order.insertMany(orders);
  console.log('Added ' + orders.length + ' past orders for ' + products.length + ' products (' + SELLER_EMAIL + ').');
}

run()
  .catch((err) => {
    console.error('Seeding history failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
