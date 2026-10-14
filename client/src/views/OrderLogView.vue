<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import OrderCard from '../components/OrderCard.vue';
import StageTracker from '../components/StageTracker.vue';
import FloatingAddButton from '../components/FloatingAddButton.vue';

const orders = ref([]);
const loading = ref(false);
const error = ref('');
const stage = ref('in-progress');

const paymentFilter = ref('all'); // all | paid | deposit | unpaid
const dueSort = ref('nearest');   // nearest | farthest

async function fetchOrders() {
  loading.value = true;
  error.value = '';

  try {
    const response = await axios.get('/api/orders', {
      params: { status: stage.value },
    });

    orders.value = response.data;
  } catch (err) {
    error.value = err.response.data.message || 'Could not load orders.';
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
  () => paymentFilter.value !== 'all' || dueSort.value !== 'nearest'
);

function clearFilters() {
  paymentFilter.value = 'all';
  dueSort.value = 'nearest';
}

onMounted(fetchOrders);
watch(stage, fetchOrders);
</script>

<template>
  <div>
    <header class="page-header">
      <div>
        <h1>Order log</h1>
        <p>Your orders</p>
      </div>
    </header>

    <StageTracker v-model="stage" class="mb-3" />

    <div
      class="sk-card mb-4"
      style="display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; padding: 0.85rem 1.15rem;"
    >
      <div style="display: flex; align-items: flex-end; gap: 1rem; flex-wrap: wrap;">
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

    <div v-if="loading" class="empty-state">Loading orders...</div>
    <div v-else-if="error" class="empty-state text-danger">{{ error }}</div>
    <TransitionGroup v-else-if="visibleOrders.length" name="list" tag="div" class="sk-grid">
      <OrderCard v-for="o in visibleOrders" :key="o._id" :order="o" />
    </TransitionGroup>
    <div v-else class="empty-state">
      No orders here.
    </div>

    <FloatingAddButton />
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
</style>