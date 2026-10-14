// FORECAST: "When will each material run low, if sales follow the usual pattern?"
//
// Called by GET /api/materials/forecast (server/routes/materials.js).
//
// How it works (example: oat milk)
//   1. LEARN  — look at the last 8 weeks of orders and work out how much oat milk
//               is used on an average Monday, Tuesday, ... Sunday.
//               Public holidays are left out, so a holiday rush doesn't make
//               normal days look busier than they are.
//   2. START  — from the stock we have now. Orders that are already logged have
//               already been taken out of stock (we deduct when an order is created),
//               so this is what's left after all booked orders.
//   3. WALK   — go through the next 30 days one by one:
//                 expected extra = that weekday's average − what's already booked that day
//                 stock = stock − expected extra
//   4. ALERT  — remember the first day stock drops below the low-stock threshold,
//               and the first day it runs out.
//
// Only 'quantity' materials are forecast (level materials have no number).
import Material from '../models/Material.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { materialsNeeded } from './inventory.js';

const HISTORY_DAYS = 56;  // learn from the last 8 weeks
const FORECAST_DAYS = 30; // look 30 days ahead (prof: restocking takes less than a month)
const SPIKE_RATIO = 1.5;  // a weekday is a "spike" if it uses 1.5× the normal daily average

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// -----------------------------------------------------
// Date helpers. Every day is written as text like "2026-10-14" (Singapore time),
// which makes it easy to compare days and use them as keys.
// -----------------------------------------------------
const SG_OFFSET_MS = 8 * 60 * 60 * 1000; // Singapore is UTC+8

// A date/time → its Singapore day, e.g. "2026-10-14"
function dayKey(date) {
  let sgTime = new Date(new Date(date).getTime() + SG_OFFSET_MS);
  return sgTime.toISOString().slice(0, 10);
}

// "2026-10-14" + 3 → "2026-10-17"
function addDays(key, n) {
  let d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// "2026-10-14" → 3 (0 = Sunday, 6 = Saturday)
function weekdayOf(key) {
  return new Date(key + 'T00:00:00Z').getUTCDay();
}

// "2026-10-14" → the moment that day starts in Singapore (for MongoDB queries)
function startOfDay(key) {
  return new Date(key + 'T00:00:00+08:00');
}

// Adds amounts into a "box", e.g. box = { <oat milk id>: 560, <matcha id>: 8 }
function addInto(box, needed) {
  for (let n of needed) {
    let id = String(n.material);
    box[id] = (box[id] || 0) + n.amount;
  }
}

// -----------------------------------------------------
// The algorithm itself. It only does maths on the data it's given
// (no database), so it can be tested on its own.
// -----------------------------------------------------
//   materials      = this seller's quantity materials
//   products       = this seller's products (including archived ones, since old orders use them)
//   pastOrders     = orders due in the last 8 weeks
//   upcomingOrders = orders due in the next 30 days (already logged)
//   holidayDates   = ["2026-10-20", ...] public holidays
//   today          = "2026-10-14"
export function buildForecast(materials, products, pastOrders, upcomingOrders, holidayDates, today) {

  // ===== STEP 1: LEARN the weekday pattern =====

  // How many normal (non-holiday) Mondays, Tuesdays, ... are in the last 8 weeks?
  // (Usually 8 each. Days with NO orders still count, as days that used 0.)
  let normalDays = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 1; i <= HISTORY_DAYS; i++) {
    let key = addDays(today, -i);
    if (!holidayDates.includes(key)) {
      normalDays[weekdayOf(key)]++;
    }
  }

  // Total material used on each weekday, e.g. usedOn[6] = everything used on Saturdays
  let usedOn = [{}, {}, {}, {}, {}, {}, {}];
  let historyOrderCount = 0;
  for (let order of pastOrders) {
    let key = dayKey(order.dueAt);
    if (holidayDates.includes(key)) {
      continue; // holiday rush, don't learn from it
    }
    addInto(usedOn[weekdayOf(key)], materialsNeeded(order.items, products));
    historyOrderCount++;
  }

  // Average used on one weekday, e.g. averageOn(6, oatMilkId) = 1120 (ml per Saturday)
  function averageOn(weekday, materialId) {
    if (normalDays[weekday] === 0) {
      return 0;
    }
    return (usedOn[weekday][materialId] || 0) / normalDays[weekday];
  }

  // ===== Orders already booked for the coming days =====
  // e.g. booked["2026-10-17"] = { <oat milk id>: 560 }
  let booked = {};
  for (let order of upcomingOrders) {
    let key = dayKey(order.dueAt);
    if (!booked[key]) {
      booked[key] = {};
    }
    addInto(booked[key], materialsNeeded(order.items, products));
  }

  // ===== STEPS 2–4 for each material =====
  let results = [];

  for (let m of materials) {
    let id = String(m._id);

    // Which weekday is busiest for this material, and is it a spike?
    let totalUsed = 0;
    let totalDays = 0;
    let busiestDay = null;
    let busiestAverage = 0;
    for (let wd = 0; wd < 7; wd++) {
      totalUsed = totalUsed + (usedOn[wd][id] || 0);
      totalDays = totalDays + normalDays[wd];
      if (averageOn(wd, id) > busiestAverage) {
        busiestAverage = averageOn(wd, id);
        busiestDay = wd;
      }
    }
    let dailyAverage = totalDays > 0 ? totalUsed / totalDays : 0;
    let spikeRatio = dailyAverage > 0 ? busiestAverage / dailyAverage : 0;

    // STEP 2: start from the stock we have now
    let stock = m.quantity;
    let expectedTotal = 0; // how much we expect to use in the next 30 days
    let runsLowOn = null;
    let runsOutOn = null;
    let alreadyLow = m.lowStockThreshold != null && m.quantity <= m.lowStockThreshold;

    // STEP 3: walk through the next 30 days
    for (let i = 0; i < FORECAST_DAYS; i++) {
      let key = addDays(today, i);
      let usual = averageOn(weekdayOf(key), id);
      let alreadyBooked = booked[key] ? booked[key][id] || 0 : 0;

      // Booked orders were already taken out of stock, so only count what's EXTRA
      let expected = Math.max(0, usual - alreadyBooked);
      if (expected === 0) {
        continue;
      }
      stock = stock - expected;
      expectedTotal = expectedTotal + expected;

      // STEP 4: remember the first day it drops below the threshold / runs out
      if (!alreadyLow && runsLowOn === null && m.lowStockThreshold != null && stock < m.lowStockThreshold) {
        runsLowOn = key;
      }
      if (runsOutOn === null && stock <= 0) {
        runsOutOn = key;
      }
    }

    // How much to buy so it lasts 30 days and still stays above the threshold
    let suggestedBuy = Math.max(0, Math.ceil(expectedTotal + (m.lowStockThreshold || 0) - m.quantity));

    results.push({
      id: id,
      name: m.name,
      unit: m.unit,
      quantity: m.quantity,
      lowStockThreshold: m.lowStockThreshold,
      runsLowOn: runsLowOn,           // e.g. "2026-10-18", or null
      runsOutOn: runsOutOn,           // e.g. "2026-10-19", or null
      expectedUse: Math.round(expectedTotal),
      suggestedBuy: suggestedBuy,
      busiestDay: busiestDay === null ? null : WEEKDAYS[busiestDay], // e.g. "Saturday"
      isSpike: spikeRatio >= SPIKE_RATIO,
      spikeRatio: Math.round(spikeRatio * 10) / 10, // e.g. 2.4 (× a normal day)
    });
  }

  return {
    today: today,
    forecastDays: FORECAST_DAYS,
    historyOrderCount: historyOrderCount, // 0 = not enough history to forecast yet
    materials: results,
  };
}

// -----------------------------------------------------
// Loads everything from the database, then runs buildForecast
// -----------------------------------------------------
export async function forecastMaterials(sellerId, holidayDates) {
  let today = dayKey(new Date());

  let materials = await Material.find({ seller: sellerId, trackingMode: 'quantity' }).sort({ name: 1 });

  // Include archived products: past orders may use them
  let products = await Product.find({ seller: sellerId });

  // Only COMPLETED orders count as history (they really happened).
  // Past orders still "in-progress" or "ready" may be out of date, so they're left out.
  let pastOrders = await Order.find({
    seller: sellerId,
    status: 'completed',
    dueAt: { $gte: startOfDay(addDays(today, -HISTORY_DAYS)), $lt: startOfDay(today) },
  });

  let upcomingOrders = await Order.find({
    seller: sellerId,
    dueAt: { $gte: startOfDay(today), $lt: startOfDay(addDays(today, FORECAST_DAYS)) },
  });

  return buildForecast(materials, products, pastOrders, upcomingOrders, holidayDates, today);
}
