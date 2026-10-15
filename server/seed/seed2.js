// run using node seed/seed2.js
//
// Seeds two sellers (Amy, Ben), their materials and products, a few recent
// hand-written orders, and 12 weeks of PAST orders so the forecast has history to learn from.
//
// Each product has a `demand` assumption that drives its history:
//   weekday : base units sold on Sun, Mon, Tue, Wed, Thu, Fri, Sat
//   trend   : [start, end] multiplier across the 12 weeks (rising > 1, falling < 1)
//   events  : temporary spikes/dips, as { fromDaysAgo, toDaysAgo, multiplier, label }
// Daily units = weekday base × trend × events × small random noise, split into orders of 1–3 units.
//
// Every history order belongs to a realistic customer (name, contact, platform, and a delivery
// address when they have one). Each seller has a pool of repeat customers plus some one-off buyers.
//
// History orders are "completed" and marked materialsDeducted: true,
// so they DON'T change current stock.

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

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (d) => new Date(Date.now() + d * DAY_MS);

// ---------- History settings ----------
const HISTORY_DAYS = 84; // 12 weeks of past orders (yesterday back to 84 days ago)
const REPEAT_CUSTOMERS = 24; // generated regulars per seller (on top of the known ones)
const ONE_OFF_SHARE = 0.22; // share of orders from first-time / one-off customers
const NOISE = 0.15; // ±15% random day-to-day variation (set 0 for a perfectly clean pattern)
const MIN_ORDERS_PER_SELLER = 150;

// ---------- Deterministic random helpers (same data on every run) ----------
function makeRng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(210);
const int = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const chance = (p) => rng() < p;
function weightedPick(items, weightOf) {
  const total = items.reduce((s, i) => s + weightOf(i), 0);
  let r = rng() * total;
  for (const i of items) {
    r -= weightOf(i);
    if (r < 0) return i;
  }
  return items[items.length - 1];
}

// ---------- Fake customer data ----------
const FIRST_NAMES = ['Sarah', 'Marcus', 'Priya', 'Jenny', 'Daniel', 'Wei Ling', 'Aisha', 'Kevin', 'Mei', 'Rahul', 'Hui Min', 'Jason', 'Nurul', 'Grace', 'Ethan', 'Siti', 'Brandon', 'Charlene', 'Farhan', 'Joanne', 'Isaac', 'Pei Shan', 'Hakim', 'Vanessa'];
const LAST_NAMES = ['Tan', 'Lim', 'Nair', 'Ong', 'Koh', 'Lee', 'Wong', 'Chua', 'Ng', 'Teo', 'Rahman', 'Singh', 'Goh', 'Chan', 'Yeo', 'Ho', 'Tay', 'Ismail'];
const PLATFORMS = ['whatsapp', 'instagram', 'telegram', 'tiktok'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// [street, postal sector (first 2 digits of a Singapore postal code)]
const STREETS = [
  ['Clementi Ave 3', '12'], ['Tampines St 82', '52'], ['Ang Mo Kio Ave 3', '56'], ['Bishan St 12', '57'],
  ['Jurong West St 42', '64'], ['Sengkang East Way', '54'], ['Pasir Ris St 12', '51'], ['Bukit Batok West Ave 6', '65'],
  ['Woodlands Ave 5', '73'], ['Serangoon Ave 2', '55'], ['Toa Payoh Lor 4', '31'], ['Yishun Ring Rd', '76'],
  ['Hougang Ave 8', '53'], ['Punggol Field', '82'], ['Bedok North St 3', '46'], ['Choa Chu Kang Ave 4', '68'],
];

function makeAddress() {
  const [street, sector] = pick(STREETS);
  const unit = String(int(1, 150)).padStart(2, '0');
  return `${int(1, 600)} ${street}, #${String(int(2, 25)).padStart(2, '0')}-${unit}, Singapore ${sector}${int(1000, 9999)}`;
}

// Creates unique customers (name + contact + platform + optional home address) for one seller.
function createCustomerGenerator(known = []) {
  const usedNames = new Set(known.map((c) => c.name));
  const usedContacts = new Set(known.map((c) => c.contact));

  const make = () => {
    let name;
    do name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    while (usedNames.has(name));
    usedNames.add(name);

    const platform = pick(PLATFORMS);
    const isHandle = platform === 'instagram' || platform === 'tiktok';
    let contact;
    let attempt = 0;
    do {
      contact = isHandle
        ? '@' + name.toLowerCase().replace(/\s+/g, '.') + (attempt ? int(1, 99) : '')
        : `+65 ${pick(['8', '9'])}${int(100, 999)} ${int(1000, 9999)}`;
      attempt++;
    } while (usedContacts.has(contact));
    usedContacts.add(contact);

    return { name, contact, platform, address: chance(0.4) ? makeAddress() : null };
  };
  return make;
}

function makeMessage(platform, desc, delivery, address, dueAt) {
  const where = delivery
    ? `Please deliver to ${address.split(',')[0]}.`
    : `I'll collect on ${WEEKDAY_NAMES[dueAt.getDay()]}.`;
  const templates = {
    whatsapp: `Hi! Can I get ${desc}? ${where}`,
    instagram: `Hello, ${desc} please. ${where}`,
    telegram: `Hi, I'd like to order ${desc}. ${where}`,
    tiktok: `Hey! Do you still have ${desc}? ${where}`,
  };
  return templates[platform];
}

// ---------- Seller definitions ----------
// materials: key is local to the seller and used by recipes / extras
// recentOrders: hand-written orders around "now" (p = map of product key -> saved product doc)
const SELLERS = [
  {
    username: 'amycandles',
    email: 'amy@example.com',
    shopName: 'Amy’s Candle Co.',
    // customers already used in the hand-written recent orders, so their details stay consistent
    knownCustomers: [
      { name: 'Sarah Tan', contact: '+65 9123 4567', platform: 'whatsapp', address: null },
      { name: 'Marcus Lim', contact: '@marcus.lim', platform: 'instagram', address: '12 Clementi Ave 3, #05-21, Singapore 120012' },
      { name: 'Priya Nair', contact: '+65 8222 1111', platform: 'telegram', address: null },
    ],
    materials: [
      { key: 'wax', name: 'Soy wax', unit: 'g', trackingMode: 'quantity', quantity: 5000, lowStockThreshold: 1000 },
      { key: 'fragrance', name: 'Fragrance oil', unit: 'ml', trackingMode: 'quantity', quantity: 300, lowStockThreshold: 50 },
      { key: 'wicks', name: 'Cotton wicks', unit: 'pieces', trackingMode: 'quantity', quantity: 80, lowStockThreshold: 20 },
      { key: 'jars', name: 'Glass jars', unit: 'pieces', trackingMode: 'quantity', quantity: 60, lowStockThreshold: 15 },
      { key: 'lavender', name: 'Dried lavender', unit: 'g', trackingMode: 'level', level: 'medium' },
    ],
    products: [
      {
        key: 'lavender',
        name: 'Lavender candle',
        label: ['lavender candle', 'lavender candles'], // used in order messages
        price: 18,
        makingTimeMins: 45,
        recipe: [
          { material: 'wax', amountPerUnit: 200 },
          { material: 'fragrance', amountPerUnit: 15 },
          { material: 'wicks', amountPerUnit: 1 },
          { material: 'jars', amountPerUnit: 1 },
        ],
        variants: [
          { name: 'Small (100g)', price: 12, extras: [] },
          { name: 'With dried lavender topping', price: 21, extras: [{ material: 'lavender', amountPerUnit: 5 }] },
        ],
        // RISING: gift favourite that keeps growing, peaks Fri/Sat, with a gifting bump
        demand: {
          weekday: [3, 2, 2, 2, 3, 4, 5],
          trend: [0.8, 1.8],
          events: [{ fromDaysAgo: 24, toDaysAgo: 18, multiplier: 1.6, label: 'gifting bump' }],
          variantShare: 0.35,
        },
      },
      {
        key: 'vanilla',
        name: 'Vanilla candle',
        label: ['vanilla candle', 'vanilla candles'],
        price: 18,
        makingTimeMins: 45,
        recipe: [
          { material: 'wax', amountPerUnit: 200 },
          { material: 'fragrance', amountPerUnit: 15 },
          { material: 'wicks', amountPerUnit: 1 },
          { material: 'jars', amountPerUnit: 1 },
        ],
        variants: [],
        // FALLING: older line losing customers to lavender, one promo week spike, busiest on weekends
        demand: {
          weekday: [3, 2, 2, 2, 2, 3, 4],
          trend: [1.4, 0.6],
          events: [{ fromDaysAgo: 50, toDaysAgo: 44, multiplier: 1.8, label: 'promo week' }],
        },
      },
    ],
    recentOrders: (p) => [
      {
        customerName: 'Sarah Tan',
        customerContact: '+65 9123 4567',
        platform: 'whatsapp',
        items: [{ product: p.lavender._id, quantity: 2 }],
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
        customerName: 'Marcus Lim',
        customerContact: '@marcus.lim',
        platform: 'instagram',
        items: [
          { product: p.lavender._id, variant: 'With dried lavender topping', quantity: 1 },
          { product: p.vanilla._id, quantity: 2 },
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
        customerName: 'Priya Nair',
        customerContact: '+65 8222 1111',
        platform: 'telegram',
        items: [{ product: p.vanilla._id, quantity: 4 }],
        price: 72,
        paymentStatus: 'unpaid',
        fulfilmentMethod: 'self-collect',
        dueAt: daysFromNow(5),
        status: 'in-progress',
        rawMessage: 'Need 4 vanilla candles as gifts, collecting next week.',
        materialsDeducted: false, // fresh order, stock not yet deducted
      },
    ],
  },
  {
    username: 'benbakes',
    email: 'ben@example.com',
    shopName: 'Ben’s Bakes',
    knownCustomers: [
      { name: 'Jenny Ong', contact: '+65 9000 1234', platform: 'whatsapp', address: '88 Tampines St 82, #10-02, Singapore 520088' },
      { name: 'Daniel Koh', contact: '@daniel.koh', platform: 'tiktok', address: null },
    ],
    materials: [
      { key: 'flour', name: 'Flour', unit: 'g', trackingMode: 'quantity', quantity: 10000, lowStockThreshold: 2000 },
      { key: 'butter', name: 'Butter', unit: 'g', trackingMode: 'quantity', quantity: 3000, lowStockThreshold: 500 },
      { key: 'sugar', name: 'Sugar', unit: 'g', trackingMode: 'level', level: 'high' },
    ],
    products: [
      {
        key: 'cookies',
        name: 'Chocolate chip cookies (box of 12)',
        label: ['box of chocolate chip cookies', 'boxes of chocolate chip cookies'],
        price: 15,
        makingTimeMins: 60,
        recipe: [
          { material: 'flour', amountPerUnit: 300 },
          { material: 'butter', amountPerUnit: 150 },
          { material: 'sugar', amountPerUnit: 120 },
        ],
        variants: [{ name: 'Gluten-free', price: 18, extras: [] }],
        // STEADY: reliable weekend treat with a slow rise, plus a one-week dip when the shop was on break
        demand: {
          weekday: [4, 2, 2, 2, 3, 4, 6],
          trend: [1.0, 1.1],
          events: [{ fromDaysAgo: 60, toDaysAgo: 54, multiplier: 0.5, label: 'shop break dip' }],
          variantShare: 0.25,
        },
      },
      {
        key: 'brownies',
        name: 'Fudge brownies (box of 9)',
        label: ['box of fudge brownies', 'boxes of fudge brownies'],
        price: 20,
        makingTimeMins: 50,
        recipe: [
          { material: 'flour', amountPerUnit: 200 },
          { material: 'butter', amountPerUnit: 200 },
          { material: 'sugar', amountPerUnit: 250 },
        ],
        variants: [],
        // RISING with a SPIKE: office end-of-week treat (peaks Fri), then a viral week that boosted it
        demand: {
          weekday: [2, 1, 1, 1, 2, 4, 3],
          trend: [0.7, 1.5],
          events: [{ fromDaysAgo: 32, toDaysAgo: 26, multiplier: 2.2, label: 'viral spike' }],
        },
      },
    ],
    recentOrders: (p) => [
      {
        customerName: 'Jenny Ong',
        customerContact: '+65 9000 1234',
        platform: 'whatsapp',
        items: [
          { product: p.cookies._id, quantity: 2 },
          { product: p.brownies._id, quantity: 1 },
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
        customerName: 'Daniel Koh',
        customerContact: '@daniel.koh',
        platform: 'tiktok',
        items: [{ product: p.cookies._id, variant: 'Gluten-free', quantity: 1 }],
        price: 18,
        paymentStatus: 'deposit',
        depositAmount: 5,
        fulfilmentMethod: 'self-collect',
        dueAt: daysFromNow(4),
        status: 'in-progress',
        materialsDeducted: true,
      },
    ],
  },
];

// ---------- History generator ----------
// Units demanded for one product on one day, from its demand assumption.
function unitsFor(demand, daysAgo, weekday) {
  const t = (HISTORY_DAYS - daysAgo) / (HISTORY_DAYS - 1); // 0 = oldest day, 1 = yesterday
  const [startMult, endMult] = demand.trend;
  const trend = startMult + (endMult - startMult) * t;

  const event = (demand.events || [])
    .filter((e) => daysAgo <= e.fromDaysAgo && daysAgo >= e.toDaysAgo)
    .reduce((m, e) => m * e.multiplier, 1);

  const noise = 1 + (rng() * 2 - 1) * NOISE;
  const raw = demand.weekday[weekday] * trend * event * noise;

  // Stochastic rounding so low-demand days don't all collapse to 0 or 1
  const whole = Math.floor(raw);
  return whole + (chance(raw - whole) ? 1 : 0);
}

// Completed, paid orders for the last HISTORY_DAYS days, oldest first.
// Returns { orders, stats } where stats[productName] = units sold per 4-week block (oldest → newest).
function buildHistoryOrders(sellerId, productDefs, productDocs, knownCustomers = []) {
  const orders = [];
  const stats = {};
  productDefs.forEach((d) => (stats[d.name] = [0, 0, 0]));

  // Repeat customers (known + generated), each with a different buying frequency
  const makeCustomer = createCustomerGenerator(knownCustomers);
  const pool = [
    ...knownCustomers.map((c) => ({ ...c, weight: 1 + rng() * 2 })),
    ...Array.from({ length: REPEAT_CUSTOMERS }, () => ({ ...makeCustomer(), weight: 0.5 + rng() * 2.5 })),
  ];

  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    const day = new Date();
    day.setDate(day.getDate() - daysAgo);
    const weekday = day.getDay();
    const block = Math.floor((HISTORY_DAYS - daysAgo) / 28);

    productDocs.forEach((doc, idx) => {
      const def = productDefs[idx];
      let remaining = unitsFor(def.demand, daysAgo, weekday);
      stats[def.name][block] += remaining;

      // Split the day's units into several orders of 1–3 units each
      while (remaining > 0) {
        const quantity = Math.min(remaining, pick([1, 1, 1, 2, 2, 3]));
        remaining -= quantity;

        const customer = chance(ONE_OFF_SHARE) ? makeCustomer() : weightedPick(pool, (c) => c.weight);
        const delivery = Boolean(customer.address) && chance(0.8);

        const variant =
          doc.variants.length > 0 && chance(def.demand.variantShare ?? 0) ? pick(doc.variants) : null;
        const unitPrice = variant && variant.price != null ? variant.price : doc.price;
        const price = unitPrice * quantity;

        const dueAt = new Date(day);
        dueAt.setHours(int(10, 20), pick([0, 15, 30, 45]), 0, 0);
        const createdAt = new Date(dueAt);
        createdAt.setHours(9, 0, 0, 0); // same day, earlier (only applies if the schema has timestamps)

        const item = { product: doc._id, quantity };
        if (variant) item.variant = variant.name;

        const order = {
          seller: sellerId,
          customerName: customer.name,
          customerContact: customer.contact,
          platform: customer.platform,
          items: [item],
          price,
          paymentStatus: 'paid',
          depositAmount: price,
          fulfilmentMethod: delivery ? 'delivery' : 'self-collect',
          dueAt,
          status: 'completed',
          materialsDeducted: true,
          createdAt,
        };
        if (delivery) order.deliveryAddress = customer.address;
        if (chance(0.85)) {
          const label = def.label[quantity === 1 ? 0 : 1];
          const desc = `${quantity} ${label}${variant ? ' (' + variant.name.toLowerCase() + ')' : ''}`;
          order.rawMessage = makeMessage(customer.platform, desc, delivery, customer.address, dueAt);
        }
        orders.push(order);
      }
    });
  }
  return { orders, stats };
}

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed in production');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // Clear existing data for the seed sellers ONLY (children first), so other users' data is left alone
  const seedUsers = await User.find({
    $or: [
      { email: { $in: SELLERS.map((s) => s.email) } },
      { username: { $in: SELLERS.map((s) => s.username) } },
    ],
  }).select('_id');
  const seedUserIds = seedUsers.map((u) => u._id);

  await Promise.all([
    Order.deleteMany({ seller: { $in: seedUserIds } }),
    Product.deleteMany({ seller: { $in: seedUserIds } }),
    Material.deleteMany({ seller: { $in: seedUserIds } }),
  ]);
  await User.deleteMany({ _id: { $in: seedUserIds } });
  console.log(`Cleared existing data for ${seedUserIds.length} seed user(s)`);

  // ---------- Users ----------
  const passwordHash = await bcrypt.hash('password123', 10);
  const users = await User.create(
    SELLERS.map((s) => ({ username: s.username, email: s.email, passwordHash, shopName: s.shopName }))
  );

  let totalMaterials = 0;
  let totalProducts = 0;
  let totalOrders = 0;

  for (let i = 0; i < SELLERS.length; i++) {
    const def = SELLERS[i];
    const user = users[i];

    // ---------- Materials ----------
    const materialDocs = await Material.create(
      def.materials.map(({ key, ...fields }) => ({ seller: user._id, ...fields }))
    );
    const materialId = Object.fromEntries(def.materials.map((m, idx) => [m.key, materialDocs[idx]._id]));

    // ---------- Products ----------
    const productDocs = await Product.create(
      def.products.map((p) => ({
        seller: user._id,
        name: p.name,
        price: p.price,
        makingTimeMins: p.makingTimeMins,
        recipe: p.recipe.map((r) => ({ material: materialId[r.material], amountPerUnit: r.amountPerUnit })),
        variants: p.variants.map((v) => ({
          name: v.name,
          price: v.price,
          extras: v.extras.map((e) => ({ material: materialId[e.material], amountPerUnit: e.amountPerUnit })),
        })),
      }))
    );
    const productsByKey = Object.fromEntries(def.products.map((p, idx) => [p.key, productDocs[idx]]));

    // ---------- Orders ----------
    const recent = def.recentOrders(productsByKey).map((o) => ({ seller: user._id, ...o }));
    const { orders: history, stats } = buildHistoryOrders(user._id, def.products, productDocs, def.knownCustomers);
    if (history.length < MIN_ORDERS_PER_SELLER) {
      console.warn(`  Warning: ${def.username} only got ${history.length} historical orders (< ${MIN_ORDERS_PER_SELLER})`);
    }
    await Order.create([...history, ...recent]);

    totalMaterials += materialDocs.length;
    totalProducts += productDocs.length;
    totalOrders += history.length + recent.length;
    console.log(`  ${def.username}: ${history.length} historical + ${recent.length} recent orders`);
    for (const [name, blocks] of Object.entries(stats)) {
      console.log(`    ${name}: units per 4-week block (oldest → newest) = ${blocks.join(' → ')}`);
    }
  }

  console.log(`Seeded: ${users.length} users, ${totalMaterials} materials, ${totalProducts} products, ${totalOrders} orders`);
  console.log(`Login with ${SELLERS.map((s) => s.username).join(' / ')}, password: password123`);
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());