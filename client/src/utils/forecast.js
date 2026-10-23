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

// Materials that will RUN OUT within the next `withinDays` days, soonest first.
// Each one comes back as:
//   { id, name, daysLeft, amountText, buyBy }
//   buyBy = the day before it runs out, or null if that's today (or already past) → "buy today"
export function urgentBuys(forecast, withinDays) {
  if (forecast === null) {
    return [];
  }

  let list = [];
  for (let m of forecast.materials) {
    if (m.runsOutOn === null) {
      continue; // won't run out in the next 30 days
    }

    let daysLeft = daysBetween(forecast.today, m.runsOutOn);
    if (daysLeft > withinDays) {
      continue; // not urgent yet
    }

    let buyBy = addDays(m.runsOutOn, -1);
    if (buyBy <= forecast.today) {
      buyBy = null; // buy today
    }

    list.push({
      id: m.id,
      name: m.name,
      daysLeft: daysLeft,
      amountText: formatAmount(m.suggestedBuy, m.unit),
      buyBy: buyBy,
    });
  }

  return list.sort((a, b) => a.daysLeft - b.daysLeft);
}

// "1 day left", "6 days left", "Runs out today"
export function daysLeftText(daysLeft) {
  if (daysLeft <= 0) return 'Runs out today';
  if (daysLeft === 1) return '1 day left';
  return daysLeft + ' days left';
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