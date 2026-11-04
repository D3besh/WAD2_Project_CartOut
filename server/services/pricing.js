import Order from '../models/Order.js';

const DAY = 24 * 60 * 60 * 1000;

// recent period vs. the average of earlier periods of the same length
// export async function computeDemandRatio(sellerId, productId, periodDays = 14, baselinePeriods = 4) {
//   const now = Date.now();
//   const recentStart = new Date(now - periodDays * DAY);
//   const baselineStart = new Date(now - periodDays * (baselinePeriods + 1) * DAY);

//   const rows = await Order.aggregate([
//     { $match: { seller: sellerId, status: { $ne: 'cancelled' }, createdAt: { $gte: baselineStart } } },
//     { $unwind: '$items' },
//     { $match: { 'items.product': productId } },
//     {
//       $group: {
//         _id: { $cond: [{ $gte: ['$createdAt', recentStart] }, 'recent', 'baseline'] },
//         units: { $sum: '$items.quantity' },
//       },
//     },
//   ]);

//   const recent = rows.find(r => r._id === 'recent')?.units ?? 0;
//   const baselineAvg = (rows.find(r => r._id === 'baseline')?.units ?? 0) / baselinePeriods;
//   if (baselineAvg === 0) return 1; // not enough history, so no adjustment
//   return recent / baselineAvg;
// }

// export function suggestPrice({ cost, targetMargin = 0.4, demandRatio = 1 }) {
//   if (cost == null) return null;
//   const base = cost / (1 - targetMargin);
//   const clamp = Math.min(1.1, Math.max(0.9, demandRatio)); // ±10% max
//   return Math.round(base * clamp * 2) / 2;                 // nearest 0.50
// }

export function suggestPrice({ cost, targetMargin = 0.4, demandRatio = 1 }) {
  if (cost == null) return null;                           // no cost set, so no suggestion

  const base = cost / (1 - targetMargin);                  // 40% margin: cost ÷ 0.6
  const adjustment = Math.min(1.1, Math.max(0.9, demandRatio)); // clamp to ±10%
  const raw = base * adjustment;

  return Math.round(raw * 2) / 2;                          // round to nearest 0.50
}

export async function computeDemandRatios(sellerId, periodDays = 14, baselinePeriods = 4) {
  const now = Date.now();
  const recentStart = new Date(now - periodDays * DAY);
  const baselineStart = new Date(now - periodDays * (baselinePeriods + 1) * DAY);

  const rows = await Order.aggregate([
    { $match: { seller: sellerId, status: { $ne: 'cancelled' }, createdAt: { $gte: baselineStart } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: {
          product: '$items.product',
          variant: '$items.variantId', // new
          period: { $cond: [{ $gte: ['$createdAt', recentStart] }, 'recent', 'baseline'] },
        },
        units: { $sum: '$items.quantity' },
      },
    },
  ]);

  const byKey = new Map();
  for (const r of rows) {
    const key = `${r._id.product}:${r._id.variant ?? 'base'}`;
    const entry = byKey.get(key) ?? { recent: 0, baseline: 0 };
    entry[r._id.period] = r.units;
    byKey.set(key, entry);
  }

  const ratios = new Map();
  for (const [key, { recent, baseline }] of byKey) {
    const baselineAvg = baseline / baselinePeriods;
    ratios.set(key, baselineAvg === 0 ? 1 : recent / baselineAvg);
  }
  return ratios;
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Fit ln(units) = a + e * ln(price) on weekly data. Returns null if there's too little to learn from.
function fitElasticity(points) {
  const pts = points.filter(p => p.units > 0 && p.price > 0);
  const n = pts.length;
  if (n < 6) return null;                                   // need at least 6 weeks of sales

  const xs = pts.map(p => Math.log(p.price));
  const ys = pts.map(p => Math.log(p.units));
  const mx = mean(xs), my = mean(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);

  if (Math.sqrt(sxx / n) < 0.05) return null;               // price barely changed, so nothing to learn
  return { elasticity: sxy / sxx, n };
}

export function recommendMargin(fit, { defaultMargin = 0.4, min = 0.2, max = 0.7 } = {}) {
  // No fit, or demand doesn't fall when price rises (noise): keep the default
  if (!fit || fit.elasticity >= -1) return { margin: defaultMargin, basis: 'default' };

  const optimal = -1 / fit.elasticity;
  const weight = Math.min(1, fit.n / 10);                   // trust the data more as weeks increase
  const blended = weight * optimal + (1 - weight) * defaultMargin;

  return {
    margin: Math.round(clamp(blended, min, max) * 20) / 20, // nearest 5%
    basis: 'history',
    elasticity: fit.elasticity,
  };
}

// Recommended margin per product / variant, keyed like computeDemandRatios ("productId:variantId|base")
export async function computeRecommendedMargins(sellerId, { weeks = 12, defaultMargin = 0.4 } = {}) {
  const since = new Date(Date.now() - weeks * 7 * DAY);

  const rows = await Order.aggregate([
    { $match: { seller: sellerId, status: { $ne: 'cancelled' }, createdAt: { $gte: since } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: {
          product: '$items.product',
          variant: '$items.variantId',
          year: { $isoWeekYear: '$createdAt' },
          week: { $isoWeek: '$createdAt' },
        },
        units: { $sum: '$items.quantity' },
        revenue: { $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] } },
      },
    },
  ]);

  const byKey = new Map();
  for (const r of rows) {
    const key = `${r._id.product}:${r._id.variant ?? 'base'}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ units: r.units, price: r.units > 0 ? r.revenue / r.units : 0 });
  }

  const result = new Map();
  for (const [key, points] of byKey) {
    result.set(key, recommendMargin(fitElasticity(points), { defaultMargin }));
  }
  return result;
}