// run using node seed.js or npm run seed

import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// seed.js is in server/seed, so two levels up is the folder holding client and server
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

import User from '../models/User.js';
import Material from '../models/Material.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

const daysFromNow = (d) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing data (children first)
  await Promise.all([
    Order.deleteMany({}),
    Product.deleteMany({}),
    Material.deleteMany({}),
    User.deleteMany({}),
  ]);
  console.log('Cleared existing data');

  // ---------- Users ----------
  const passwordHash = await bcrypt.hash('password123', 10);
  const [amy, ben] = await User.create([
    { username: 'amycandles', email: 'amy@example.com', passwordHash, shopName: 'Amy’s Candle Co.' },
    { username: 'benbakes', email: 'ben@example.com', passwordHash, shopName: 'Ben’s Bakes' },
  ]);

  // ---------- Materials ----------
  const [wax, fragrance, wicks, jars, lavender, flour, butter, sugar] = await Material.create([
    // Amy: quantity-tracked
    { seller: amy._id, name: 'Soy wax', unit: 'g', trackingMode: 'quantity', quantity: 5000, lowStockThreshold: 1000 },
    { seller: amy._id, name: 'Fragrance oil', unit: 'ml', trackingMode: 'quantity', quantity: 300, lowStockThreshold: 50 },
    { seller: amy._id, name: 'Cotton wicks', unit: 'pieces', trackingMode: 'quantity', quantity: 80, lowStockThreshold: 20 },
    { seller: amy._id, name: 'Glass jars', unit: 'pieces', trackingMode: 'quantity', quantity: 60, lowStockThreshold: 15 },
    // Amy: level-tracked
    { seller: amy._id, name: 'Dried lavender', unit: 'g', trackingMode: 'level', level: 'medium' },
    // Ben
    { seller: ben._id, name: 'Flour', unit: 'g', trackingMode: 'quantity', quantity: 10000, lowStockThreshold: 2000 },
    { seller: ben._id, name: 'Butter', unit: 'g', trackingMode: 'quantity', quantity: 3000, lowStockThreshold: 500 },
    { seller: ben._id, name: 'Sugar', unit: 'g', trackingMode: 'level', level: 'high' },
  ]);

  // ---------- Products ----------
  const [lavenderCandle, vanillaCandle, cookies, brownies] = await Product.create([
    {
      seller: amy._id,
      name: 'Lavender candle',
      price: 18,
      makingTimeMins: 45,
      recipe: [
        { material: wax._id, amountPerUnit: 200 },
        { material: fragrance._id, amountPerUnit: 15 },
        { material: wicks._id, amountPerUnit: 1 },
        { material: jars._id, amountPerUnit: 1 },
      ],
      variants: [
        { name: 'Small (100g)', price: 12, extras: [] },
        { name: 'With dried lavender topping', price: 21, extras: [{ material: lavender._id, amountPerUnit: 5 }] },
      ],
    },
    {
      seller: amy._id,
      name: 'Vanilla candle',
      price: 18,
      makingTimeMins: 45,
      recipe: [
        { material: wax._id, amountPerUnit: 200 },
        { material: fragrance._id, amountPerUnit: 15 },
        { material: wicks._id, amountPerUnit: 1 },
        { material: jars._id, amountPerUnit: 1 },
      ],
      variants: [],
    },
    {
      seller: ben._id,
      name: 'Chocolate chip cookies (box of 12)',
      price: 15,
      makingTimeMins: 60,
      recipe: [
        { material: flour._id, amountPerUnit: 300 },
        { material: butter._id, amountPerUnit: 150 },
        { material: sugar._id, amountPerUnit: 120 },
      ],
      variants: [{ name: 'Gluten-free', price: 18, extras: [] }],
    },
    {
      seller: ben._id,
      name: 'Fudge brownies (box of 9)',
      price: 20,
      makingTimeMins: 50,
      recipe: [
        { material: flour._id, amountPerUnit: 200 },
        { material: butter._id, amountPerUnit: 200 },
        { material: sugar._id, amountPerUnit: 250 },
      ],
      variants: [],
    },
  ]);

  // ---------- Orders ----------
  await Order.create([
    {
      seller: amy._id,
      customerName: 'Sarah Tan',
      customerContact: '+65 9123 4567',
      platform: 'whatsapp',
      items: [{ product: lavenderCandle._id, quantity: 2 }],
      price: 36,
      paymentStatus: 'paid',
      depositAmount: 36,
      fulfilmentMethod: 'self-collect',
      dueAt: daysFromNow(-3),
      status: 'completed',
      rawMessage: 'Hi! Can I get 2 lavender candles? I can collect on Saturday.',
      materialsDeducted: true,
    },
    {
      seller: amy._id,
      customerName: 'Marcus Lim',
      customerContact: '@marcus.lim',
      platform: 'instagram',
      items: [
        { product: lavenderCandle._id, variant: 'With dried lavender topping', quantity: 1 },
        { product: vanillaCandle._id, quantity: 2 },
      ],
      price: 57,
      paymentStatus: 'deposit',
      depositAmount: 20,
      fulfilmentMethod: 'delivery',
      deliveryAddress: '12 Clementi Ave 3, #05-21, Singapore 120012',
      dueAt: daysFromNow(2),
      status: 'in-progress',
      rawMessage: 'Hello, 1 lavender (with topping) and 2 vanilla please, deliver to Clementi.',
      materialsDeducted: true,
    },
    {
      seller: amy._id,
      customerName: 'Priya Nair',
      customerContact: '+65 8222 1111',
      platform: 'telegram',
      items: [{ product: vanillaCandle._id, quantity: 4 }],
      price: 72,
      paymentStatus: 'unpaid',
      fulfilmentMethod: 'self-collect',
      dueAt: daysFromNow(5),
      status: 'in-progress',
      rawMessage: 'Need 4 vanilla candles as gifts, collecting next week.',
      materialsDeducted: false, // fresh order, stock not yet deducted
    },
    {
      seller: ben._id,
      customerName: 'Jenny Ong',
      customerContact: '+65 9000 1234',
      platform: 'whatsapp',
      items: [
        { product: cookies._id, quantity: 2 },
        { product: brownies._id, quantity: 1 },
      ],
      price: 50,
      paymentStatus: 'paid',
      depositAmount: 50,
      fulfilmentMethod: 'delivery',
      deliveryAddress: '88 Tampines St 82, #10-02, Singapore 520088',
      dueAt: daysFromNow(1),
      status: 'ready',
      materialsDeducted: true,
    },
    {
      seller: ben._id,
      customerName: 'Daniel Koh',
      platform: 'tiktok',
      items: [{ product: cookies._id, variant: 'Gluten-free', quantity: 1 }],
      price: 18,
      paymentStatus: 'deposit',
      depositAmount: 5,
      fulfilmentMethod: 'self-collect',
      dueAt: daysFromNow(4),
      status: 'in-progress',
      materialsDeducted: true,
    },
  ]);

  console.log('Seeded: 2 users, 8 materials, 4 products, 5 orders');
  console.log('Login with amycandles / benbakes, password: password123');
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());