// Fills the database with realistic sample data for demos and testing.
// Run with: npm run seed   (WARNING: deletes existing data first)
import '../config/env.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Material from '../models/Material.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sidekick';

function daysFromNow(days, hour = 11) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function seed() {
  await mongoose.connect(uri);
  await Promise.all([User.deleteMany(), Material.deleteMany(), Product.deleteMany(), Order.deleteMany()]);

  // Demo login (list this in the README for graders)
  const seller = await User.create({
    email: 'demo@sidekick.test',
    passwordHash: await bcrypt.hash('demo1234', 10),
    shopName: 'Glow & Wick',
  });

  const [wax, oil, wicks, jars] = await Material.create([
    { seller: seller._id, name: 'Soy wax', unit: 'g', trackingMode: 'quantity', quantity: 1000, lowStockThreshold: 1500 },
    { seller: seller._id, name: 'Lavender fragrance oil', unit: 'ml', trackingMode: 'level', level: 'low' },
    { seller: seller._id, name: 'Cotton wicks', unit: 'pieces', trackingMode: 'level', level: 'medium' },
    { seller: seller._id, name: 'Glass jars', unit: 'pieces', trackingMode: 'quantity', quantity: 20, lowStockThreshold: 5 },
  ]);

  const candle = await Product.create({
    seller: seller._id,
    name: 'Lavender candle',
    variants: ['glass jar'],
    price: 18,
    makingTimeHours: 24,
    recipe: [
      { material: wax._id, amountPerUnit: 200 },
      { material: oil._id, amountPerUnit: 15 },
      { material: wicks._id, amountPerUnit: 1 },
      { material: jars._id, amountPerUnit: 1 },
    ],
  });

  await Order.create([
    { seller: seller._id, customerName: 'Ben', platform: 'whatsapp', items: [{ product: candle._id, variant: 'glass jar', quantity: 1 }], price: 18, paymentStatus: 'paid', fulfilmentMethod: 'self-collect', dueAt: daysFromNow(0), status: 'ready' },
    { seller: seller._id, customerName: 'Mia', platform: 'instagram', items: [{ product: candle._id, variant: 'glass jar', quantity: 2 }], price: 36, paymentStatus: 'paid', fulfilmentMethod: 'self-collect', dueAt: daysFromNow(0), status: 'ready' },
    { seller: seller._id, customerName: 'Yi Jie', platform: 'telegram', items: [{ product: candle._id, variant: 'glass jar', quantity: 1 }], price: 18, paymentStatus: 'unpaid', fulfilmentMethod: 'delivery', deliveryAddress: '81 Victoria Street, Singapore 188065', dueAt: daysFromNow(2, 15), status: 'in-progress' },
  ]);

  console.log('Seeded demo data. Login: demo@sidekick.test / demo1234');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
