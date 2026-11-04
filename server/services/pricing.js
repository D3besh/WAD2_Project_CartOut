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
