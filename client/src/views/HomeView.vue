<script setup>
// Home = Today's deliveries (from your prototype).
// TODO:
//   - show the shop name and the number of deliveries due today
//   - list today's deliveries (services/orders.js: getTodaysDeliveries)
//   - show low-stock alerts, as your heuristic evaluation recommended
//   - a "Log order" button linking to /orders/new
import { ref, onMounted } from 'vue';
import axios from 'axios';

const shopName = ref('');
const loading = ref(true);
const errorMessage = ref('');

const now = new Date();

const today = now.toLocaleDateString('en-SG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const hour = now.getHours();

const greeting =
  hour < 12
    ? 'Good morning'
    : hour < 18
      ? 'Good afternoon'
      : 'Good evening';

async function loadShop() {
  errorMessage.value = '';
  loading.value = true;

  try {
    const response = await axios.get('/api/auth/me');
    shopName.value = response.data.shopName;
  } catch (error) {
    errorMessage.value =
      error.response?.data?.message ||
      'Could not load your shop details.';
  } finally {
    loading.value = false;
  }
}

onMounted(loadShop);
</script>

<template>
  <section data-testid="page-home" class="container mt-4">
    <p class="text-secondary">{{ today }}</p>

    <h1>
      {{ greeting }}<span v-if="shopName">, {{ shopName }}</span>
    </h1>

    <p v-if="loading">Loading your shop...</p>

    <div v-if="errorMessage" class="alert alert-danger">
      {{ errorMessage }}
      <button class="btn btn-danger" @click="loadShop">
        Retry
      </button>
    </div>

    <!-- Today's orders -->
    <div class="card mt-3 mb-3">
      <div class="card-body">
        <h5 class="card-title">Today's orders</h5>

        <p class="card-text">
          Today's orders will appear here once connected.
        </p>

        <RouterLink to="/orders/new" class="btn btn-success">
          Log order
        </RouterLink>
      </div>
    </div>

    <div class="row">
      <!-- Running low -->
      <div class="col-md-6 mb-3">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">Running low</h5>

            <p class="card-text">
              Low-stock materials will appear here once connected.
            </p>

            <RouterLink to="/materials" class="text-success">
              See all
            </RouterLink>
          </div>
        </div>
      </div>

      <!-- Fewest you can make -->
      <div class="col-md-6 mb-3">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">Fewest you can make</h5>

            <p class="card-text">
              Product quantities will appear here once connected.
            </p>

            <RouterLink to="/products" class="text-success">
              See all
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
