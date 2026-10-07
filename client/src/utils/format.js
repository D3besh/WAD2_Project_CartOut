// Small display helpers shared by many components.

const UNIT_LABEL = { g: 'g', ml: 'ml', pieces: 'pcs' };

// formatQty(4500, 'g') → "4,500 g"   formatQty(1, 'pieces') → "1 pcs"
export function formatQty(n, unit) {
  const num = Number(n ?? 0).toLocaleString('en-SG', { maximumFractionDigits: 2 });
  return `${num} ${UNIT_LABEL[unit] ?? unit}`;
}

export const unitLabel = (unit) => UNIT_LABEL[unit] ?? unit;

// formatMoney(22) → "$22.00"
export function formatMoney(n) {
  return Number(n ?? 0).toLocaleString('en-SG', { style: 'currency', currency: 'SGD' }).replace('SGD', '$');
}

// "Today, 6:00 pm" / "Tomorrow, 2:00 pm" / "Thu 9 Oct, 11:00 am"
export function formatDue(date) {
  const d = new Date(date);
  const time = d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const today = new Date();
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
      new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000
  );
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;
  const day = d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

export const capitalise = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
