<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import '../assets/inventory.css'; // shared styles (section 6 has the day cards, tables and chart)
import '../assets/forecast.css';  // this page's layout: tiles, tabs, cards, status pills
import InfoTip from '../components/InfoTip.vue';
import { fullRecipe, calculateCanMake } from '../utils/capacity.js';
import {
  addDays, formatDay, weekdayName, dayForecast, buildRestockPlan, restockWithin, restockStatusText,
} from '../utils/forecast.js';

// =====================================================
// 1. DATA
// =====================================================
const forecast = ref(null);    // the 30-day forecast from the server (null = not loaded yet)
const products = ref([]);      // for making time, variants and "can make"
const materials = ref([]);     // for "can make"
const errorMessage = ref('');

const activeTab = ref('orders');   // 'orders' or 'materials'
const selectedDay = ref(1);        // which day card is selected: 1 = tomorrow ... 7
const restockRange = ref('week');  // Materials tab: 'week' or 'month' (next 30 days)

// "Products · next 30 days" section
const showDetails = ref(false);        // folded away at first
const chartView = ref('week');         // 'week' or 'day'
const chartProductId = ref(null);      // which product the chart shows (null = the first one)
const openProducts = ref([]);          // products whose variant rows are opened in the table

const WEEK_DAYS = 7;

// =====================================================
// 2. LOAD EVERYTHING
// =====================================================
async function loadData() {
  try {
    let forecastResponse = await axios.get('/api/materials/forecast');
    let productsResponse = await axios.get('/api/products');
    let materialsResponse = await axios.get('/api/materials');

    forecast.value = forecastResponse.data;
    products.value = productsResponse.data;
    materials.value = materialsResponse.data;
  } catch (error) {
    errorMessage.value = getErrorText(error);
  }
}

onMounted(() => {
  loadData();
});

function getErrorText(error) {
  if (error.response && error.response.data && error.response.data.message) {
    return error.response.data.message;
  }
  return error.message;
}

// =====================================================
// 3. SMALL HELPERS
// =====================================================

// The forecast rows for whole products (not the variant rows)
const productItems = computed(() => {
  if (forecast.value === null) {
    return [];
  }
  return forecast.value.products.items.filter((item) => item.variant === null);
});

// The product (from /api/products) with this id, or null
function productById(id) {
  let found = products.value.find((p) => p.id === id);
  return found || null;
}

// Public holidays the server sent (empty if it doesn't send them)
function isHoliday(dateKey) {
  if (forecast.value === null || !forecast.value.holidays) {
    return false;
  }
  return forecast.value.holidays.includes(dateKey);
}

// Minutes → "~45 min" or "~11 h" / "~2.5 h"
function formatTime(minutes) {
  if (minutes <= 0) return '—';
  if (minutes < 60) return '~' + Math.round(minutes) + ' min';
  return '~' + Math.round(minutes / 30) / 2 + ' h'; // rounded to the nearest half hour
}

// How many of one product/variant can be made with today's stock
function canMakeOf(product, variant) {
  return calculateCanMake(fullRecipe(product, variant), materials.value).canMake;
}

// =====================================================
// 4. THIS WEEK (the 7 day cards)
// =====================================================
// For each of the next 7 days: ordered, expected more, and baking time.
// Baking time = (ordered + expected more) × the product's "time to make".
const weekDays = computed(() => {
  if (forecast.value === null) {
    return [];
  }

  let days = [];
  for (let i = 1; i <= WEEK_DAYS; i++) {
    let date = addDays(forecast.value.today, i);
    let orders = 0;
    let extra = 0;
    let minutes = 0;

    for (let item of productItems.value) {
      let f = dayForecast(forecast.value.products.items, item.id, i);
      if (f === null) {
        continue;
      }
      orders = orders + f.orders;
      extra = extra + f.extra;

      let product = productById(item.productId);
      if (product && product.makingTimeMins) {
        minutes = minutes + f.total * product.makingTimeMins;
      }
    }

    days.push({
      index: i,
      date: date,
      orders: orders,
      extra: extra,
      minutes: minutes,
      holiday: isHoliday(date),
    });
  }
  return days;
});

// The day with the most baking time (or the most items, if no product has a making time)
const busiestDay = computed(() => {
  let best = null;
  for (let day of weekDays.value) {
    let score = day.minutes > 0 ? day.minutes : day.orders + day.extra;
    let bestScore = best === null ? 0 : (best.minutes > 0 ? best.minutes : best.orders + best.extra);
    if (score > bestScore) {
      best = day;
    }
  }
  return best;
});

function isBusiest(day) {
  return busiestDay.value !== null && busiestDay.value.date === day.date;
}

// Height of the bars on a day card (in px): biggest day = 90px
const tallestDay = computed(() => {
  let max = 1;
  for (let day of weekDays.value) {
    max = Math.max(max, day.orders + day.extra);
  }
  return max;
});

function barHeight(amount) {
  return Math.round((amount / tallestDay.value) * 90);
}

// Totals for the summary tiles
const weekOrders = computed(() => weekDays.value.reduce((sum, d) => sum + d.orders, 0));
const weekExtra = computed(() => weekDays.value.reduce((sum, d) => sum + d.extra, 0));

// Products with no "time to make", so they're not in the baking time
const missingTime = computed(() => {
  return products.value.filter((p) => !p.makingTimeMins).map((p) => p.name);
});

// =====================================================
// 5. THE SELECTED DAY (table under the day cards)
// =====================================================
const selectedDate = computed(() => {
  if (forecast.value === null) return '';
  return addDays(forecast.value.today, selectedDay.value);
});

// "Can make now" only makes sense for tomorrow: stock will change before later days
const showCanMake = computed(() => selectedDay.value === 1);

// One row per product, plus a row per variant that has orders or expected sales
const dayRows = computed(() => {
  if (forecast.value === null) {
    return [];
  }
  let items = forecast.value.products.items;
  let rows = [];

  for (let item of productItems.value) {
    let product = productById(item.productId);
    let f = dayForecast(items, item.id, selectedDay.value);
    if (!product || f === null) {
      continue;
    }
    let hasVariants = product.variants.length > 0;
    let minutes = product.makingTimeMins ? f.total * product.makingTimeMins : 0;

    rows.push({
      key: item.id,
      name: product.name,
      isVariant: false,
      orders: f.orders,
      extra: f.extra,
      // Products with variants show "can make" on each variant row instead
      canMake: hasVariants ? null : canMakeOf(product, null),
      minutes: minutes,
    });

    if (hasVariants) {
      // Regular first, then each variant
      let options = [{ id: item.productId + ':regular', name: 'Regular', variant: null }];
      for (let v of product.variants) {
        options.push({ id: item.productId + ':' + v._id, name: v.name, variant: v });
      }

      for (let option of options) {
        let vf = dayForecast(items, option.id, selectedDay.value);
        if (vf === null || vf.total === 0) {
          continue; // nothing expected for this variant that day
        }
        rows.push({
          key: option.id,
          name: option.name,
          isVariant: true,
          orders: vf.orders,
          extra: vf.extra,
          canMake: canMakeOf(product, option.variant),
          minutes: product.makingTimeMins ? vf.total * product.makingTimeMins : 0,
        });
      }
    }
  }
  return rows;
});

// Totals row
const dayTotals = computed(() => {
  let totals = { orders: 0, extra: 0, minutes: 0 };
  for (let row of dayRows.value) {
    if (row.isVariant) continue; // variants are already inside their product's numbers
    totals.orders = totals.orders + row.orders;
    totals.extra = totals.extra + row.extra;
    totals.minutes = totals.minutes + row.minutes;
  }
  return totals;
});

// "Can make now" already has the logged orders taken out of stock,
// so it only needs to cover the EXTRA expected.
function shortBy(row) {
  if (row.canMake === null) return 0;
  return Math.max(0, row.extra - row.canMake);
}

// =====================================================
// 6. PRODUCTS · NEXT 30 DAYS (folded section)
// =====================================================

// Table: tomorrow, next 7 days, next 30 days for one forecast row
function totalsFor(itemId) {
  let item = forecast.value.products.items.find((i) => i.id === itemId);
  if (!item) {
    return { tomorrow: 0, week: 0, month: 0 };
  }
  let sum = (from, to) => {
    let total = 0;
    for (let i = from; i < to && i < item.daily.length; i++) {
      total = total + Math.max(item.daily[i].expected, item.daily[i].booked);
    }
    return Math.round(total);
  };
  return { tomorrow: sum(1, 2), week: sum(1, 1 + WEEK_DAYS), month: sum(0, item.daily.length) };
}

// The variant rows of one product (Regular + each variant)
function variantItems(productId) {
  return forecast.value.products.items.filter((i) => i.productId === productId && i.variant !== null);
}

// Click a product in the table: show it in the chart, and open/close its variants
function selectProduct(productId) {
  chartProductId.value = productId;
  if (openProducts.value.includes(productId)) {
    openProducts.value = openProducts.value.filter((id) => id !== productId);
  } else {
    openProducts.value.push(productId);
  }
}

// The product the chart shows
const chartItem = computed(() => {
  if (productItems.value.length === 0) return null;
  let found = productItems.value.find((i) => i.id === chartProductId.value);
  return found || productItems.value[0];
});

// The bars: one per day, or one per week (7 days added up)
const chartBars = computed(() => {
  if (chartItem.value === null) {
    return [];
  }
  let daily = chartItem.value.daily;
  let bars = [];

  if (chartView.value === 'day') {
    for (let i = 0; i < daily.length; i++) {
      let extra = Math.max(0, Math.round(daily[i].expected - daily[i].booked));
      bars.push({
        orders: daily[i].booked,
        extra: extra,
        // label every 7th day, starting tomorrow
        label: i % 7 === 1 ? shortDate(daily[i].date) : '',
        top: i === 1 ? 'Tomorrow' : '',
      });
    }
  } else {
    for (let start = 0; start < daily.length; start += 7) {
      let chunk = daily.slice(start, start + 7);
      let orders = 0;
      let extra = 0;
      for (let d of chunk) {
        orders = orders + d.booked;
        extra = extra + Math.max(0, Math.round(d.expected - d.booked));
      }
      let label = shortDate(chunk[0].date) + '–' + shortDate(chunk[chunk.length - 1].date);
      if (chunk.length < 7) {
        label = label + ' (' + chunk.length + ' days)';
      }
      bars.push({ orders: orders, extra: extra, label: label, top: '~' + (orders + extra) });
    }
  }
  return bars;
});

// "2026-10-24" → "24 Oct"
function shortDate(key) {
  let date = new Date(key + 'T00:00:00');
  return date.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' });
}

// Chart size (the SVG stretches to fit the page)
const CHART_W = 1000;
const CHART_H = 240;
const CHART_LEFT = 30;   // space for the numbers on the left
const CHART_BOTTOM = 30; // space for the dates at the bottom
const CHART_TOP = 20;    // space for the number above the tallest bar

const chartMax = computed(() => {
  let max = 1;
  for (let bar of chartBars.value) {
    max = Math.max(max, bar.orders + bar.extra);
  }
  return max;
});

// Where each bar goes, in SVG units
const chartShapes = computed(() => {
  let count = chartBars.value.length;
  if (count === 0) return [];
  let slot = (CHART_W - CHART_LEFT) / count;
  let width = slot * (chartView.value === 'day' ? 0.65 : 0.5);
  let scale = (CHART_H - CHART_BOTTOM - CHART_TOP) / chartMax.value;
  let base = CHART_H - CHART_BOTTOM;

  return chartBars.value.map((bar, i) => {
    let x = CHART_LEFT + slot * i + (slot - width) / 2;
    let ordersH = bar.orders * scale;
    let extraH = bar.extra * scale;
    return {
      x: x,
      width: width,
      centre: x + width / 2,
      ordersY: base - ordersH,
      ordersH: ordersH,
      extraY: base - ordersH - extraH,
      extraH: extraH,
      label: bar.label,
      top: bar.top,
    };
  });
});

// Grid lines: 0, ½ and the top
const chartGrid = computed(() => {
  let lines = [];
  for (let step = 0; step <= 2; step++) {
    let value = Math.round((chartMax.value * step) / 2);
    let y = CHART_H - CHART_BOTTOM - ((CHART_H - CHART_BOTTOM - CHART_TOP) * step) / 2;
    lines.push({ y: y, value: value });
  }
  return lines;
});

// =====================================================
// 7. MATERIALS TAB: RESTOCK PLAN
// =====================================================

// Everything that's low now, or goes low / runs out within 30 days (soonest first)
const restockPlan = computed(() => buildRestockPlan(forecast.value));

// Only the ones to act on within the next 7 days
const buyThisWeek = computed(() => restockWithin(forecast.value, WEEK_DAYS));
const alreadyLowCount = computed(() => buyThisWeek.value.filter((r) => r.alreadyLow).length);

// "Next 30 days" view: grouped by when to act
const restockGroups = computed(() => {
  let defs = [
    { label: 'Already low', test: (r) => r.alreadyLow },
    { label: 'This week', test: (r) => !r.alreadyLow && r.actIn <= 7 },
    { label: 'Next week (days 8–14)', test: (r) => !r.alreadyLow && r.actIn > 7 && r.actIn <= 14 },
    { label: 'Later this month (days 15–30)', test: (r) => !r.alreadyLow && r.actIn > 14 },
  ];
  return defs
    .map((d) => ({ label: d.label, rows: restockPlan.value.filter(d.test) }))
    .filter((g) => g.rows.length > 0);
});

// What the Materials tab shows: one group for "This week", or all groups for "Next 30 days"
const visibleGroups = computed(() => {
  if (restockRange.value === 'week') {
    return buyThisWeek.value.length > 0 ? [{ label: '', rows: buyThisWeek.value }] : [];
  }
  return restockGroups.value;
});

// Colour of the status pill. The same colours mean the same thing everywhere on the page:
//   red = now / today, orange = within 3 days, amber = this week, purple = later
function pillClass(r) {
  if (r.alreadyLow || r.actIn <= 0) return 'fc-pill--now';
  if (r.actIn <= 3) return 'fc-pill--soon';
  if (r.actIn <= 7) return 'fc-pill--week';
  return 'fc-pill--later';
}
</script>

<template>
  <div class="inv-page" data-testid="page-forecast">

    <header class="page-header">
      <div>
        <h1>Forecast</h1>
        <p v-if="weekDays.length > 0">
          {{ formatDay(weekDays[0].date) }} – {{ formatDay(weekDays[weekDays.length - 1].date) }}
          · based on your last 8 weeks of orders
        </p>
      </div>
    </header>

    <div v-if="errorMessage" class="inv-banner inv-banner--danger mb-3">{{ errorMessage }}</div>

    <p v-if="forecast === null && !errorMessage" class="inv-meta">Loading the forecast…</p>

    <template v-if="forecast !== null">

      <!-- No history yet = nothing to learn from -->
      <p v-if="forecast.historyOrderCount === 0" class="inv-banner inv-banner--info mb-3">
        📅 The forecast starts working once you have some completed orders. For now it only shows orders already logged.
      </p>

      <!-- ===================================================== -->
      <!-- SUMMARY TILES                                          -->
      <!-- ===================================================== -->
      <div class="fc-tiles">
        <div class="fc-tile">
          <span class="fc-tile__icon is-red" aria-hidden="true">🔥</span>
          <div>
            <div class="fc-tile__label">Busiest day</div>
            <template v-if="busiestDay !== null">
              <div class="fc-tile__value is-red">{{ formatDay(busiestDay.date) }}</div>
              <div class="fc-tile__sub">
                <template v-if="busiestDay.minutes > 0">{{ formatTime(busiestDay.minutes) }} of baking</template>
                <template v-else>{{ busiestDay.orders + busiestDay.extra }} items</template>
              </div>
            </template>
            <div v-else class="fc-tile__value">—</div>
          </div>
        </div>

        <div class="fc-tile">
          <span class="fc-tile__icon is-purple" aria-hidden="true">📦</span>
          <div>
            <div class="fc-tile__label">This week</div>
            <div class="fc-tile__value">{{ weekOrders }} ordered</div>
            <div class="fc-tile__sub">+ ~{{ weekExtra }} more expected</div>
          </div>
        </div>

        <div class="fc-tile">
          <span class="fc-tile__icon is-amber" aria-hidden="true">🛒</span>
          <div>
            <div class="fc-tile__label">To buy this week</div>
            <div class="fc-tile__value">{{ buyThisWeek.length }} material(s)</div>
            <div class="fc-tile__sub">
              <template v-if="alreadyLowCount > 0">{{ alreadyLowCount }} already low</template>
              <template v-else>None low yet</template>
            </div>
          </div>
        </div>
      </div>

      <!-- ===================================================== -->
      <!-- TABS                                                   -->
      <!-- ===================================================== -->
      <div class="fc-tabs" role="tablist" aria-label="Forecast">
        <button
          type="button"
          role="tab"
          class="fc-tab"
          :class="{ 'is-active': activeTab === 'orders' }"
          :aria-selected="activeTab === 'orders'"
          @click="activeTab = 'orders'"
        >
          📦 Orders
        </button>
        <button
          type="button"
          role="tab"
          class="fc-tab"
          :class="{ 'is-active': activeTab === 'materials' }"
          :aria-selected="activeTab === 'materials'"
          @click="activeTab = 'materials'"
        >
          🧂 Materials
          <span v-if="buyThisWeek.length > 0" class="fc-tab__count">{{ buyThisWeek.length }}</span>
        </button>
      </div>

      <!-- ===================================================== -->
      <!-- ORDERS TAB                                             -->
      <!-- ===================================================== -->
      <div v-if="activeTab === 'orders'" role="tabpanel">

        <!-- ===== Each day this week ===== -->
        <section class="sk-card fc-card fc-card--orders mb-3">
          <InfoTip label="How the day cards work">
            <strong>Dark</strong> = items already in your Order log, due that day.<br />
            <strong>Light</strong> = how many <strong>more</strong> usually come in for that weekday, learned from
            your last 8 weeks (recent weeks count more).<br />
            <strong>Time</strong> = all those items × each product's "time to make".
          </InfoTip>
          <h2 class="fc-card__title">Each day this week</h2>
          <p class="fc-card__hint">Click a day to see it below</p>

          <div class="wk-strip">
            <button
              v-for="day in weekDays"
              :key="day.date"
              type="button"
              class="wk-day"
              :class="{ 'is-selected': selectedDay === day.index, 'is-busiest': isBusiest(day) }"
              :aria-pressed="selectedDay === day.index"
              @click="selectedDay = day.index"
            >
              <span class="wk-day__name">{{ day.index === 1 ? 'Tomorrow' : weekdayName(day.date).slice(0, 3) }}</span>
              <span class="wk-day__date">{{ formatDay(day.date) }}</span>

              <span class="wk-bars" aria-hidden="true">
                <span class="wk-bars__extra" :style="{ height: barHeight(day.extra) + 'px' }"></span>
                <span class="wk-bars__orders" :style="{ height: barHeight(day.orders) + 'px' }"></span>
              </span>

              <span class="wk-day__nums"><strong>{{ day.orders }}</strong> ordered<br />+ ~{{ day.extra }} more</span>
              <span class="wk-day__time" :class="{ 'is-busy': isBusiest(day) }">⏱ {{ formatTime(day.minutes) }}</span>
              <span v-if="isBusiest(day)" class="wk-tag wk-tag--busy">Busiest</span>
              <span v-if="day.holiday" class="wk-tag wk-tag--holiday">Public holiday*</span>
            </button>
          </div>

          <p class="inv-meta mt-2 mb-0">
            <span class="fc-key fc-key--orders"></span>Already ordered
            <span class="fc-key fc-key--extra ms-3"></span>Expected more
            <template v-if="weekDays.some((d) => d.holiday)">
              · *On public holidays, orders may be higher or lower than usual.
            </template>
          </p>
        </section>

        <!-- ===== The selected day ===== -->
        <section class="sk-card fc-card fc-card--orders mb-3">
          <InfoTip label="How this table works">
            <template v-if="showCanMake">
              <strong>Can make now</strong> is worked out from today's stock. Orders you've logged already had their
              materials taken out, so we only check it against the <strong>expected more</strong>.
            </template>
            <template v-else>
              <strong>Can make now</strong> is only shown for tomorrow, because your stock will change before then.
            </template>
            <br /><strong>Time</strong> = items × "time to make".
          </InfoTip>
          <h2 class="fc-card__title">{{ formatDay(selectedDate) }}</h2>
          <p class="fc-card__hint">What to make<template v-if="showCanMake">, and whether you have enough</template></p>

          <p v-if="dayRows.length === 0" class="inv-meta">Nothing ordered or expected for this day.</p>

          <div v-else class="table-responsive">
            <table class="fc-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Ordered</th>
                  <th scope="col">Expected more</th>
                  <th v-if="showCanMake" scope="col">Can make now</th>
                  <th scope="col">Time</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in dayRows" :key="row.key" :class="{ 'is-variant': row.isVariant }">
                  <td>
                    <strong v-if="!row.isVariant">{{ row.name }}</strong>
                    <template v-else>{{ row.name }}</template>
                  </td>
                  <td>{{ row.orders }}</td>
                  <td>~{{ row.extra }}</td>
                  <td v-if="showCanMake">
                    <template v-if="row.canMake !== null">
                      {{ row.canMake }}
                      <span v-if="shortBy(row) > 0" class="fc-short">short by {{ shortBy(row) }}</span>
                      <span v-else class="fc-ok">✓ enough</span>
                    </template>
                  </td>
                  <td>{{ formatTime(row.minutes) }}</td>
                </tr>
                <tr class="is-total">
                  <td>Total</td>
                  <td>{{ dayTotals.orders }}</td>
                  <td>~{{ dayTotals.extra }}</td>
                  <td v-if="showCanMake"></td>
                  <td>{{ formatTime(dayTotals.minutes) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p v-if="missingTime.length > 0" class="fc-note">
            Not in the time: {{ missingTime.join(', ') }} (no "time to make" set).
          </p>
        </section>

        <!-- ===== Products · next 30 days (folded) ===== -->
        <button type="button" class="fc-details" :aria-expanded="showDetails" @click="showDetails = !showDetails">
          <span>{{ showDetails ? '▾' : '▸' }} Products · next 30 days</span>
          <span class="fc-details__hint">Demand per product, by week or day</span>
        </button>

        <section v-if="showDetails" class="sk-card fc-card fc-card--orders mt-3">
          <InfoTip label="How the 30-day chart works">
            Each bar is one day or one week. <strong>Dark</strong> = already ordered,
            <strong>light</strong> = expected more, based on your usual sales for each weekday.
            Click a product in the table to show it in the chart and open its variants.
          </InfoTip>
          <p v-if="productItems.length === 0" class="inv-meta">No products to forecast yet.</p>

          <template v-else>
            <div class="fc-toolbar">
              <div>
                <h2 class="fc-card__title">{{ chartItem.name }}</h2>
                <span class="inv-meta">All options · click a product in the table to show it here</span>
              </div>
              <div class="fc-seg" role="group" aria-label="Show by">
                <button type="button" :class="{ 'is-on': chartView === 'week' }" @click="chartView = 'week'">Week</button>
                <button type="button" :class="{ 'is-on': chartView === 'day' }" @click="chartView = 'day'">Day</button>
              </div>
            </div>

            <!-- Bar chart: dark = already ordered, light = expected more -->
            <svg
              class="fc-chart"
              :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
              role="img"
              :aria-label="`Expected sales of ${chartItem.name} by ${chartView}`"
            >
              <g v-for="line in chartGrid" :key="line.y">
                <line class="fc-chart__grid" :x1="CHART_LEFT" :x2="CHART_W" :y1="line.y" :y2="line.y" />
                <text class="fc-chart__label" :x="CHART_LEFT - 6" :y="line.y + 4" text-anchor="end">{{ line.value }}</text>
              </g>
              <g v-for="(bar, i) in chartShapes" :key="i">
                <rect class="fc-chart__extra" :x="bar.x" :y="bar.extraY" :width="bar.width" :height="bar.extraH" rx="2" />
                <rect class="fc-chart__orders" :x="bar.x" :y="bar.ordersY" :width="bar.width" :height="bar.ordersH" rx="2" />
                <text v-if="bar.top" class="fc-chart__top" :x="bar.centre" :y="bar.extraY - 6" text-anchor="middle">{{ bar.top }}</text>
                <text v-if="bar.label" class="fc-chart__label" :x="bar.centre" :y="CHART_H - 10" text-anchor="middle">{{ bar.label }}</text>
              </g>
            </svg>

            <div class="table-responsive mt-3">
              <table class="fc-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Tomorrow</th>
                    <th scope="col">Next 7 days</th>
                    <th scope="col">Next 30 days</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="item in productItems" :key="item.id">
                    <tr class="is-clickable" :class="{ 'is-selected': chartItem.id === item.id }" @click="selectProduct(item.id)">
                      <td>
                        <span class="fc-caret">
                          <template v-if="variantItems(item.id).length > 0">{{ openProducts.includes(item.id) ? '▾' : '▸' }}</template>
                        </span>
                        <strong>{{ item.name }}</strong>
                      </td>
                      <td>~{{ totalsFor(item.id).tomorrow }}</td>
                      <td>~{{ totalsFor(item.id).week }}</td>
                      <td>~{{ totalsFor(item.id).month }}</td>
                    </tr>
                    <template v-if="openProducts.includes(item.id)">
                      <tr v-for="v in variantItems(item.id)" :key="v.id" class="is-variant">
                        <td>{{ v.variant }}</td>
                        <td>~{{ totalsFor(v.id).tomorrow }}</td>
                        <td>~{{ totalsFor(v.id).week }}</td>
                        <td>~{{ totalsFor(v.id).month }}</td>
                      </tr>
                    </template>
                  </template>
                </tbody>
              </table>
            </div>
          </template>
        </section>
      </div>

      <!-- ===================================================== -->
      <!-- MATERIALS TAB                                          -->
      <!-- ===================================================== -->
      <div v-if="activeTab === 'materials'" role="tabpanel">
        <section class="sk-card fc-card fc-card--materials">
          <InfoTip label="How the restock plan works">
            <strong>Low in 3 days</strong> = the day this material is expected to drop below your low-stock level,
            if sales follow your usual weekly pattern.<br />
            <strong>Buy</strong> = enough for the next 30 days, so you stay above that level.<br />
            <span class="info-dot is-now"></span>Low now / today
            <span class="info-dot is-soon"></span>≤ 3 days
            <span class="info-dot is-week"></span>this week
            <span class="info-dot is-later"></span>later
          </InfoTip>

          <div class="fc-card__head">
            <div>
              <h2 class="fc-card__title">Restock plan</h2>
              <p class="fc-card__hint">Buy amounts last 30 days and keep you above your low-stock level</p>
            </div>
            <div class="fc-seg" role="group" aria-label="Show restocking for">
              <button type="button" :class="{ 'is-on': restockRange === 'week' }" @click="restockRange = 'week'">This week</button>
              <button type="button" :class="{ 'is-on': restockRange === 'month' }" @click="restockRange = 'month'">Next 30 days</button>
            </div>
          </div>

          <p v-if="visibleGroups.length === 0" class="inv-meta mt-2">
            <template v-if="restockRange === 'week'">Nothing needs restocking this week.</template>
            <template v-else>Nothing is expected to go low or run out in the next 30 days.</template>
          </p>

          <div v-for="group in visibleGroups" :key="group.label">
            <h3 v-if="group.label" class="fc-group">{{ group.label }}</h3>

            <div v-for="m in group.rows" :key="m.id" class="fc-rrow">
              <div class="fc-rrow__name">
                {{ m.name }}
                <span class="fc-pill" :class="pillClass(m)">{{ restockStatusText(m) }}</span>
              </div>
              <div class="fc-rrow__meta">
                {{ m.quantity }} {{ m.unit }} left
                <template v-if="m.lowStockThreshold != null"> · low below {{ m.lowStockThreshold }} {{ m.unit }}</template>
                <template v-if="m.runsOutOn"> · runs out {{ formatDay(m.runsOutOn) }}</template>
              </div>
              <div class="fc-rrow__buy">
                <strong>{{ m.amountText ? '~' + m.amountText : '—' }}</strong>
                <span v-if="m.actOn === null" class="is-red">today</span>
                <span v-else>by {{ formatDay(m.actOn) }}</span>
              </div>
            </div>
          </div>

          <RouterLink to="/materials" class="fc-link d-inline-block mt-3">All materials →</RouterLink>
        </section>
      </div>

    </template>
  </div>
</template>