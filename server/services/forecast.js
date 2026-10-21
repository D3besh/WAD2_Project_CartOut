// FORECAST: "When will each material run low, if sales follow the usual pattern?"
//
// Called by GET /api/materials/forecast (server/routes/materials.js).
//
// How it works (example: oat milk)
//   1. LEARN  — look at the last 8 weeks of completed orders and work out how much
//               oat milk is used on a typical Monday, Tuesday, ... Sunday.
//               It's a WEIGHTED average: last week counts 8×, the week before 7×,
//               ... 8 weeks ago counts 1×. So if sales are rising or falling,
//               the forecast follows the trend instead of lagging behind it.
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
// ACCURACY CHECK (backtesting)
//   To show the forecast actually works, we pretend we're back in the past:
//   for each of the last 28 days, we forecast that day using ONLY the 8 weeks
//   before it, then compare with what was really used that day.
//   Mean Absolute Error (MAE) = average of |actual − forecast| over those days.
//   We do the same with a simple (unweighted) average, so we can show how much
//   better the weighted version is.
//
// Only 'quantity' materials are forecast (level materials have no number).
import Material from '../models/Material.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { materialsNeeded } from './inventory.js';

const HISTORY_DAYS = 56;  // learn from the last 8 weeks
const TEST_DAYS = 28;     // check accuracy on the last 4 weeks
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

// Rounds to 1 decimal place, e.g. 12.345 → 12.3
function round1(n) {
  return Math.round(n * 10) / 10;
}

// -----------------------------------------------------
// STEP 1: the weekday averages, learned from the 8 weeks BEFORE a given day.
// -----------------------------------------------------
// usageByDay = { "2026-10-10": { <butter id>: 1500, ... }, ... }  (what was used each day)
// endDay     = the day we're forecasting from (that day itself is NOT used)
// weighted   = true  → recent weeks count more (last week 8×, ..., 8 weeks ago 1×)
//              false → every week counts the same (simple average)
//
// Returns a function: averageOn(weekday, materialId) → amount used on a typical day
export function learnWeekdayAverages(usageByDay, holidayDates, endDay, weighted) {
  let totals = [{}, {}, {}, {}, {}, {}, {}];   // weighted usage per weekday, per material
  let weightSums = [0, 0, 0, 0, 0, 0, 0];      // total weight per weekday

  for (let i = 1; i <= HISTORY_DAYS; i++) {
    let key = addDays(endDay, -i);
    if (holidayDates.includes(key)) {
      continue; // holiday rush, don't learn from it
    }

    // i = 1..7 is last week (weight 8), i = 50..56 is 8 weeks ago (weight 1)
    let weeksAgo = Math.floor((i - 1) / 7);    // 0 = last week ... 7 = 8 weeks ago
    let weight = weighted ? 8 - weeksAgo : 1;

    let wd = weekdayOf(key);
    weightSums[wd] = weightSums[wd] + weight;

    // A day with no orders still counts (as 0 used): quiet days are information too
    let used = usageByDay[key] || {};
    for (let id in used) {
      totals[wd][id] = (totals[wd][id] || 0) + used[id] * weight;
    }
  }

  return function averageOn(weekday, materialId) {
    if (weightSums[weekday] === 0) {
      return 0;
    }
    return (totals[weekday][materialId] || 0) / weightSums[weekday];
  };
}

// -----------------------------------------------------
// ACCURACY CHECK: backtest the last 28 days
// -----------------------------------------------------
// For each test day, forecast it using only the 8 weeks before it,
// then compare with what was actually used.
// Returns { <material id>: { maeWeighted, maeSimple, avgDailyUse }, ... }
export function backtest(materials, usageByDay, holidayDates, today) {
  let errors = {}; // per material: running totals
  for (let m of materials) {
    errors[String(m._id)] = { weighted: 0, simple: 0, actual: 0, days: 0 };
  }

  for (let t = 1; t <= TEST_DAYS; t++) {
    let testDay = addDays(today, -t);
    if (holidayDates.includes(testDay)) {
      continue; // holidays aren't normal days, so don't test on them either
    }

    // Pretend it's the morning of testDay: learn only from the 8 weeks before it
    let weightedAvg = learnWeekdayAverages(usageByDay, holidayDates, testDay, true);
    let simpleAvg = learnWeekdayAverages(usageByDay, holidayDates, testDay, false);
    let wd = weekdayOf(testDay);
    let used = usageByDay[testDay] || {};

    for (let m of materials) {
      let id = String(m._id);
      let actual = used[id] || 0;
      errors[id].weighted += Math.abs(actual - weightedAvg(wd, id));
      errors[id].simple += Math.abs(actual - simpleAvg(wd, id));
      errors[id].actual += actual;
      errors[id].days += 1;
    }
  }

  let results = {};
  for (let id in errors) {
    let e = errors[id];
    if (e.days === 0) {
      results[id] = null;
      continue;
    }
    results[id] = {
      maeWeighted: e.weighted / e.days,  // e.g. off by 180 g per day
      maeSimple: e.simple / e.days,
      avgDailyUse: e.actual / e.days,    // to turn the error into a %
    };
  }
  return results;
}

// -----------------------------------------------------
// The algorithm itself. It only does maths on the data it's given
// (no database), so it can be tested on its own.
// -----------------------------------------------------
//   materials      = this seller's quantity materials
//   products       = this seller's products (including archived ones, since old orders use them)
//   pastOrders     = completed orders due in the last 12 weeks (8 to learn + 4 to test)
//   upcomingOrders = orders due in the next 30 days (already logged)
//   holidayDates   = ["2026-10-20", ...] public holidays
//   today          = "2026-10-14"
export function buildForecast(materials, products, pastOrders, upcomingOrders, holidayDates, today) {

  // ===== What was used on each past day =====
  // e.g. usageByDay["2026-10-10"] = { <butter id>: 1500, <flour id>: 3000 }
  let usageByDay = {};
  let historyOrderCount = 0;
  let learnFrom = addDays(today, -HISTORY_DAYS); // the forecast itself uses the last 8 weeks
  for (let order of pastOrders) {
    let key = dayKey(order.dueAt);
    if (!usageByDay[key]) {
      usageByDay[key] = {};
    }
    addInto(usageByDay[key], materialsNeeded(order.items, products));
    if (key >= learnFrom && !holidayDates.includes(key)) {
      historyOrderCount++;
    }
  }

  // ===== STEP 1: LEARN (weighted), using the 8 weeks before today =====
  let averageOn = learnWeekdayAverages(usageByDay, holidayDates, today, true);

  // ===== Accuracy check on the last 4 weeks =====
  let accuracyById = backtest(materials, usageByDay, holidayDates, today);

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
  let percentWeighted = []; // each material's error %, for the overall accuracy line
  let percentSimple = [];

  for (let m of materials) {
    let id = String(m._id);

    // Which weekday is busiest for this material, and is it a spike?
    let totalAverage = 0;
    let busiestDay = null;
    let busiestAverage = 0;
    for (let wd = 0; wd < 7; wd++) {
      totalAverage = totalAverage + averageOn(wd, id);
      if (averageOn(wd, id) > busiestAverage) {
        busiestAverage = averageOn(wd, id);
        busiestDay = wd;
      }
    }
    let dailyAverage = totalAverage / 7;
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

    // Accuracy for this material, as amounts and as a % of a normal day's use
    let accuracy = null;
    let a = accuracyById[id];
    if (a && a.avgDailyUse > 0) {
      accuracy = {
        maeWeighted: round1(a.maeWeighted),  // e.g. 180 (g per day)
        maeSimple: round1(a.maeSimple),
        avgDailyUse: round1(a.avgDailyUse),
        errorPercent: Math.round((a.maeWeighted / a.avgDailyUse) * 100),       // e.g. 15
        simpleErrorPercent: Math.round((a.maeSimple / a.avgDailyUse) * 100),   // e.g. 22
      };
      percentWeighted.push(accuracy.errorPercent);
      percentSimple.push(accuracy.simpleErrorPercent);
    }

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
      spikeRatio: round1(spikeRatio), // e.g. 2.4 (× a normal day)
      accuracy: accuracy,             // null if the material wasn't used in the test weeks
    });
  }

  // ===== Overall accuracy: the average error % across materials =====
  let accuracy = null;
  if (percentWeighted.length > 0) {
    let avgWeighted = percentWeighted.reduce((sum, p) => sum + p, 0) / percentWeighted.length;
    let avgSimple = percentSimple.reduce((sum, p) => sum + p, 0) / percentSimple.length;
    accuracy = {
      testDays: TEST_DAYS,
      errorPercent: Math.round(avgWeighted),        // weighted forecast: ~X% off per day
      simpleErrorPercent: Math.round(avgSimple),    // simple average: ~Y% off per day
      // how much smaller the weighted error is, e.g. 25 = "25% more accurate"
      improvementPercent: avgSimple > 0 ? Math.round(((avgSimple - avgWeighted) / avgSimple) * 100) : 0,
    };
  }

  return {
    today: today,
    forecastDays: FORECAST_DAYS,
    historyOrderCount: historyOrderCount, // 0 = not enough history to forecast yet
    accuracy: accuracy,                   // null = not enough history to test yet
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
  // 12 weeks: the forecast learns from the last 8, and the accuracy check
  // needs 8 more weeks before each of its 4 test weeks.
  let pastOrders = await Order.find({
    seller: sellerId,
    status: 'completed',
    dueAt: { $gte: startOfDay(addDays(today, -(HISTORY_DAYS + TEST_DAYS))), $lt: startOfDay(today) },
  });

  let upcomingOrders = await Order.find({
    seller: sellerId,
    dueAt: { $gte: startOfDay(today), $lt: startOfDay(addDays(today, FORECAST_DAYS)) },
  });

  return buildForecast(materials, products, pastOrders, upcomingOrders, holidayDates, today);
}