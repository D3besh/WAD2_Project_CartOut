<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import MaterialCard from '../components/MaterialCard.vue';
import '../assets/inventory.css'; // styles for the Materials and Products pages
import { formatDay, restockWithin, restockStatusText } from '../utils/forecast.js';

const route = useRoute();   // the current address (to read ?add=1)
const router = useRouter(); // to change the address

// =====================================================
// 1. DATA
// =====================================================
const materials = ref([]);        // all materials from the server
const errorMessage = ref('');     // red box at the top of the page
const search = ref('');           // text typed in the search box

// Remember the seller's filter choice in localStorage,
// so it is still the same after they refresh the page.
// localStorage only stores text, so we compare with the string 'true'.
const showLowOnly = ref(localStorage.getItem('materialsShowLowOnly') === 'true');

function setShowLowOnly(value) {
  showLowOnly.value = value;
  localStorage.setItem('materialsShowLowOnly', value);
}

// Add / Edit pop-up
const showForm = ref(false);      // is the pop-up open?
const editingId = ref(null);      // null = adding a new one, otherwise the id being edited
const form = ref({});             // the values in the form
const formError = ref('');        // error message inside the pop-up

// Restock pop-up (only for quantity materials)
const restockTarget = ref(null);  // the material being restocked, or null = closed
const restockAmount = ref(0);
const restockError = ref('');

// Shopping list pop-up
const showShoppingList = ref(false);

// Forecast: which materials will go low or run out soon (from the server)
const forecast = ref(null);       // null = not loaded yet

const URGENT_DAYS = 7;   // "Restock soon" only shows materials that go low / run out within 7 days
const MAX_SHOWN = 3;     // and at most 3 of them (the rest are on the Forecast page)

// =====================================================
// 2. LOAD MATERIALS FROM THE SERVER
// =====================================================
async function loadMaterials() {
  let url = '/api/materials';

  try {
    let response = await axios.get(url);
    materials.value = response.data;
  } catch (error) {
    errorMessage.value = getErrorText(error);
  }
}

// Load the 30-day forecast
async function loadForecast() {
  let url = '/api/materials/forecast';

  try {
    let response = await axios.get(url);
    forecast.value = response.data;
  } catch (error) {
    // The forecast is extra information, so if it fails the page still works
    console.error('Forecast failed:', getErrorText(error));
  }
}

// Load both again (after anything that changes stock)
async function reloadAll() {
  await loadMaterials();
  await loadForecast();
}

// Run once when the page opens
onMounted(() => {
  reloadAll();
  openFormFromLink(); // opened from the floating "+" button?
});

// The floating "+" button links here with ?add=1 (e.g. /materials?add=1).
// When we see it, open the Add pop-up, then remove ?add=1 from the address
// so refreshing the page doesn't open the pop-up again.
function openFormFromLink() {
  if (route.query.add === '1') {
    openAddForm();
    router.replace({ query: {} });
  }
}

// Also works when you're already on this page and press the floating button
// (the page doesn't reload, only the ?add=1 part of the address changes)
watch(() => route.query.add, openFormFromLink);

// Our server sends a friendly message (e.g. "Remove it from these products first").
// It is inside error.response.data.message. If it's not there, use error.message.
function getErrorText(error) {
  if (error.response && error.response.data && error.response.data.message) {
    return error.response.data.message;
  }
  return error.message;
}

// =====================================================
// 3. COMPUTED VALUES (update automatically)
// =====================================================

// Only the materials that are low
const lowMaterials = computed(() => {
  return materials.value.filter((m) => m.isLow);
});

// The materials to show, after the filter buttons and search box
const visibleMaterials = computed(() => {
  let list = materials.value;

  if (showLowOnly.value) {
    list = list.filter((m) => m.isLow);
  }

  if (search.value !== '') {
    let text = search.value.toLowerCase();
    list = list.filter((m) => m.name.toLowerCase().includes(text));
  }

  return list;
});

// Materials that will go low or run out within the next 7 days, soonest first.
// Ones that are ALREADY low are left out here: the "running low" banner above already shows them.
const restockSoon = computed(() => {
  return restockWithin(forecast.value, URGENT_DAYS).filter((r) => !r.alreadyLow);
});

// Only the 3 most urgent go in the banner
const visibleRestock = computed(() => {
  return restockSoon.value.slice(0, MAX_SHOWN);
});

// How long a material's bar is: days left out of 7 (a sliver is always visible)
function barPercent(daysLeft) {
  let percent = Math.round((daysLeft / URGENT_DAYS) * 100);
  return Math.max(4, Math.min(100, percent));
}

// Red = 3 days or less, amber = later in the week
function barColour(daysLeft) {
  if (daysLeft <= 3) return 'is-red';
  return 'is-amber';
}

// The forecast for one material (used inside each card), or null
function forecastFor(materialId) {
  if (forecast.value === null) {
    return null;
  }
  let found = forecast.value.materials.find((f) => f.id === materialId);
  return found || null;
}

// How full the stock bar on a card is (0–100).
// Exact amounts: a full bar = 3× the low-stock level.
// Levels: Low / Medium / High = a quarter / half / full bar.
function stockPercent(m) {
  if (m.trackingMode === 'level') {
    if (m.level === 'low') return 25;
    if (m.level === 'medium') return 55;
    return 100;
  }
  if (!m.lowStockThreshold) {
    return 100; // no low-stock level set, nothing to compare with
  }
  let percent = Math.round((m.quantity / (m.lowStockThreshold * 3)) * 100);
  return Math.max(4, Math.min(100, percent)); // keep a sliver visible, never over 100
}

// =====================================================
// 4. ADD / EDIT / DELETE
// =====================================================
function openAddForm() {
  editingId.value = null;
  form.value = {
    name: '',
    unit: 'g',
    trackingMode: 'quantity',
    quantity: 0,
    level: 'medium',
    lowStockThreshold: null,
  };
  formError.value = '';
  showForm.value = true;
}

// Called by MaterialCard's $emit('edit', material)
function openEditForm(material) {
  editingId.value = material.id;
  // Copy the material's values into the form
  form.value = {
    name: material.name,
    unit: material.unit,
    trackingMode: material.trackingMode,
    quantity: material.quantity || 0,
    level: material.level || 'medium',
    lowStockThreshold: material.lowStockThreshold,
  };
  formError.value = '';
  showForm.value = true;
}

async function saveForm() {
  if (form.value.name.trim() === '') {
    formError.value = 'Please enter a name';
    return;
  }

  try {
    if (editingId.value === null) {
      // Add a new material
      let url = '/api/materials';
      await axios.post(url, form.value);
    } else {
      // Edit an existing material
      let url = '/api/materials/' + editingId.value;
      await axios.put(url, form.value);
    }

    showForm.value = false;
    await reloadAll(); // refresh the list and forecast
  } catch (error) {
    formError.value = getErrorText(error);
  }
}

async function deleteMaterial() {
  if (!confirm('Delete ' + form.value.name + '?')) {
    return; // user pressed Cancel
  }

  let url = '/api/materials/' + editingId.value;

  try {
    await axios.delete(url);
    showForm.value = false;
    await reloadAll();
  } catch (error) {
    formError.value = getErrorText(error);
  }
}

// =====================================================
// 5. MARK AS RESTOCKED
// =====================================================

// Called by MaterialCard's $emit('restock', material)
async function markRestocked(material) {
  if (material.trackingMode === 'level') {
    // Level materials: one tap sets the level to High
    let url = '/api/materials/' + material.id + '/restock';

    try {
      await axios.patch(url, { level: 'high' });
      await reloadAll();
    } catch (error) {
      errorMessage.value = getErrorText(error);
    }
  } else {
    // Quantity materials: open the pop-up to ask how much was bought
    restockTarget.value = material;
    restockAmount.value = 0;
    restockError.value = '';
  }
}

async function saveRestock() {
  if (restockAmount.value <= 0) {
    restockError.value = 'Enter how much you bought';
    return;
  }

  let url = '/api/materials/' + restockTarget.value.id + '/restock';

  try {
    await axios.patch(url, { amount: restockAmount.value });
    restockTarget.value = null; // close the pop-up
    await reloadAll();
  } catch (error) {
    restockError.value = getErrorText(error);
  }
}
</script>

<template>
  <div class="inv-page" data-testid="page-materials">

    <!-- ===== Title and Add button ===== -->
    <header class="page-header">
      <div>
        <h1>Materials</h1>
        <p>What you have in stock</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openAddForm">+ Add material</button>
    </header>

    <!-- ===== Error message ===== -->
    <div v-if="errorMessage" class="inv-banner inv-banner--danger mb-3">{{ errorMessage }}</div>

    <!-- ===== Low stock banner (only when something is low) ===== -->
    <div v-if="lowMaterials.length > 0" class="inv-banner inv-banner--warn mb-3">
      <p class="inv-banner__title">
        🛒 <strong>{{ lowMaterials.length }}</strong> material(s) running low
      </p>
      <button type="button" class="btn btn-light btn-sm" @click="showShoppingList = true">
        View shopping list
      </button>
    </div>

    <!-- ===== Restock soon: materials that go low / run out within 7 days (max 3) ===== -->
    <section v-if="restockSoon.length > 0" class="fc-restock mb-4">
      <h2 class="fc-restock__title">📅 Restock soon</h2>

      <div v-for="item in visibleRestock" :key="item.id" class="fc-row">
        <span class="fc-row__name">{{ item.name }}</span>
        <div class="fc-bar" aria-hidden="true">
          <span :class="barColour(item.actIn)" :style="{ width: barPercent(item.actIn) + '%' }"></span>
        </div>
        <span class="fc-days" :class="barColour(item.actIn)">{{ restockStatusText(item) }}</span>
        <div class="fc-action">
          <template v-if="item.amountText">Buy <strong>~{{ item.amountText }}</strong></template>
          <template v-else>Check stock</template>
          <strong v-if="item.actOn === null"> today</strong>
          <template v-else> by <strong>{{ formatDay(item.actOn) }}</strong></template>
        </div>
      </div>

      <div class="fc-foot">
        <span>Based on your last 8 weeks of orders and the orders already logged.</span>
        <RouterLink to="/forecast" class="fc-link">
          <template v-if="restockSoon.length > MAX_SHOWN">+ {{ restockSoon.length - MAX_SHOWN }} more · </template>See full forecast →
        </RouterLink>
      </div>
    </section>

    <!-- No order history yet = nothing to learn from -->
    <p v-if="forecast !== null && forecast.historyOrderCount === 0" class="inv-meta mb-3">
      📅 The forecast starts working once you have some completed orders.
    </p>

    <!-- ===== Filter chips and search ===== -->
    <div class="sk-card inv-toolbar mb-4">
      <div class="chips">
        <button type="button" class="chip" :class="{ 'is-active': !showLowOnly }" @click="setShowLowOnly(false)">
          All
        </button>
        <button type="button" class="chip" :class="{ 'is-active': showLowOnly }" @click="setShowLowOnly(true)">
          Low stock
          <span v-if="lowMaterials.length > 0" class="count">{{ lowMaterials.length }}</span>
        </button>
      </div>
      <input id="material-search" v-model="search" class="form-control inv-search" placeholder="Search materials"
        aria-label="Search materials" />
    </div>

    <!-- ===== Material cards ===== -->
    <TransitionGroup v-if="visibleMaterials.length > 0" name="list" tag="div" class="sk-grid">

      <!-- Prop: :material.  Events: @restock and @edit (the card sends the material back). -->
      <MaterialCard v-for="m in visibleMaterials" :key="m.id" :material="m" @restock="markRestocked"
        @edit="openEditForm">
        <!-- Everything in here goes into the card's <slot> -->

        <!-- Quantity materials show a number -->
        <template v-if="m.trackingMode === 'quantity'">
          <div class="inv-qty">{{ m.quantity }}<small>{{ m.unit }}</small></div>
          <div class="inv-meter" aria-hidden="true">
            <span :class="{ 'is-low': m.isLow }" :style="{ width: stockPercent(m) + '%' }"></span>
          </div>
          <p v-if="m.lowStockThreshold !== null" class="inv-meta">
            Low below {{ m.lowStockThreshold }} {{ m.unit }}
          </p>
          <!-- From the forecast -->
          <span v-if="forecastFor(m.id) && forecastFor(m.id).runsLowOn" class="inv-forecast">
            📅 Runs low {{ formatDay(forecastFor(m.id).runsLowOn) }}
          </span>
        </template>

        <!-- Level materials show Low / Medium / High -->
        <template v-else>
          <div class="inv-qty inv-level">{{ m.level }}</div>
          <div class="inv-meter" aria-hidden="true">
            <span :class="{ 'is-low': m.isLow }" :style="{ width: stockPercent(m) + '%' }"></span>
          </div>
          <p class="inv-meta">Tracked by level</p>
        </template>

        <p v-if="m.usedIn.length > 0" class="inv-used">
          Used in {{ m.usedIn.join(', ') }}
        </p>
      </MaterialCard>

    </TransitionGroup>

    <div v-else class="empty-state">
      <template v-if="materials.length === 0">No materials yet. Add your first one to start tracking stock.</template>
      <template v-else>No materials match.</template>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Add / Edit material                            -->
    <!-- ===================================================== -->
    <div v-if="showForm" class="modal d-block inv-modal">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingId === null ? 'Add material' : 'Edit material' }}</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="showForm = false"></button>
          </div>

          <div class="modal-body">
            <div v-if="formError" class="inv-banner inv-banner--danger mb-3">{{ formError }}</div>

            <label for="material-name" class="form-label">Name</label>
            <input id="material-name" v-model="form.name" class="form-control mb-3" placeholder="e.g. Matcha powder" />

            <label for="material-unit" class="form-label">Unit</label>
            <select id="material-unit" v-model="form.unit" class="form-select mb-3">
              <option value="g">grams (g)</option>
              <option value="ml">millilitres (ml)</option>
              <option value="pieces">pieces</option>
            </select>

            <span class="form-label d-block">How do you track it?</span>
            <div class="inv-segment mb-3">
              <button type="button" class="chip" :class="{ 'is-active': form.trackingMode === 'quantity' }"
                @click="form.trackingMode = 'quantity'">
                Exact amount
              </button>
              <button type="button" class="chip" :class="{ 'is-active': form.trackingMode === 'level' }"
                @click="form.trackingMode = 'level'">
                Low / Medium / High
              </button>
            </div>

            <!-- Only for exact amount -->
            <div v-if="form.trackingMode === 'quantity'" class="row g-3">
              <div class="col-sm-6">
                <label for="material-qty" class="form-label">How much do you have now?</label>
                <input id="material-qty" v-model.number="form.quantity" type="number" min="0" class="form-control" />
              </div>
              <div class="col-sm-6">
                <label for="material-threshold" class="form-label">Warn me below (optional)</label>
                <input id="material-threshold" v-model.number="form.lowStockThreshold" type="number" min="0"
                  class="form-control" />
              </div>
            </div>

            <!-- Only for level -->
            <div v-else>
              <label for="material-level" class="form-label">Current level</label>
              <select id="material-level" v-model="form.level" class="form-select">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div class="modal-footer">
            <button v-if="editingId !== null" type="button" class="btn btn-outline-danger btn-sm me-auto"
              @click="deleteMaterial">
              Delete
            </button>
            <button type="button" class="btn btn-light" @click="showForm = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveForm">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Restock (quantity materials only)              -->
    <!-- ===================================================== -->
    <div v-if="restockTarget !== null" class="modal d-block inv-modal">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Restock {{ restockTarget.name }}</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="restockTarget = null"></button>
          </div>

          <div class="modal-body">
            <div v-if="restockError" class="inv-banner inv-banner--danger mb-3">{{ restockError }}</div>
            <p class="inv-meta mb-3">You have <strong>{{ restockTarget.quantity }} {{ restockTarget.unit }}</strong>
              now.
            </p>
            <label for="restock-amount" class="form-label">How much did you buy?</label>
            <div class="input-group">
              <input id="restock-amount" v-model.number="restockAmount" type="number" min="0" class="form-control" />
              <span class="input-group-text">{{ restockTarget.unit }}</span>
            </div>
            <p class="mt-3 mb-0">
              New total: <strong>{{ restockTarget.quantity + restockAmount }} {{ restockTarget.unit }}</strong>
            </p>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-light" @click="restockTarget = null">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveRestock">Mark as restocked</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Shopping list                                  -->
    <!-- ===================================================== -->
    <div v-if="showShoppingList" class="modal d-block inv-modal">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">🛒 Shopping list</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="showShoppingList = false"></button>
          </div>

          <div class="modal-body">
            <p v-if="lowMaterials.length === 0" class="inv-meta">Nothing is running low!</p>
            <div v-for="m in lowMaterials" :key="m.id" class="inv-shop-row">
              <div>
                <strong>{{ m.name }}</strong>
                <p v-if="m.trackingMode === 'quantity'" class="inv-meta">
                  Have {{ m.quantity }} {{ m.unit }} · low below {{ m.lowStockThreshold }}
                </p>
                <p v-else class="inv-meta">Level is low</p>
              </div>
              <span class="status status--danger">Low</span>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-light" @click="showShoppingList = false">Close</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>