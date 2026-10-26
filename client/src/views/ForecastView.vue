<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import '../assets/inventory.css'; // shared styles (the forecast styles are in section 6)
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

const selectedDay = ref(1);    // which day card is selected: 1 = tomorrow ... 7

// "Next 30 days by product" section
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
// For each of the next 7 days: orders, expected extra, and baking time.
// Baking time = (orders + expected extra) × the product's "time to make".
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

// Totals for the summary bar
const weekOrders = computed(() => weekDays.value.reduce((sum, d) => sum + d.orders, 0));
const weekExtra = computed(() => weekDays.value.reduce((sum, d) => sum + d.extra, 0));

// Materials that are already low, or go low / run out within the week
const buyThisWeek = computed(() => restockWithin(forecast.value, WEEK_DAYS));

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
// 6. NEXT 30 DAYS BY PRODUCT (folded section)
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

// Material 30 days forecast

// Material rows from the server (it's a plain array, not { items })
const materialItems = computed(() => {
  if (forecast.value === null || !forecast.value.materials) return [];
  return forecast.value.materials;
});

const restockPlan = computed(() => buildRestockPlan(forecast.value));

// Grouped by urgency
const restockGroups = computed(() => {
  let defs = [
    { label: '🔴 Already low', test: (r) => r.alreadyLow },
    { label: 'Within a week', test: (r) => !r.alreadyLow && r.actIn <= 7 },
    { label: 'Week 2 (days 8–14)', test: (r) => !r.alreadyLow && r.actIn > 7 && r.actIn <= 14 },
    { label: 'Weeks 3–4 (days 15–30)', test: (r) => !r.alreadyLow && r.actIn > 14 },
  ];
  return defs
    .map((d) => ({ label: d.label, rows: restockPlan.value.filter(d.test) }))
    .filter((g) => g.rows.length > 0);
});

const showRestock = ref(false);

</script>

<template>
  <div class="inv-page" data-testid="page-forecast">

    <header class="page-header">
      <div>
        <h1>Forecast</h1>
        <p v-if="weekDays.length > 0">
          This week, {{ formatDay(weekDays[0].date) }} – {{ formatDay(weekDays[weekDays.length - 1].date) }}:
          what's ordered, what to expect, and how much work it is
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

      <!-- ===== Summary bar ===== -->
      <div class="wk-summary mb-4">
        <span v-if="busiestDay !== null" class="wk-summary__item">
          🔥 Busiest: <strong>{{ weekdayName(busiestDay.date) }}</strong>
          <template v-if="busiestDay.minutes > 0">, {{ formatTime(busiestDay.minutes) }} of baking</template>
        </span>
        <span class="wk-summary__item">
          📦 <strong>{{ weekOrders }}</strong> order(s) · <strong>~{{ weekExtra }}</strong> more expected
        </span>
        <span class="wk-summary__item">
          🛒 <strong>{{ buyThisWeek.length }}</strong> material(s) need restocking this week
        </span>
      </div>

      <!-- ===== 7 day cards ===== -->
      <div class="wk-strip mb-2">
        <button v-for="day in weekDays" :key="day.date" type="button" class="wk-day"
          :class="{ 'is-selected': selectedDay === day.index }" :aria-pressed="selectedDay === day.index"
          @click="selectedDay = day.index">
          <span class="wk-day__name">{{ day.index === 1 ? 'Tomorrow' : weekdayName(day.date).slice(0, 3) }}</span>
          <span class="wk-day__date">{{ formatDay(day.date) }}</span>

          <span class="wk-bars" aria-hidden="true">
            <span class="wk-bars__extra" :style="{ height: barHeight(day.extra) + 'px' }"></span>
            <span class="wk-bars__orders" :style="{ height: barHeight(day.orders) + 'px' }"></span>
          </span>

          <span class="wk-day__nums"><strong>{{ day.orders }}</strong> order(s)<br />+ ~{{ day.extra }} expected</span>
          <span class="wk-day__time" :class="{ 'is-busy': busiestDay !== null && busiestDay.date === day.date }">
            ⏱ {{ formatTime(day.minutes) }}
          </span>
          <span v-if="busiestDay !== null && busiestDay.date === day.date" class="wk-tag wk-tag--busy">Busiest
            day</span>
          <span v-if="day.holiday" class="wk-tag wk-tag--holiday" title="Orders may be higher or lower than usual">
            Public holiday*
          </span>
        </button>
      </div>
      <p class="inv-meta mb-4">
        <span class="fc-key fc-key--orders"></span>Orders already logged
        <span class="fc-key fc-key--extra ms-3"></span>Expected extra
        <template v-if="weekDays.some((d) => d.holiday)">
          · *On public holidays, orders may be higher or lower than usual.
        </template>
      </p>

      <div class="wk-two mb-4">

        <!-- ===== The selected day ===== -->
        <section class="sk-card">
          <h2 class="fc-panel-title">{{ formatDay(selectedDate) }}</h2>
          <p class="inv-meta mb-2">Click a day above to see it here</p>

          <p v-if="dayRows.length === 0" class="inv-meta">Nothing ordered or expected for this day.</p>

          <div v-else class="table-responsive">
            <table class="fc-table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Expected extra</th>
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

          <p v-if="showCanMake" class="fc-note">
            "Can make now" already has the logged orders taken out of stock, so it's compared with the
            <strong>expected extra</strong> only.
          </p>
          <p v-else class="fc-note">"Can make now" is only shown for tomorrow, because your stock will change before
            then.</p>
          <p v-if="missingTime.length > 0" class="fc-note">
            Not in the time: {{ missingTime.join(', ') }} (no "time to make" set).
          </p>
        </section>

        <!-- ===== Buy this week ===== -->
        <section class="sk-card">
          <h2 class="fc-panel-title mb-2">🛒 Buy this week</h2>
          <p v-if="buyThisWeek.length === 0" class="inv-meta">Nothing needs restocking this week.</p>
          <div v-for="item in buyThisWeek" :key="item.id" class="fc-buy">
            <div>
              <strong>{{ item.name }}</strong>
              <div class="inv-meta">
                {{ restockStatusText(item) }}
                <template v-if="item.amountText"> · buy ~{{ item.amountText }}</template>
              </div>
            </div>
            <span v-if="item.actOn === null" class="fc-buy__when is-red">Today</span>
            <span v-else class="fc-buy__when">by {{ formatDay(item.actOn) }}</span>
          </div>
          <RouterLink to="/materials" class="fc-link d-inline-block mt-2">All materials →</RouterLink>
        </section>
      </div>

      <!-- ===== Next 30 days by product (folded) ===== -->
      <button type="button" class="fc-details" :aria-expanded="showDetails" @click="showDetails = !showDetails">
        <span>{{ showDetails ? '▾' : '▸' }} Next 30 days by product</span>
        <span class="fc-details__hint">For planning further ahead</span>
      </button>

      <section v-if="showDetails" class="sk-card mt-3">
        <p v-if="productItems.length === 0" class="inv-meta">No products to forecast yet.</p>

        <template v-else>
          <div class="fc-toolbar">
            <div>
              <h2 class="fc-panel-title">{{ chartItem.name }}</h2>
              <span class="inv-meta">All options · click a product in the table to show it here</span>
            </div>
            <div class="fc-seg" role="group" aria-label="Show by">
              <button type="button" :class="{ 'is-on': chartView === 'week' }" @click="chartView = 'week'">Week</button>
              <button type="button" :class="{ 'is-on': chartView === 'day' }" @click="chartView = 'day'">Day</button>
            </div>
          </div>

          <!-- Bar chart: dark = orders already logged, light = expected extra -->
          <svg class="fc-chart" :viewBox="`0 0 ${CHART_W} ${CHART_H}`" role="img"
            :aria-label="`Expected sales of ${chartItem.name} by ${chartView}`">
            <g v-for="line in chartGrid" :key="line.y">
              <line class="fc-chart__grid" :x1="CHART_LEFT" :x2="CHART_W" :y1="line.y" :y2="line.y" />
              <text class="fc-chart__label" :x="CHART_LEFT - 6" :y="line.y + 4" text-anchor="end">{{ line.value
                }}</text>
            </g>
            <g v-for="(bar, i) in chartShapes" :key="i">
              <rect class="fc-chart__extra" :x="bar.x" :y="bar.extraY" :width="bar.width" :height="bar.extraH" rx="2" />
              <rect class="fc-chart__orders" :x="bar.x" :y="bar.ordersY" :width="bar.width" :height="bar.ordersH"
                rx="2" />
              <text v-if="bar.top" class="fc-chart__top" :x="bar.centre" :y="bar.extraY - 6" text-anchor="middle">{{
                bar.top }}</text>
              <text v-if="bar.label" class="fc-chart__label" :x="bar.centre" :y="CHART_H - 10" text-anchor="middle">{{
                bar.label }}</text>
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
                  <tr class="is-clickable" :class="{ 'is-selected': chartItem.id === item.id }"
                    @click="selectProduct(item.id)">
                    <td>
                      <span class="fc-caret">
                        <template v-if="variantItems(item.id).length > 0">{{ openProducts.includes(item.id) ? '▾' : '▸'
                          }}</template>
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

      <button type="button" class="fc-details mt-3" :aria-expanded="showRestock" @click="showRestock = !showRestock">
        <span>{{ showRestock ? '▾' : '▸' }} Restock plan: next 30 days</span>
        <span class="fc-details__hint">{{ restockPlan.length }} material(s) going low or running out</span>
      </button>

      <section v-if="showRestock" class="sk-card mt-3">
        <p v-if="restockPlan.length === 0" class="inv-meta">
          Nothing is expected to go low or run out in the next 30 days.
        </p>

        <div v-for="group in restockGroups" :key="group.label" class="mb-3">
          <h3 class="fc-panel-title mb-2">{{ group.label }}</h3>
          <div v-for="m in group.rows" :key="m.id" class="fc-buy">
            <div>
              <strong>{{ m.name }}</strong>
              <div class="inv-meta">
                {{ m.quantity }} {{ m.unit }} in stock
                <template v-if="m.alreadyLow"> · already at or below the low-stock level</template>
                <template v-else-if="m.runsLowOn"> · low by {{ formatDay(m.runsLowOn) }}</template>
                <template v-if="m.runsOutOn"> · runs out {{ formatDay(m.runsOutOn) }}</template>
              </div>
            </div>
            <span class="fc-buy__when" :class="{ 'is-red': m.alreadyLow || m.actIn <= 7 }">
              {{ m.amountText ? 'Buy ~' + m.amountText : '—' }}
            </span>
          </div>
        </div>

        <p class="fc-note">
          Based on your usual weekday pattern, so it's an estimate. "Buy" is the amount that
          covers the full 30 days and keeps you above the low-stock level.
        </p>
      </section>

    </template>
  </div>
</template>