<script setup>
// Home = Today's deliveries (from your prototype).
// TODO:
//   - show the shop name and the number of deliveries due today
//   - list today's deliveries (services/orders.js: getTodaysDeliveries)
//   - show low-stock alerts, as your heuristic evaluation recommended
//   - a "Log order" button linking to /orders/new
import { ref, onMounted } from 'vue';
import axios from 'axios';
import axios from "axios";
import { fullRecipe, calculateCanMake } from "../utils/capacity.js";
import OrderCard from '../components/OrderCard.vue';

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
    const inProgressResponse = await axios.get("/api/orders", {
      params: { status: "in-progress" },
    });

    const readyResponse = await axios.get("/api/orders", {
      params: { status: "ready" },
    });

    orders.value = [...inProgressResponse.data, ...readyResponse.data];
  } catch (error) {
    ordersError.value =
      error.response?.data?.message || "Could not load today’s orders.";
  } finally {
    ordersLoading.value = false;
  }
}

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
      <button
        type="button"
        class="btn btn-danger btn-sm"
        @click="loadShop"
      >
        Retry
      </button>
    </div>

    <!-- Today's orders -->
    <div class="card mt-3 mb-3">
      <div class="card-body">
        <h5 class="card-title">
          Today's orders
          <span
            v-if="!ordersLoading && !ordersError"
            class="badge bg-secondary"
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


        <p v-else class="text-secondary">
          No outstanding orders due today.
        </p>

        <div class="d-flex gap-2 mt-3">
          <RouterLink
            to="/orders/new"
            class="btn btn-success home-order-button"
          >
            Log order
          </RouterLink>

          <RouterLink
            v-if="!ordersLoading && !ordersError && todaysOrders.length"
            to="/orders"
            class="btn btn-secondary home-order-button home-see-all"
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
      <div class="col-md-6 mb-3">
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
                    <span class="badge bg-danger">Running low</span>
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
              class="text-success d-inline-block mt-3"
              @click="showLowMaterials"
            >
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
                    class="small text-warning"
                  >
                    {{ warning }}
                  </div>
                </li>
              </ul>
            </template>

            <RouterLink
              to="/products"
              class="text-success d-inline-block mt-3"
            >
              See all
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-orders {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.home-order-wrapper {
  width: fit-content;
  max-width: 100%;
}

.home-order-wrapper > :deep(*) {
  display: block;
  width: auto;
  max-width: 100%;
  box-sizing: border-box;
}

.home-order-button {
  width: auto;
  margin: 0;
  white-space: nowrap;
}

.home-see-all {
  background-color: #6c757d;
  border-color: #6c757d;
  color: white;
}

.home-see-all:hover {
  background-color: #5c636a;
  border-color: #565e64;
}
</style>
