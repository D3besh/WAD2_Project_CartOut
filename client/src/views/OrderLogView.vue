<script setup>
import { ref, watch, onMounted } from 'vue';
import axios from 'axios';
import OrderCard from '../components/OrderCard.vue';
import StageTracker from '../components/StageTracker.vue';

const orders = ref([]);
const loading = ref(false);
const error = ref('');
const stage = ref('in-progress');

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

    <StageTracker v-model="stage" class="mb-4" />

    <div v-if="loading" class="empty-state">Loading orders...</div>
    <div v-else-if="error" class="empty-state text-danger">{{ error }}</div>
    <TransitionGroup v-else-if="orders.length" name="list" tag="div" class="sk-grid">
      <OrderCard v-for="o in orders" :key="o._id" :order="o" />
    </TransitionGroup>
    <div v-else class="empty-state">
      <i class="bi bi-inbox" aria-hidden="true"></i>
      No orders here.
    </div>
  </div>
</template>