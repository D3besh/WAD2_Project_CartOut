<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import OrderCard from '../components/OrderCard.vue';
import FloatingAddButton from '../components/FloatingAddButton.vue';
import MaterialsNeededCard from '../components/MaterialsNeededCard.vue';


const orders = ref([]);
const loading = ref(false);
const error = ref('');
const statusFilter = ref('in-progress'); // in-progress | ready | completed | refunded | cancelled
const paymentFilter = ref('all'); // all | paid | deposit | unpaid
const dueSort = ref('nearest');   // nearest | farthest


// ---- Bulk update ----
const selecting = ref(false);   // true while the seller is ticking orders
const selectedIds = ref([]);    // ids of the ticked orders
const bulkSaving = ref(false);
const bulkMessage = ref('');    // green message after a bulk update
const bulkError = ref('');
const materials = ref([]);      // for the "Materials needed" card


const STAGES = [
  { value: 'in-progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
];


async function fetchOrders() {
  loading.value = true;
  error.value = '';


  try {
    // In progress, Ready and Completed filter by stage.
    // Refunded and Cancelled use the server's "outcome" filter instead.
    let params;
    if (statusFilter.value === 'refunded' || statusFilter.value === 'cancelled') {
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


// filter by payment status, then sort by due date
const visibleOrders = computed(() => {
  let list = orders.value;


  if (paymentFilter.value !== 'all') {
    list = list.filter((o) => (o.paymentStatus ?? 'unpaid') === paymentFilter.value);
  }


  return [...list].sort((a, b) => {
    const diff = new Date(a.dueAt) - new Date(b.dueAt);
    return dueSort.value === 'nearest' ? diff : -diff;
  });
});


const hasChanges = computed(
  () =>
    statusFilter.value !== 'in-progress' ||
    paymentFilter.value !== 'all' ||
    dueSort.value !== 'nearest'
);


function clearFilters() {
  statusFilter.value = 'in-progress';
  paymentFilter.value = 'all';
  dueSort.value = 'nearest';
}


// ---- Bulk update ----

// Cancelled orders can't change stage, so there is nothing to bulk update there
const canSelect = computed(() => statusFilter.value !== 'cancelled' && visibleOrders.value.length > 0);


// Stage buttons to show: hide the stage the orders are already in
const stageButtons = computed(() => STAGES.filter((s) => s.value !== statusFilter.value));


const allSelected = computed(
  () => visibleOrders.value.length > 0 && selectedIds.value.length === visibleOrders.value.length
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


function stopSelecting() {
  selecting.value = false;
  selectedIds.value = [];
}


function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = [];
  } else {
    selectedIds.value = visibleOrders.value.map((o) => o._id);
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
    if (skipped > 0) text += ' ' + skipped + ' skipped (already ' + label + ' or cancelled).';
    bulkMessage.value = text;


    stopSelecting();
    await fetchOrders(); // updated orders move out of this filter
  } catch (err) {
    bulkError.value = err.response?.data?.message || 'Could not update the orders.';
  } finally {
    bulkSaving.value = false;
  }
}


onMounted(fetchOrders);
watch(statusFilter, fetchOrders);


// Changing a filter changes which orders are shown, so start the selection again
watch([statusFilter, paymentFilter], () => {
  selectedIds.value = [];
  if (statusFilter.value === 'cancelled') selecting.value = false;
});
</script>


<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Order log</h1>
        <p>Your orders</p>
      </div>
      <button
        v-if="canSelect && !selecting"
        type="button"
        class="btn btn-outline-primary btn-sm"
        data-testid="bulk-select"
        @click="startSelecting"
      >
        Select orders
      </button>
    </header>


    <div
      class="sk-card mb-4"
      style="display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; padding: 0.85rem 1.15rem;"
    >
      <div style="display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap;">
        <div class="filter-field">
          <label class="form-label" for="statusFilter">Order Status</label>
          <select id="statusFilter" v-model="statusFilter" class="form-select form-select-sm" data-testid="filter-status">
            <option value="in-progress">In progress</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
            <option value="refunded">Refunded</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>


        <div class="filter-field">
          <label class="form-label" for="paymentFilter">Payment</label>
          <select id="paymentFilter" v-model="paymentFilter" class="form-select form-select-sm">
            <option value="all">All</option>
            <option value="paid">Paid</option>
            <option value="deposit">Deposit</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </div>


        <div class="filter-field">
          <label class="form-label" for="dueSort">Due date</label>
          <select id="dueSort" v-model="dueSort" class="form-select form-select-sm">
            <option value="nearest">Nearest first</option>
            <option value="farthest">Farthest first</option>
          </select>
        </div>
      </div>


      <div style="flex-shrink: 0;">
        <button
          v-if="hasChanges"
          type="button"
          class="btn btn-light btn-sm"
          @click="clearFilters"
        >
          Reset
        </button>
      </div>
    </div>


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
          <label for="selectAll" class="form-check-label">Select all</label>
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
          @click="bulkUpdate(stage.value, stage.label)"
        >
          {{ stage.label }}
        </button>
        <button type="button" class="btn btn-light btn-sm" :disabled="bulkSaving" @click="stopSelecting">
          Cancel
        </button>
      </div>


      <p v-if="bulkSaving" class="small text-muted mb-0 w-100">Updating orders...</p>
      <p v-if="bulkError" class="small text-danger mb-0 w-100">{{ bulkError }}</p>
    </div>


    <!-- Total materials for the ticked orders -->
    <MaterialsNeededCard v-if="selecting" :orders="selectedOrders" :materials="materials" />


    <div v-if="loading" class="empty-state">Loading orders...</div>
    <div v-else-if="error" class="empty-state text-danger">{{ error }}</div>
    <TransitionGroup v-else-if="visibleOrders.length" name="list" tag="div" class="sk-grid">
      <div v-for="o in visibleOrders" :key="o._id" class="order-slot">
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
    <div v-else class="empty-state">
      No orders here.
    </div>


    <FloatingAddButton v-if="!selecting" />
  </div>
</template>


<style scoped>
.filter-field {
  min-width: 160px;
}


.filter-field .form-label {
  font-size: 0.8rem;
  color: var(--sk-muted);
  margin-bottom: 0.25rem;
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