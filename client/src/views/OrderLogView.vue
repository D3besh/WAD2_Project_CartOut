<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import OrderCard from '../components/OrderCard.vue';
import BacktoTop from '../components/BacktoTop.vue';
import Pager from '../components/Pager.vue';
import MaterialsNeededCard from '../components/MaterialsNeededCard.vue';


const orders = ref([]);
const loading = ref(false);
const error = ref('');
const statusFilter = ref('in-progress'); // in-progress | ready | completed | refunded | cancelled
const paymentFilter = ref('all'); // all | paid | deposit | unpaid
const dueSort = ref('nearest');   // nearest | farthest
const search = ref('');           // order number or customer name typed in the search bar

// ---- Paging: 12 orders per page ----
const PAGE_SIZE = 12;
const page = ref(1); // the page being shown, starting at 1

// Status tabs (replaces the old Order Status dropdown)
const STATUS_TABS = [
  { value: 'in-progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled', label: 'Cancelled' },
];

// How many orders are in each tab, e.g. { 'in-progress': 23, ready: 6, ... }
// null until loaded, so the tabs just show their names at first.
const counts = ref(null);


// True while something is typed in the search bar
const isSearching = computed(() => search.value.trim() !== '');


// ---- Bulk update ----
const selecting = ref(false);   // true while the seller is ticking orders
const selectedIds = ref([]);    // ids of the ticked orders
const bulkSaving = ref(false);
const bulkMessage = ref('');    // green message after a bulk update
const bulkError = ref('');
const materials = ref([]);      // for the "Materials needed" card


// Stages orders can be moved TO in a bulk update.
// Orders only move forward, so nothing can be moved back to In progress.
const STAGES = [
  { value: 'ready', label: 'Ready', order: 1 },
  { value: 'completed', label: 'Completed', order: 2 },
];

// Position of each tab's stage (the Refunded and Cancelled tabs hold mixed stages)
const TAB_ORDER = { 'in-progress': 0, ready: 1, completed: 2 };


async function fetchOrders() {
  loading.value = true;
  error.value = '';


  try {
    // In progress, Ready and Completed filter by stage.
    // Refunded and Cancelled use the server's "outcome" filter instead.
    // While searching, load ALL orders so the order is found whatever its status.
    let params;
    if (isSearching.value) {
      params = {};
    } else if (statusFilter.value === 'refunded' || statusFilter.value === 'cancelled') {
      params = { outcome: statusFilter.value };
    } else {
      params = { status: statusFilter.value };
    }


    const response = await axios.get('/api/orders', { params: params });


    orders.value = response.data;
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load orders.';
    orders.value = [];
  } finally {
    loading.value = false;
  }
}


// Loads every order once and counts how many belong to each tab.
// Uses the same rules as the server's filters:
//   In progress / Ready / Completed / Cancelled → by status
//   Refunded → any order with a refund recorded
async function fetchCounts() {
  try {
    const response = await axios.get('/api/orders');
    const all = response.data;

    const result = { 'in-progress': 0, ready: 0, completed: 0, refunded: 0, cancelled: 0 };
    for (const order of all) {
      if (result[order.status] !== undefined) {
        result[order.status] += 1;
      }
      if (order.refundAmount > 0) {
        result.refunded += 1;
      }
    }

    counts.value = result;
  } catch (err) {
    counts.value = null; // the tabs still work, just without numbers
  }
}

// "In progress (23)", or just "In progress" if the counts haven't loaded
function tabLabel(tab) {
  if (!counts.value) return tab.label;
  return tab.label + ' (' + counts.value[tab.value] + ')';
}


// True if the order number or customer name contains what was typed,
// e.g. "261028-03", "ord-261028" or "priya". Capital letters don't matter.
function matchesSearch(order) {
  const text = search.value.trim().toLowerCase();
  const orderNo = (order.orderNo || '').toLowerCase();
  const name = (order.customerName || '').toLowerCase();
  return orderNo.includes(text) || name.includes(text);
}


// When searching: only the matching orders (filters are ignored).
// Otherwise: filter by payment status.
// Then sort by due date.
const visibleOrders = computed(() => {
  let list = orders.value;


  if (isSearching.value) {
    list = list.filter(matchesSearch);
  } else if (paymentFilter.value !== 'all') {
    list = list.filter((o) => (o.paymentStatus ?? 'unpaid') === paymentFilter.value);
  }


  return [...list].sort((a, b) => {
    const diff = new Date(a.dueAt) - new Date(b.dueAt);
    return dueSort.value === 'nearest' ? diff : -diff;
  });
});


// ---- Paging ----
const totalPages = computed(() => Math.max(1, Math.ceil(visibleOrders.value.length / PAGE_SIZE)));

// Only the 12 orders on the current page
const pagedOrders = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return visibleOrders.value.slice(start, start + PAGE_SIZE);
});

// Go back to the top of the list when the page changes (useful on phones)
watch(page, () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

const hasChanges = computed(
  () =>
    statusFilter.value !== 'in-progress' ||
    paymentFilter.value !== 'all' ||
    dueSort.value !== 'nearest' ||
    search.value !== ''
);


function clearFilters() {
  statusFilter.value = 'in-progress';
  paymentFilter.value = 'all';
  dueSort.value = 'nearest';
  search.value = '';
}


// ---- Bulk update ----

// Cancelled orders can't change stage, so there is nothing to bulk update there
// (While searching, cancelled orders may be in the results; the server skips them.)
const canSelect = computed(
  () =>
    (isSearching.value || statusFilter.value !== 'cancelled') &&
    stageButtons.value.length > 0 &&
    visibleOrders.value.length > 0
);


// Stage buttons to show: hide the stage the orders are already in
// (While searching, the results can be in any stage, so show all three.)
const stageButtons = computed(() => {
  // Search results and the Refunded tab can be in any stage: the server skips
  // any order that would have to go backwards.
  if (isSearching.value || TAB_ORDER[statusFilter.value] === undefined) return STAGES;
  // Only stages AFTER this tab's stage, e.g. Ready tab → Completed only
  return STAGES.filter((s) => s.order > TAB_ORDER[statusFilter.value]);
});


// "Select all" ticks the orders on the current page only
const allSelected = computed(
  () =>
    pagedOrders.value.length > 0 &&
    pagedOrders.value.every((o) => selectedIds.value.includes(o._id))
);


function startSelecting() {
  selecting.value = true;
  selectedIds.value = [];
  bulkMessage.value = '';
  bulkError.value = '';
  loadMaterials(); // fresh stock levels for the "Materials needed" card
}


async function loadMaterials() {
  try {
    const response = await axios.get('/api/materials');
    materials.value = response.data;
  } catch (err) {
    materials.value = []; // the card still shows amounts, just without names and stock
  }
}


// The full order objects for the ticked ids
const selectedOrders = computed(() =>
  visibleOrders.value.filter((o) => selectedIds.value.includes(o._id))
);


// Bulk "Completed" can't be undone, so it asks first
const confirmingCompleted = ref(false);

function chooseStage(stage) {
  if (stage.value === 'completed') {
    confirmingCompleted.value = true; // show "Mark N orders as Completed?"
    return;
  }
  bulkUpdate(stage.value, stage.label);
}

function confirmCompleted() {
  confirmingCompleted.value = false;
  bulkUpdate('completed', 'Completed');
}

function stopSelecting() {
  confirmingCompleted.value = false;
  selecting.value = false;
  selectedIds.value = [];
}


function toggleSelectAll() {
  const pageIds = pagedOrders.value.map((o) => o._id);

  if (allSelected.value) {
    // untick this page's orders, keep ticks on other pages
    selectedIds.value = selectedIds.value.filter((id) => !pageIds.includes(id));
  } else {
    // tick this page's orders (without adding the same id twice)
    const set = new Set([...selectedIds.value, ...pageIds]);
    selectedIds.value = [...set];
  }
}


async function bulkUpdate(newStatus, label) {
  if (selectedIds.value.length === 0 || bulkSaving.value) return;
  bulkSaving.value = true;
  bulkError.value = '';
  bulkMessage.value = '';


  try {
    const response = await axios.patch('/api/orders/bulk-status', {
      ids: selectedIds.value,
      status: newStatus,
    });


    const { updated, skipped, emailed } = response.data;
    let text = updated + (updated === 1 ? ' order' : ' orders') + ' marked as ' + label + '.';
    if (emailed > 0) text += ' ' + emailed + (emailed === 1 ? ' customer' : ' customers') + ' will be emailed.';
    if (skipped > 0) text += ' ' + skipped + ' skipped (already ' + label + ' or later, or cancelled).';
    bulkMessage.value = text;


    stopSelecting();
    await fetchOrders(); // updated orders move out of this filter
    fetchCounts();       // and the tab numbers change
  } catch (err) {
    bulkError.value = err.response?.data?.message || 'Could not update the orders.';
  } finally {
    bulkSaving.value = false;
  }
}


onMounted(() => {
  fetchOrders();
  fetchCounts();
});
watch(statusFilter, fetchOrders);
// Reload only when searching starts or stops, not on every key typed
watch(isSearching, fetchOrders);


// Changing a filter changes which orders are shown, so start the selection again
watch([statusFilter, paymentFilter, search], () => {
  selectedIds.value = [];
  if (statusFilter.value === 'cancelled' && !isSearching.value) selecting.value = false;
});


// A different tab, filter, sort or search shows a different list, so go back to page 1
watch([statusFilter, paymentFilter, dueSort, search], () => {
  page.value = 1;
});

// If the list gets shorter (e.g. after a bulk update), don't stay on a page that no longer exists
watch(totalPages, (n) => {
  if (page.value > n) page.value = n;
});

</script>


<template>
  <div>
    <!-- Title, status tabs (md and up) and Select orders -->
    <header class="d-flex flex-wrap align-items-center gap-3 mb-3">
      <div class="me-md-2">
        <h1 class="h3 mb-0">Order log</h1>
        <p class="text-muted mb-0">Your orders</p>
      </div>

      <div class="status-tabs d-none d-md-flex" role="tablist" aria-label="Order status">
        <button
          v-for="tab in STATUS_TABS"
          :key="tab.value"
          type="button"
          role="tab"
          class="status-tab"
          :class="{ 'is-active': statusFilter === tab.value && !isSearching }"
          :aria-selected="statusFilter === tab.value"
          :disabled="isSearching"
          :data-testid="`tab-${tab.value}`"
          @click="statusFilter = tab.value"
        >
          {{ tabLabel(tab) }}
        </button>
      </div>

      <!-- Right side: Select orders + New order (same button as on Home) -->
      <div class="d-flex align-items-center gap-2 ms-auto">
        <button
          v-if="canSelect && !selecting"
          type="button"
          class="btn btn-outline-primary"
          data-testid="bulk-select"
          @click="startSelecting"
        >
          Select orders
        </button>

        <RouterLink to="/orders/new" class="btn btn-primary text-nowrap" data-testid="new-order">
          + New Order
        </RouterLink>
      </div>
    </header>


    <!-- Search and filters, all on one row from md up -->
    <div class="sk-card mb-3 py-2 px-3">
      <div class="row g-2 align-items-center">
        <!-- Phone: status is a dropdown instead of tabs -->
        <div class="col-12 d-md-none">
          <label class="visually-hidden" for="statusFilter">Order status</label>
          <select
            id="statusFilter"
            v-model="statusFilter"
            class="form-select form-select-sm"
            data-testid="filter-status"
            :disabled="isSearching"
          >
            <option v-for="tab in STATUS_TABS" :key="tab.value" :value="tab.value">{{ tabLabel(tab) }}</option>
          </select>
        </div>

        <div class="col-12 col-md">
          <label class="visually-hidden" for="orderSearch">Search</label>
          <input
            id="orderSearch"
            v-model="search"
            type="search"
            class="form-control form-control-sm"
            placeholder="Search order no. or customer name"
            data-testid="order-search"
          />
        </div>

        <div class="col-6 col-md-auto">
          <div class="input-group input-group-sm">
            <label class="input-group-text" for="paymentFilter">Payment</label>
            <select id="paymentFilter" v-model="paymentFilter" class="form-select" :disabled="isSearching">
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="deposit">Deposit</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
        </div>

        <div class="col-6 col-md-auto">
          <div class="input-group input-group-sm">
            <label class="input-group-text" for="dueSort">Due</label>
            <select id="dueSort" v-model="dueSort" class="form-select">
              <option value="nearest">Nearest first</option>
              <option value="farthest">Farthest first</option>
            </select>
          </div>
        </div>

        <div v-if="hasChanges" class="col-12 col-md-auto">
          <button type="button" class="btn btn-light btn-sm w-100" @click="clearFilters">
            Reset
          </button>
        </div>
      </div>
    </div>


    <p v-if="isSearching" class="small text-muted mb-3">
      Searching all orders. Clear the search to use the filters again.
    </p>


    <!-- Result of the last bulk update -->
    <div v-if="bulkMessage" class="alert alert-success d-flex justify-content-between align-items-center" role="status">
      <span>{{ bulkMessage }}</span>
      <button type="button" class="btn-close" aria-label="Dismiss" @click="bulkMessage = ''"></button>
    </div>


    <!-- Bulk action bar, shown while selecting -->
    <div v-if="selecting" class="sk-card mb-3 bulk-bar" data-testid="bulk-bar">
      <div class="bulk-bar__left">
        <div class="form-check mb-0">
          <input id="selectAll" type="checkbox" class="form-check-input"
            :checked="allSelected" @change="toggleSelectAll" />
          <label for="selectAll" class="form-check-label">
            {{ totalPages > 1 ? 'Select all on this page' : 'Select all' }}
          </label>
        </div>
        <strong>{{ selectedIds.length }} selected</strong>
      </div>


      <div class="bulk-bar__right">
        <span class="text-muted small">Mark as:</span>
        <button
          v-for="stage in stageButtons"
          :key="stage.value"
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="selectedIds.length === 0 || bulkSaving"
          @click="chooseStage(stage)"
        >
          {{ stage.label }}
        </button>
        <button type="button" class="btn btn-light btn-sm" :disabled="bulkSaving" @click="stopSelecting">
          Cancel
        </button>
      </div>


      <!-- "Are you sure?" before marking orders as Completed -->
      <div v-if="confirmingCompleted" class="bulk-confirm w-100" data-testid="bulk-confirm" role="alertdialog" aria-live="polite">
        <p class="mb-1 fw-semibold">
          Mark {{ selectedIds.length }} {{ selectedIds.length === 1 ? 'order' : 'orders' }} as Completed?
        </p>
        <p class="small text-muted mb-2">
          This can't be undone. Completed orders can't be cancelled or refunded.
        </p>
        <div class="d-flex gap-2">
          <button type="button" class="btn btn-primary btn-sm" :disabled="bulkSaving" @click="confirmCompleted">
            Yes, mark as Completed
          </button>
          <button type="button" class="btn btn-light btn-sm" @click="confirmingCompleted = false">Not yet</button>
        </div>
      </div>

      <p v-if="bulkSaving" class="small text-muted mb-0 w-100">Updating orders...</p>
      <p v-if="bulkError" class="small text-danger mb-0 w-100">{{ bulkError }}</p>
    </div>


    <!-- Total materials for the ticked orders -->
    <MaterialsNeededCard v-if="selecting" :orders="selectedOrders" :materials="materials" />


    <div v-if="loading" class="empty-state">Loading orders...</div>
    <div v-else-if="error" class="empty-state text-danger">{{ error }}</div>

    <template v-else-if="visibleOrders.length">
      <!--
        Bootstrap grid, 12 orders per page:
          phone: 1 per row · md: 2 · lg: 3 · xl: 4 (4 × 3 = one full page)
      -->
      <TransitionGroup name="list" tag="div" class="row g-3">
        <div
          v-for="o in pagedOrders"
          :key="o._id"
          class="col-12 col-md-6 col-lg-4 col-xl-3 order-slot"
        >
          <!-- While selecting, the whole card ticks its checkbox instead of opening the order -->
          <label
            v-if="selecting"
            class="select-wrap"
            :class="{ 'is-selected': selectedIds.includes(o._id) }"
          >
            <input
              v-model="selectedIds"
              type="checkbox"
              :value="o._id"
              class="form-check-input select-box"
              :aria-label="'Select order for ' + o.customerName"
            />
            <OrderCard :order="o" class="select-card" tabindex="-1" />
          </label>
          <OrderCard v-else :order="o" />
        </div>
      </TransitionGroup>

      <!-- Paging: the shared Pager component (also used on Materials and Products) -->
      <Pager v-model="page" :total="visibleOrders.length" :per-page="PAGE_SIZE" item-name="orders" />
    </template>

    <div v-else-if="isSearching" class="empty-state">
      No orders match "{{ search.trim() }}".
    </div>
    <div v-else class="empty-state">
      No orders here.
    </div>


    <!-- Round "↑" button, appears after scrolling down -->
    <BacktoTop />
  </div>
</template>


<style scoped>
/* Layout uses Bootstrap classes; this is only colours and small details. */

/* ---- Status tabs ---- */
.status-tabs {
  gap: 0.25rem;
  padding: 0.25rem;
  background: var(--sk-brand-soft);
  border-radius: 12px;
}

.status-tab {
  border: 0;
  background: none;
  padding: 0.4rem 0.9rem;
  border-radius: 9px;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--sk-muted);
  white-space: nowrap;
}

.status-tab:hover:not(:disabled) {
  color: var(--sk-text);
}

.status-tab.is-active {
  background: var(--sk-surface);
  color: var(--sk-text);
  box-shadow: 0 1px 3px rgb(15 14 71 / 0.12);
}

.status-tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ---- Filter bar ---- */
.input-group-text {
  font-size: 0.8rem;
  color: var(--sk-muted);
  background: var(--sk-bg);
}

/* ---- Bulk "Are you sure?" box ---- */
.bulk-confirm {
  padding: 0.75rem 0.9rem;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-brand-soft);
}

/* ---- Bulk action bar ---- */
.bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 0.75rem 1.15rem;
}


.bulk-bar__left,
.bulk-bar__right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}


/* ---- Selectable cards ---- */
/* each grid cell holds one card; make the card fill the cell */
.order-slot {
  display: flex;
}


.order-slot > * {
  flex: 1;
}


.select-wrap {
  position: relative;
  display: flex;
  cursor: pointer;
  border-radius: var(--sk-radius);
  margin: 0;
}


/* the card itself ignores clicks, so clicking it ticks the checkbox */
.select-card {
  flex: 1;
  pointer-events: none;
}


/* checkbox sits on the card's top-left corner */
.select-box {
  position: absolute;
  top: -0.4rem;
  left: -0.4rem;
  z-index: 1;
  width: 1.4rem;
  height: 1.4rem;
  margin: 0;
  box-shadow: var(--sk-shadow);
  cursor: pointer;
}


.select-wrap:hover .select-card {
  box-shadow: var(--sk-shadow-lift);
}


.select-wrap.is-selected .select-card {
  outline: 2px solid var(--sk-brand);
  background: var(--sk-brand-soft);
}
</style>