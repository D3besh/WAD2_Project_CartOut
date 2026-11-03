// Small helpers for SHOWING the forecast.
// Plain JavaScript only (no Vue), so everything here can be unit-tested with node:test.
// Used by Home, Materials, Products, the Order log and New order, so the maths is only written once.
// (The forecast itself is worked out on the server, in server/services/forecast.js.)
//
// The server sends every day as text like "2026-10-24".
import { fullRecipe, calculateCanMake } from './capacity.js';

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

// Amounts in a unit people buy in: 30750 g → "31 kg", 2500 ml → "2.5 L", 350 cm → "3.5 m", 12 pieces → "12 pieces"
export function formatAmount(amount, unit) {
  if (unit === 'cm' && amount >= 100) {
    let metres = amount / 100;
    // 10 m and above: whole number. Below 10: one decimal, e.g. 3.5
    let shown = metres >= 10 ? Math.round(metres) : Math.round(metres * 10) / 10;
    return shown + ' m';
  }
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

// =====================================================
// BUYING FOR 1 WEEK / 2 WEEKS / 1 MONTH  (Materials "What to buy", Restock pop-up)
// =====================================================

// The choices on the "Buy enough for" switch
export const BUY_RANGES = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];

// How much of a material to buy so it lasts `days` days and stays above its low-stock level.
// The server gives the expected use for its whole forecast (30 days), so a shorter range
// gets the matching share of it: 7 days = 7/30 of the month's use.
//   buy = use in those days + low-stock level − what you have now
// For 30 days this is exactly the server's suggestedBuy.
export function buyAmountFor(m, days, forecastDays) {
  let use = (m.expectedUse || 0) * (days / forecastDays);
  let need = use + (m.lowStockThreshold || 0) - m.quantity;
  return Math.max(0, Math.ceil(need));
}

// The "What to buy" list for a range: materials to act on within `days`,
// each with how much to buy and the day that amount lasts until.
// Materials with nothing to buy (amount 0) are left out.
export function restockPlanFor(forecast, days) {
  if (!forecast) {
    return [];
  }
  let rows = [];
  for (let r of restockWithin(forecast, days)) {
    let amount = buyAmountFor(r, days, forecast.forecastDays);
    if (amount === 0) {
      continue;
    }
    rows.push({
      ...r,
      buyAmount: amount,                       // in the material's own unit, e.g. 9000 (g)
      buyText: formatAmount(amount, r.unit),   // e.g. "9 kg"
      enoughUntil: addDays(forecast.today, days),
    });
  }
  return rows;
}

// One material as a restock row (for a "Restock" button outside the What to buy list,
// e.g. "Short 3 Banana bread → Restock Bananas" on Home). Buys enough for a week.
export function restockRowFor(forecast, materialId) {
  if (!forecast) {
    return null;
  }
  let m = forecast.materials.find((x) => x.id === materialId);
  if (!m) {
    return null;
  }
  let amount = buyAmountFor(m, 7, forecast.forecastDays);
  return { ...m, buyAmount: amount, buyText: formatAmount(amount, m.unit), enoughUntil: addDays(forecast.today, 7) };
}

// =====================================================
// UNITS FOR TYPING AMOUNTS  (Restock pop-up: "9 kg" instead of "9000 g")
// =====================================================

// The units a seller can type an amount in. `times` turns it back into the material's unit.
export function unitChoices(unit) {
  if (unit === 'g') return [{ label: 'kg', times: 1000 }, { label: 'g', times: 1 }];
  if (unit === 'ml') return [{ label: 'L', times: 1000 }, { label: 'ml', times: 1 }];
  if (unit === 'cm') return [{ label: 'm', times: 100 }, { label: 'cm', times: 1 }];
  return [{ label: unit, times: 1 }];
}

// The unit an amount is easiest to read in: 9000 g → kg, 60 ml → ml
export function bestUnitChoice(amount, unit) {
  let choices = unitChoices(unit);
  let big = choices[0];
  if (choices.length > 1 && amount >= big.times) {
    return big;
  }
  return choices[choices.length - 1];
}

// =====================================================
// THIS WEEK  (Home "This week" day cards)
// =====================================================

// The next 7 days starting today: items ordered, extra expected, and baking time.
//   products = from /api/products (for "time to make")
export function buildWeekDays(forecast, products) {
  if (!forecast) {
    return [];
  }
  let items = forecast.products.items;
  let wholeProducts = items.filter((i) => i.variant === null);
  let holidays = forecast.holidays || [];

  let days = [];
  for (let i = 0; i < 7; i++) {
    let date = addDays(forecast.today, i);
    let day = { index: i, date: date, orders: 0, extra: 0, minutes: 0, holiday: holidays.includes(date) };

    for (let item of wholeProducts) {
      let f = dayForecast(items, item.id, i);
      if (f === null) continue;
      day.orders += f.orders;
      day.extra += f.extra;

      let product = products.find((p) => String(p.id || p._id) === item.productId);
      if (product && product.makingTimeMins) {
        day.minutes += f.total * product.makingTimeMins;
      }
    }
    days.push(day);
  }
  return days;
}

// The day with the most baking time (or the most items if no product has a time). null if all empty.
export function busiestOf(days) {
  let best = null;
  let score = (d) => (d.minutes > 0 ? d.minutes : d.orders + d.extra);
  for (let d of days) {
    if (score(d) > 0 && (best === null || score(d) > score(best))) {
      best = d;
    }
  }
  return best;
}

// Minutes → "~45 min" or "~2.5 h", or "—" for none
export function formatTime(minutes) {
  if (minutes <= 0) return '—';
  if (minutes < 60) return '~' + Math.round(minutes) + ' min';
  return '~' + Math.round(minutes / 30) / 2 + ' h';
}

// =====================================================
// TOMORROW'S STOCK CHECK  (Home "Needs your attention", Products)
// =====================================================

// Every product / variant we may not have enough of tomorrow.
// Orders already logged had their ingredients taken out of stock when logged,
// so "can make" only has to cover the EXTRA expected:  short = extra − can make.
// Returns [{ name, orders, extra, canMake, short, limitedBy, limitedById }]
export function tomorrowShortages(forecast, products, materials) {
  if (!forecast) {
    return [];
  }
  let items = forecast.products.items;
  let list = [];

  for (let product of products) {
    let pid = String(product.id || product._id);
    let variants = product.variants || [];
    let options = [{ rowId: variants.length > 0 ? pid + ':regular' : pid, name: 'Regular', variant: null }];
    for (let v of variants) {
      options.push({ rowId: pid + ':' + v._id, name: v.name, variant: v });
    }

    for (let option of options) {
      let f = dayForecast(items, option.rowId, 1); // 1 = tomorrow
      if (f === null) continue;
      let result = calculateCanMake(fullRecipe(product, option.variant), materials);
      if (result.canMake === null) continue; // nothing countable in the recipe
      let short = f.extra - result.canMake;
      if (short > 0) {
        let limiting = materials.find((m) => m.name === result.limitedBy);
        list.push({
          name: variants.length > 0 ? product.name + ' (' + option.name + ')' : product.name,
          orders: f.orders,
          extra: f.extra,
          canMake: result.canMake,
          short: short,
          limitedBy: result.limitedBy,
          limitedById: limiting ? limiting.id : null,
        });
      }
    }
  }
  return list;
}

// =====================================================
// ONE ORDER LINE  (New order: "You can make 30 ✓" / "You can only make 2 …")
// =====================================================

// Can we make `quantity` of this product/variant with the stock we have?
// Returns { canMake, enough, limitedBy, limitedById, left, perUnit, unit } or null (nothing to check)
//   left / perUnit = the bottleneck material: "300 g left, 150 g each"
export function checkOrderLine(product, variant, quantity, materials) {
  if (!product) {
    return null;
  }
  let recipe = fullRecipe(product, variant || null);
  let result = calculateCanMake(recipe, materials);
  if (result.canMake === null) {
    return null;
  }
  let limiting = materials.find((m) => m.name === result.limitedBy) || null;
  let line = limiting ? recipe.find((l) => l.material === limiting.id) : null;

  // How much more of the bottleneck material this order needs (for a Restock button)
  let needToBuy = 0;
  if (limiting && line) {
    needToBuy = Math.max(0, quantity * line.amountPerUnit - limiting.quantity);
  }

  return {
    canMake: result.canMake,
    enough: quantity <= result.canMake,
    limitedBy: result.limitedBy,
    limitedById: limiting ? limiting.id : null,
    left: limiting ? formatAmount(limiting.quantity, limiting.unit) : null,
    perUnit: line ? formatAmount(line.amountPerUnit, limiting.unit) : null,
    // A row for <RestockModal>: the bottleneck material, pre-filled with what this order needs
    restockRow: limiting ? { ...limiting, buyAmount: needToBuy } : null,
  };
}

// =====================================================
// HOME "NEEDS YOUR ATTENTION" ROWS
// =====================================================

// The forecast's rows for <AttentionList>. Add your own rows (e.g. overdue orders) before or after.
// Button keys (AttentionList handles these itself):
//   'short:<materialId>' → Materials, with that material highlighted in "What to buy"
//   'restock-week'       → Materials ("What to buy" is the shopping list)
//   'all-good'           → Products
export function forecastAttentionItems(forecast, products, materials) {
  if (!forecast) {
    return [];
  }
  let rows = [];

  // 1. Not enough stock for tomorrow (one row per product we may be short of)
  let shortages = tomorrowShortages(forecast, products, materials);
  for (let s of shortages) {
    rows.push({
      key: 'short:' + s.limitedById,
      tone: 'red',
      icon: '⚠️',
      title: 'Short ' + s.short + ' ' + s.name + ' tomorrow',
      text: (s.canMake === 0 ? 'Out of ' : 'Not enough ') + s.limitedBy,
      actionLabel: 'What to buy',
      primary: true,
    });
  }

  // 2. All good for tomorrow (so the seller knows the check ran)
  let week = buildWeekDays(forecast, products);
  if (shortages.length === 0 && week.length > 1) {
    let tomorrow = week[1];
    let total = tomorrow.orders + tomorrow.extra;
    rows.push({
      key: 'all-good',
      tone: 'green',
      icon: '✅',
      title: 'Enough stock for tomorrow',
      text: 'All ' + total + ' item' + (total === 1 ? '' : 's') + ' due on ' + formatDay(tomorrow.date) + ' (ordered + expected) can be made',
      actionLabel: 'Check',
      primary: false,
    });
  }

  // 3. Materials to buy this week
  let toBuy = restockPlanFor(forecast, 7);
  if (toBuy.length > 0) {
    rows.push({
      key: 'restock-week',
      tone: 'amber',
      icon: '🛒',
      title: toBuy.length + ' material' + (toBuy.length === 1 ? '' : 's') + ' to buy this week',
      text: toBuy.map((r) => r.name + (r.alreadyLow ? ' (low now)' : '')).join(', '),
      actionLabel: 'See list',
      primary: true,
    });
  }

  // 4. Busiest day this week, and when to prep for it
  let busiest = busiestOf(week);
  if (busiest !== null) {
    let name = weekdayName(busiest.date);
    let prep = busiest.index === 0 ? 'so it starts today' : busiest.index === 1 ? 'so prep today' : 'so prep on ' + weekdayName(addDays(busiest.date, -1));
    rows.push({
      key: 'busiest',
      tone: 'purple',
      icon: '🔥',
      title: (busiest.index === 0 ? 'Today' : name) + ' is your busiest day',
      text: (busiest.minutes > 0 ? formatTime(busiest.minutes) + ' of baking, ' : (busiest.orders + busiest.extra) + ' items, ') + prep,
    });
  }

  return rows;
}