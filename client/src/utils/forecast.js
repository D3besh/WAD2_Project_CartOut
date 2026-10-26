// Small helpers for SHOWING the forecast.
// Used by the Materials, Products and Forecast pages, so the maths is only written once.
// (The forecast itself is worked out on the server, in server/services/forecast.js.)
//
// The server sends every day as text like "2026-10-24".

// "2026-10-24" + 3 → "2026-10-27"
export function addDays(key, n) {
  let d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// How many days from one day to another, e.g. ("2026-10-23", "2026-10-24") → 1
export function daysBetween(fromKey, toKey) {
  let from = new Date(fromKey + 'T00:00:00Z');
  let to = new Date(toKey + 'T00:00:00Z');
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

// "2026-10-24" → "Sat, 24 Oct"
export function formatDay(key) {
  let date = new Date(key + 'T00:00:00');
  return date.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "2026-10-24" → "Saturday"
export function weekdayName(key) {
  let date = new Date(key + 'T00:00:00');
  return date.toLocaleDateString('en-SG', { weekday: 'long' });
}

// Amounts in a unit people buy in: 30750 g → "31 kg", 2500 ml → "2.5 L", 12 pieces → "12 pieces"
export function formatAmount(amount, unit) {
  if ((unit === 'g' || unit === 'ml') && amount >= 1000) {
    let big = amount / 1000;
    let bigUnit = unit === 'g' ? 'kg' : 'L';
    // 10 and above: whole number. Below 10: one decimal, e.g. 2.5
    let shown = big >= 10 ? Math.round(big) : Math.round(big * 10) / 10;
    return shown + ' ' + bigUnit;
  }
  return Math.ceil(amount) + ' ' + unit;
}

// Materials that are already low, or go low / run out within the 30 days. Soonest first.
//   actIn = days until you should act (0 = already low)
//   amountText = how much to buy, e.g. "31 kg"
export function buildRestockPlan(forecast) {
  if (!forecast || !forecast.materials) {
    return [];
  }

  let rows = [];
  for (let m of forecast.materials) {
    let alreadyLow = m.lowStockThreshold != null && m.quantity <= m.lowStockThreshold;
    let lowIn = m.runsLowOn ? daysBetween(forecast.today, m.runsLowOn) : null;
    let outIn = m.runsOutOn ? daysBetween(forecast.today, m.runsOutOn) : null;
    if (!alreadyLow && lowIn === null && outIn === null) {
      continue; // fine for 30 days
    }

    rows.push({
      ...m,
      alreadyLow: alreadyLow,
      lowIn: lowIn,
      outIn: outIn,
      actIn: alreadyLow ? 0 : (lowIn !== null ? lowIn : outIn),
      actOn: alreadyLow ? null : (m.runsLowOn || m.runsOutOn), // null = today
      amountText: m.suggestedBuy > 0 ? formatAmount(m.suggestedBuy, m.unit) : null,
    });
  }
  return rows.sort((a, b) => a.actIn - b.actIn);
}

// The same list, limited to the next `days` days
export function restockWithin(forecast, days) {
  return buildRestockPlan(forecast).filter((r) => r.actIn <= days);
}

// "Low now", "Low in 3 days", "Runs out in 5 days"
export function restockStatusText(r) {
  if (r.alreadyLow) return 'Low now';
  if (r.lowIn !== null) {
    if (r.lowIn <= 0) return 'Low today';
    return 'Low in ' + r.lowIn + (r.lowIn === 1 ? ' day' : ' days');
  }
  if (r.outIn <= 0) return 'Runs out today';
  return 'Runs out in ' + r.outIn + (r.outIn === 1 ? ' day' : ' days');
}

// The forecast for one product row on one day.
//   items   = forecast.products.items (from the server)
//   rowId   = "<productId>" (whole product), "<productId>:regular" or "<productId>:<variantId>"
//   dayIndex = 0 for today, 1 for tomorrow, ...
// Returns { orders, extra, total } or null if there's no forecast for it.
//   orders = already in the Order log for that day
//   extra  = how many MORE the forecast expects on top of those orders
export function dayForecast(items, rowId, dayIndex) {
  let item = items.find((i) => i.id === rowId);
  if (!item || !item.daily[dayIndex]) {
    return null;
  }
  let day = item.daily[dayIndex];
  let extra = Math.max(0, Math.round(day.expected - day.booked));
  return { orders: day.booked, extra: extra, total: day.booked + extra };
}