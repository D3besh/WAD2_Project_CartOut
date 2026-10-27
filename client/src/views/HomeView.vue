<script setup>
// Home dashboard: sales, estimated profit, orders and inventory.

import { ref, computed, onMounted } from "vue";
import axios from "axios";
import { fullRecipe, calculateCanMake } from "../utils/capacity.js";
import OrderCard from "../components/OrderCard.vue";

const shopName = ref("");
const loading = ref(true);
const errorMessage = ref("");

const materials = ref([]);
const products = ref([]);
const inventoryLoading = ref(true);
const inventoryError = ref("");

const now = new Date();

const today = now.toLocaleDateString("en-SG", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const hour = now.getHours();

const greeting =
  hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

async function loadShop() {
  errorMessage.value = "";
  loading.value = true;

  try {
    const response = await axios.get("/api/auth/me");
    shopName.value = response.data.shopName;
  } catch (error) {
    errorMessage.value =
      error.response?.data?.message || "Could not load your shop details.";
  } finally {
    loading.value = false;
  }
}

async function loadInventory() {
  inventoryLoading.value = true;
  inventoryError.value = "";

  try {
    const materialsResponse = await axios.get("/api/materials");
    const productsResponse = await axios.get("/api/products");

    materials.value = materialsResponse.data;
    products.value = productsResponse.data;
  } catch (error) {
    inventoryError.value =
      error.response?.data?.message || "Could not load materials and products.";
  } finally {
    inventoryLoading.value = false;
  }
}

// Same low-stock condition as MaterialsView
const lowMaterials = computed(() => {
  return materials.value.filter((material) => material.isLow);
});

// One entry per product or variant
const fewestProducts = computed(() => {
  const list = [];

  for (const product of products.value) {
    const variants = product.variants || [];

    if (variants.length === 0) {
      const result = calculateCanMake(
        fullRecipe(product, null),
        materials.value,
      );

      list.push({
        key: product.id,
        name: product.name,
        canMake: result.canMake,
        limitedBy: result.limitedBy,
        warnings: result.warnings || [],
      });
    } else {
      for (const [index, variant] of variants.entries()) {
        const result = calculateCanMake(
          fullRecipe(product, variant),
          materials.value,
        );

        list.push({
          key: product.id + "-" + index,
          name: product.name + " · " + variant.name,
          canMake: result.canMake,
          limitedBy: result.limitedBy,
          warnings: result.warnings || [],
        });
      }
    }
  }

  // Unknown capacity cannot be ranked.
  return list
    .filter((item) => Number.isFinite(item.canMake))
    .sort((a, b) => a.canMake - b.canMake)
    .slice(0, 5);
});

// Open Materials with its existing low-stock filter selected
function showLowMaterials() {
  localStorage.setItem("materialsShowLowOnly", "true");
}

// ===== Orders due today =====
const orders = ref([]);
const ordersLoading = ref(true);
const ordersError = ref("");

// Convert a date into a Singapore calendar-date string
function singaporeDate(value) {
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

const todaysOrders = computed(() => {
  const todayDate = singaporeDate(new Date());

  return orders.value
    .filter((order) => {
      return (
        order.status !== "completed" && singaporeDate(order.dueAt) === todayDate
      );
    })
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
});

async function loadOrders() {
  ordersLoading.value = true;
  ordersError.value = "";

  try {
    const response = await axios.get("/api/orders");
    orders.value = response.data;
  } catch (error) {
    ordersError.value =
      error.response?.data?.message || "Could not load orders.";
  } finally {
    ordersLoading.value = false;
  }
}

// ===== Dashboard settings =====
const dashboardPeriod = ref("all");
const showDashboardOptions = ref(false);
const dashboardPreferenceMessage = ref("");
const showAnalyticsDashboard = ref(true);

const dashboardOptions = [
  { id: "sales", label: "Total sales" },
  { id: "profit", label: "Estimated gross profit" },
  { id: "outstanding", label: "Outstanding orders" },
  { id: "trend", label: "Profit trend" },
];

const dashboardVisible = ref(dashboardOptions.map((option) => option.id));

onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem("cartoutDashboardCards"));

    if (Array.isArray(saved)) {
      dashboardVisible.value = dashboardOptions
        .map((option) => option.id)
        .filter((id) => saved.includes(id));
    }
  } catch {
    // Keep the default cards if browser storage is unavailable.
  }
});

onMounted(() => {
  try {
    const saved = localStorage.getItem("cartoutShowAnalyticsDashboard");

    if (saved !== null) {
      showAnalyticsDashboard.value = saved === "true";
    }
  } catch {
    // Keep dashboard visible if browser storage is unavailable.
  }
});

function saveAnalyticsVisibility() {
  try {
    localStorage.setItem(
      "cartoutShowAnalyticsDashboard",
      String(showAnalyticsDashboard.value),
    );
  } catch {
    // Setting still applies for this visit.
  }
}

function saveDashboardCards() {
  try {
    localStorage.setItem(
      "cartoutDashboardCards",
      JSON.stringify(dashboardVisible.value),
    );

    dashboardPreferenceMessage.value =
      "Your card choices are saved in this browser.";
  } catch {
    dashboardPreferenceMessage.value =
      "Choices applied for this visit, but could not be saved.";
  }
}

function resetDashboardCards() {
  dashboardVisible.value = dashboardOptions.map((option) => option.id);

  saveDashboardCards();
}

// ===== Dates and currency =====
function dashboardMonth(value) {
  if (!value) return "";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year").value;
  const month = parts.find((part) => part.type === "month").value;

  return `${year}-${month}`;
}

function dashboardMoney(value) {
  if (value === null) return "Unavailable";

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    currencyDisplay: "code",
  }).format(value);
}

function validDashboardAmount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// ===== Orders used for sales and profit =====
const dashboardCompletedOrders = computed(() => {
  const currentMonth = dashboardMonth(new Date());

  return orders.value.filter((order) => {
    if (order.status !== "completed") return false;

    if (dashboardPeriod.value === "all") return true;

    const month = dashboardMonth(order.dueAt);

    if (!month) return false;

    if (dashboardPeriod.value === "month") {
      return month === currentMonth;
    }

    return month.slice(0, 4) === currentMonth.slice(0, 4);
  });
});

const dashboardOutstanding = computed(() => {
  return orders.value.filter((order) =>
    ["in-progress", "ready"].includes(order.status),
  ).length;
});

// Calculate the cost of every item in an order.
// A missing cost is different from an explicitly entered cost of $0.
function dashboardOrderCost(order) {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return null;
  }

  let totalCost = 0;

  for (const item of order.items) {
    const product = item.product;

    if (
      !product ||
      typeof product !== "object" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0
    ) {
      return null;
    }

    let unitCost = product.cost;

    if (item.variantId || item.variant) {
      const variants = product.variants || [];

      // New orders use variant IDs.
      // Older orders may only have the variant name.
      const matches = variants.filter((variant) => {
        if (item.variantId) {
          return String(variant._id) === String(item.variantId);
        }

        return variant.name === item.variant;
      });

      // Do not guess the cost of a removed or ambiguous variant.
      if (matches.length !== 1) return null;

      unitCost = matches[0].cost ?? product.cost;
    }

    if (!validDashboardAmount(unitCost)) return null;

    totalCost += item.quantity * unitCost;
  }

  return Number.isFinite(totalCost) ? totalCost : null;
}

function calculateDashboardTotals(orderList) {
  let sales = 0;
  let profit = 0;
  let included = 0;
  let invalidPrices = 0;

  for (const order of orderList) {
    if (!validDashboardAmount(order.price)) {
      invalidPrices++;
      continue;
    }

    sales += order.price;

    const cost = dashboardOrderCost(order);

    if (cost !== null) {
      profit += order.price - cost;
      included++;
    }
  }

  return {
    sales: invalidPrices > 0 ? null : sales,
    profit: orderList.length > 0 && included === 0 ? null : profit,
    included,
    total: orderList.length,
    excluded: orderList.length - included,
  };
}

const dashboardTotals = computed(() => {
  return calculateDashboardTotals(dashboardCompletedOrders.value);
});

// ===== Summary cards =====
const dashboardSummaryCards = computed(() => {
  const cards = [
    {
      id: "sales",
      title: "Total sales",
      value: dashboardMoney(dashboardTotals.value.sales),
      note: "Completed orders, including unpaid sales.",
    },
    {
      id: "profit",
      title: "Estimated gross profit",
      value: dashboardMoney(dashboardTotals.value.profit),
      note: "Based on current product costs.",
    },
    {
      id: "outstanding",
      title: "Outstanding orders",
      value: dashboardOutstanding.value,
      note: "All current in-progress and ready orders.",
    },
  ];

  return cards.filter((card) => dashboardVisible.value.includes(card.id));
});

// ===== Profit trend: weekly ranges or months =====

// Read dates in Singapore time.
function dashboardDateParts(value) {
  if (!value) return null;

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  function getPart(type) {
    return Number(parts.find((part) => part.type === type).value);
  }

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
  };
}

const dashboardTrend = computed(() => {
  const current = dashboardDateParts(new Date());
  const rows = [];
  const groups = {};

  const weekly = dashboardPeriod.value === "month";

  // Group completed orders into the appropriate period.
  for (const order of dashboardCompletedOrders.value) {
    const date = dashboardDateParts(order.dueAt);

    if (!date) continue;

    const key = weekly
      ? Math.floor((date.day - 1) / 7)
      : date.year * 12 + date.month - 1;

    if (!groups[key]) groups[key] = [];

    groups[key].push(order);
  }

  function addRow(key, label, future, ongoing) {
    const totals = calculateDashboardTotals(groups[key] || []);

    rows.push({
      key,
      label,
      future,
      ongoing,
      ...totals,

      // Future ranges stay blank rather than showing a false $0.
      profit: future ? null : totals.profit,
    });
  }

  if (weekly) {
    const lastDay = new Date(
      Date.UTC(current.year, current.month, 0),
    ).getUTCDate();

    const monthLabel = new Date(
      Date.UTC(current.year, current.month - 1, 1),
    ).toLocaleDateString("en-SG", {
      timeZone: "UTC",
      month: "short",
    });

    for (let start = 1; start <= lastDay; start += 7) {
      const end = Math.min(start + 6, lastDay);
      const key = Math.floor((start - 1) / 7);

      addRow(
        key,
        `${start}–${end} ${monthLabel}`,
        start > current.day,
        current.day >= start && current.day <= end,
      );
    }
  } else {
    const currentMonth = current.year * 12 + current.month - 1;
    const recordedMonths = Object.keys(groups).map(Number);

    // All time has no timeline to display when no dated orders exist.
    if (dashboardPeriod.value === "all" && recordedMonths.length === 0) {
      return [];
    }

    const firstMonth =
      dashboardPeriod.value === "year"
        ? current.year * 12
        : Math.min(...recordedMonths);

    const lastMonth =
      dashboardPeriod.value === "year"
        ? current.year * 12 + 11
        : Math.max(currentMonth, ...recordedMonths);

    // Include intervening months so the timeline has no missing slots.
    for (let key = firstMonth; key <= lastMonth; key++) {
      const year = Math.floor(key / 12);
      const monthIndex = key % 12;

      const label = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString(
        "en-SG",
        {
          timeZone: "UTC",
          month: "short",
          year: "numeric",
        },
      );

      addRow(key, label, key > currentMonth, key === currentMonth);
    }
  }

  return rows;
});

const dashboardUndatedCount = computed(() => {
  return dashboardCompletedOrders.value.filter(
    (order) => !dashboardDateParts(order.dueAt),
  ).length;
});

// ===== Convert trend values into SVG coordinates =====
const dashboardGraph = computed(() => {
  const rows = dashboardTrend.value;

  const amounts = rows
    .filter((row) => row.profit !== null)
    .map((row) => row.profit);

  if (amounts.length === 0) return null;

  const minimum = Math.min(0, ...amounts);
  const maximum = Math.max(0, ...amounts);
  const range = maximum - minimum || 1;

  function yPosition(value) {
    return 180 - ((value - minimum) / range) * 140;
  }

  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? 340 : 100 + (index / (rows.length - 1)) * 480,
    y: row.profit === null ? null : yPosition(row.profit),
  }));

  let path = "";
  let connectToPrevious = false;

  for (const point of points) {
    if (point.y === null) {
      // Do not draw through missing costs or future periods.
      connectToPrevious = false;
      continue;
    }

    path += `${connectToPrevious ? "L" : "M"} ${point.x} ${point.y} `;
    connectToPrevious = true;
  }

  const axisValues =
    maximum === minimum ? [0] : [maximum, minimum + range / 2, minimum];

  return {
    points,
    path,
    zeroY: yPosition(0),
    ticks: axisValues.map((value) => ({
      value,
      y: yPosition(value),
    })),
  };
});

onMounted(loadOrders);

onMounted(loadInventory);

onMounted(loadShop);
</script>

<template>
  <section data-testid="page-home" class="container mt-4">
    <!-- Date and greeting -->
    <p class="text-secondary">{{ today }}</p>

    <h1>
      {{ greeting }}<span v-if="shopName">, {{ shopName }}</span>
    </h1>

    <p v-if="loading">Loading your shop...</p>

    <div v-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-danger btn-sm" @click="loadShop">
        Retry
      </button>
    </div>

    <!-- Dashboard -->
    <section class="my-4" aria-labelledby="dashboard-heading">
      <div
        class="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-3"
      >
        <h2 id="dashboard-heading" class="h4 mb-0">Dashboard</h2>

        <div class="d-flex flex-row flex-nowrap align-items-center gap-2">
          <button
            type="button"
            class="btn btn-light text-nowrap w-auto flex-shrink-0"
            :aria-expanded="showDashboardOptions"
            aria-controls="dashboard-options"
            @click="showDashboardOptions = !showDashboardOptions"
          >
            Customise dashboard
          </button>

          <RouterLink to="/orders/new" class="btn btn-primary text-nowrap">
            Log order
          </RouterLink>
        </div>
      </div>

      <!-- Card visibility -->
      <div
        v-show="showDashboardOptions"
        id="dashboard-options"
        class="card mb-3"
      >
        <div class="card-body">
          <!-- Title on the left, Reset on the top right -->
          <div class="form-check form-switch mb-3">
            <input
              id="show-analytics-dashboard"
              v-model="showAnalyticsDashboard"
              class="form-check-input"
              type="checkbox"
              role="switch"
              @change="saveAnalyticsVisibility"
            />

            <label for="show-analytics-dashboard" class="form-check-label">
              Show analytics dashboard
            </label>
          </div>
          <div
            class="d-flex justify-content-between align-items-center gap-2 mb-3"
          >
            <h3 class="h6 mb-0">Choose visible dashboard cards</h3>
            <button
              type="button"
              class="btn btn-light btn-sm text-nowrap"
              @click="resetDashboardCards"
            >
              Reset cards to default
            </button>
          </div>

          <fieldset>
            <!-- Screen readers still hear the group name -->
            <legend class="visually-hidden">
              Choose visible dashboard cards
            </legend>

            <div class="row g-2">
              <div
                v-for="option in dashboardOptions"
                :key="option.id"
                class="col-12 col-sm-6 col-lg-3"
              >
                <div class="form-check">
                  <input
                    :id="'dashboard-card-' + option.id"
                    v-model="dashboardVisible"
                    :value="option.id"
                    type="checkbox"
                    class="form-check-input"
                    @change="saveDashboardCards"
                  />

                  <label
                    :for="'dashboard-card-' + option.id"
                    class="form-check-label"
                  >
                    {{ option.label }}
                  </label>
                </div>
              </div>
            </div>
          </fieldset>

          <p class="small text-secondary mt-2 mb-0" role="status">
            {{ dashboardPreferenceMessage }}
          </p>
        </div>
      </div>


      <div v-if="showAnalyticsDashboard">
      <!-- Financial period -->
      <div class="row mb-2">
        <div class="col-12 col-sm-6 col-lg-4">
          <label for="dashboard-period" class="form-label">
            Sales and profit period
          </label>

          <select
            id="dashboard-period"
            v-model="dashboardPeriod"
            class="form-select"
            aria-describedby="dashboard-period-help"
          >
            <option value="all">All time</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
          </select>
        </div>
      </div>

      <p id="dashboard-period-help" class="small text-secondary">
        Outstanding orders shows the current total.
      </p>

      <!-- Loading, error and hidden states -->
      <p v-if="ordersLoading" role="status">Loading dashboard...</p>

      <div v-else-if="ordersError" class="alert alert-danger" role="alert">
        Dashboard unavailable. {{ ordersError }}
        <button
          type="button"
          class="btn btn-outline-danger btn-sm"
          @click="loadOrders"
        >
          Retry
        </button>
      </div>

      <template v-else>
        <div v-if="dashboardVisible.length === 0" class="alert alert-info">
          All dashboard cards are hidden.
          <button
            type="button"
            class="btn btn-link p-0 align-baseline"
            @click="resetDashboardCards"
          >
            Restore default cards
          </button>
        </div>

        <!-- Summary cards -->
        <div class="row g-3">
          <div
            v-for="card in dashboardSummaryCards"
            :key="card.id"
            class="col-12 col-md-6 col-xl-4"
          >
            <article class="card h-100">
              <div class="card-body">
                <h3 class="h6">{{ card.title }}</h3>
                <p class="fs-3 fw-bold my-3 text-break">
                  {{ card.value }}
                </p>
                <p class="small text-secondary mb-0">{{ card.note }}</p>

                <template v-if="card.id === 'profit'">
                  <p class="small mt-2 mb-0">
                    {{ dashboardTotals.included }} of
                    {{ dashboardTotals.total }} completed orders included.
                  </p>

                  <p
                    v-if="dashboardTotals.excluded > 0"
                    class="small mt-2 mb-0"
                  >
                    {{ dashboardTotals.excluded }} order(s) excluded because
                    cost or price details are unavailable.
                    <RouterLink to="/products">
                      Review product costs </RouterLink
                    >.
                  </p>
                </template>
              </div>
            </article>
          </div>
        </div>

        <!-- Profit line graph -->
        <article v-if="dashboardVisible.includes('trend')" class="card mt-3">
          <div class="card-body">
            <h3 class="h5">Estimated profit over time</h3>

            <p class="small text-secondary">
              {{
                dashboardPeriod === "month"
                  ? "Profit within each weekly date range."
                  : "Profit within each month."
              }}
              Completed orders grouped by scheduled fulfilment date, using
              current product costs.
            </p>

            <p v-if="dashboardTrend.length === 0" class="text-secondary">
              No dated completed orders in this period.
            </p>

            <template v-else>
              <p v-if="!dashboardGraph" class="text-secondary">
                No profit figures are available for elapsed ranges. Check the
                cost coverage in the figures below.
              </p>

              <div v-else class="overflow-auto">
                <svg
                  viewBox="0 0 640 230"
                  class="profit-line-chart"
                  role="img"
                  aria-labelledby="profit-chart-title profit-chart-description"
                >
                  <title id="profit-chart-title">
                    Estimated
                    {{ dashboardPeriod === "month" ? "weekly" : "monthly" }}
                    gross profit in Singapore dollars
                  </title>

                  <desc id="profit-chart-description">
                    Exact values and cost coverage are available below. Future
                    ranges are blank. Missing profit figures break the line.
                    Empty elapsed ranges show zero.
                  </desc>

                  <!-- Grid and currency labels -->
                  <g v-for="tick in dashboardGraph.ticks" :key="tick.value">
                    <line
                      x1="100"
                      x2="580"
                      :y1="tick.y"
                      :y2="tick.y"
                      class="profit-chart-grid"
                    />

                    <text
                      x="90"
                      :y="tick.y + 4"
                      text-anchor="end"
                      class="profit-chart-label"
                    >
                      {{ dashboardMoney(tick.value) }}
                    </text>
                  </g>

                  <!-- Zero baseline -->
                  <line
                    x1="100"
                    x2="580"
                    :y1="dashboardGraph.zeroY"
                    :y2="dashboardGraph.zeroY"
                    class="profit-chart-zero"
                  />

                  <!-- Profit line -->
                  <path :d="dashboardGraph.path" class="profit-chart-line" />

                  <!-- Points and date labels -->
                  <g
                    v-for="(point, index) in dashboardGraph.points"
                    :key="point.key"
                  >
                    <circle
                      v-if="point.y !== null"
                      :cx="point.x"
                      :cy="point.y"
                      r="5"
                      class="profit-chart-point"
                    >
                      <title>
                        {{ point.label }}
                        {{ point.ongoing ? "(ongoing)" : "" }}:
                        {{ dashboardMoney(point.profit) }}.
                        {{ point.included }} of {{ point.total }}
                        orders included.
                      </title>
                    </circle>

                    <text
                      v-if="
                        dashboardPeriod === 'month' ||
                        index === 0 ||
                        index === dashboardGraph.points.length - 1 ||
                        index % Math.ceil(dashboardGraph.points.length / 5) ===
                          0
                      "
                      :x="point.x"
                      y="210"
                      text-anchor="middle"
                      class="profit-chart-label"
                    >
                      {{ point.label }}{{ point.ongoing ? "*" : "" }}
                    </text>
                  </g>
                </svg>
              </div>

              <p class="small text-secondary mt-2">
                * Ongoing range. Future ranges are blank. Ranges with no
                completed orders show zero once they begin. Missing costs may
                make figures partial or unavailable.
              </p>

              <!-- Accessible exact figures -->
              <details class="mt-2">
                <summary class="small">
                  {{
                    dashboardPeriod === "month"
                      ? "View weekly figures"
                      : "View monthly figures"
                  }}
                </summary>

                <div class="table-responsive mt-2">
                  <table class="table align-middle mb-0">
                    <thead>
                      <tr>
                        <th scope="col">Period</th>
                        <th scope="col">Estimated profit</th>
                        <th scope="col">Orders included</th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr v-for="row in dashboardTrend" :key="row.key">
                        <th scope="row">
                          {{ row.label }}
                          <span v-if="row.ongoing" class="small fw-normal">
                            (ongoing)
                          </span>
                        </th>

                        <td>
                          <template v-if="row.future"> Not started </template>

                          <template v-else>
                            {{ dashboardMoney(row.profit) }}
                            <span v-if="row.excluded && row.included">
                              · partial
                            </span>
                          </template>
                        </td>

                        <td>
                          <span v-if="row.future">—</span>
                          <span v-else>
                            {{ row.included }} / {{ row.total }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            </template>

            <p v-if="dashboardUndatedCount > 0" class="small mt-2 mb-0">
              {{ dashboardUndatedCount }} order(s) without valid fulfilment
              dates are excluded.
            </p>
          </div>
        </article>
      </template>
    </div>
    </section>
    

    <!-- Today's orders -->
    <div class="card mt-3 mb-3">
      <div class="card-body">
        <h5 class="card-title">
          Today's orders
          <span
            v-if="!ordersLoading && !ordersError"
            class="status status--muted ms-1"
          >
            {{ todaysOrders.length }}
          </span>
        </h5>

        <p v-if="ordersLoading">Loading orders...</p>

        <div v-else-if="ordersError" class="alert alert-danger">
          {{ ordersError }}
          <button
            type="button"
            class="btn btn-danger btn-sm"
            @click="loadOrders"
          >
            Retry
          </button>
        </div>

        <div v-else-if="todaysOrders.length" class="d-flex flex-wrap gap-3">
          <div
            v-for="order in todaysOrders"
            :key="order._id"
            class="home-order-wrapper"
          >
            <OrderCard :order="order" />
          </div>
        </div>

        <p v-else class="text-secondary">No outstanding orders due today.</p>

        <div class="d-flex gap-2 mt-3">
          <RouterLink
            v-if="!ordersLoading && !ordersError && todaysOrders.length"
            to="/orders"
            class="btn btn-light"
          >
            See all orders
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Inventory error -->
    <div v-if="inventoryError" class="alert alert-danger" role="alert">
      {{ inventoryError }}
      <button
        type="button"
        class="btn btn-danger btn-sm"
        @click="loadInventory"
      >
        Retry
      </button>
    </div>

    <div class="row">
      <!-- Running low -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">Running low</h5>

            <p v-if="inventoryLoading">Loading materials...</p>

            <template v-else-if="!inventoryError">
              <p v-if="lowMaterials.length === 0" class="text-secondary">
                No materials are running low.
              </p>

              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="material in lowMaterials"
                  :key="material.id"
                  class="list-group-item px-0"
                >
                  <div
                    class="d-flex justify-content-between align-items-center"
                  >
                    <span>{{ material.name }}</span>
                    <span class="status status--danger">Running low</span>
                  </div>

                  <small
                    v-if="material.trackingMode === 'quantity'"
                    class="text-secondary"
                  >
                    {{ material.quantity }} {{ material.unit }} left
                  </small>

                  <small v-else class="text-secondary">
                    Level: {{ material.level }}
                  </small>
                </li>
              </ul>
            </template>

            <RouterLink
              to="/materials"
              class="home-link d-inline-block mt-3"
              @click="showLowMaterials"
            >
              See all
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Fewest you can make -->
      <div class="col-md-6">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">Fewest you can make</h5>

            <p v-if="inventoryLoading">Loading products...</p>

            <template v-else-if="!inventoryError">
              <p v-if="fewestProducts.length === 0" class="text-secondary">
                No products with a calculated capacity to show.
              </p>

              <ul v-else class="list-group list-group-flush">
                <li
                  v-for="item in fewestProducts"
                  :key="item.key"
                  class="list-group-item px-0"
                >
                  <div class="d-flex justify-content-between">
                    <span>{{ item.name }}</span>
                    <strong :class="{ 'text-danger': item.canMake === 0 }">
                      {{ item.canMake }}
                    </strong>
                  </div>

                  <small v-if="item.limitedBy" class="text-secondary">
                    Limited by {{ item.limitedBy }}
                  </small>

                  <div
                    v-for="warning in item.warnings"
                    :key="warning"
                    class="small home-warning"
                  >
                    {{ warning }}
                  </div>
                </li>
              </ul>
            </template>

            <RouterLink to="/products" class="home-link d-inline-block mt-3">
              See all
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style src="../assets/home.css"></style>
