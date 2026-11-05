<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import MaterialCard from '../components/MaterialCard.vue';
import ActionBanner from '../components/ActionBanner.vue';
import Pager from '../components/Pager.vue';
import WhatToBuyPanel from '../components/forecast/WhatToBuyPanel.vue';
import RestockModal from '../components/forecast/RestockModal.vue';
import '../assets/inventory.css'; // styles for the Materials and Products pages
import { formatDay, formatAmount, restockRowFor, daysBetween } from '../utils/forecast.js';

const route = useRoute();   // the current address (to read ?add=1)
const router = useRouter(); // to change the address


// 1. DATA
const materials = ref([]);        // all materials from the server
const banner = ref(null);         // message under the navbar, e.g. { type: 'success', text: 'Butter added' }
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

// Restock pop-up (shared RestockModal component): the rows to restock, or null = closed
const restockRows = ref(null);

// Forecast: for the "Runs low" pill on each card and the suggested restock amount
const forecast = ref(null);       // null = not loaded yet

// Paging: 12 cards per page
const PER_PAGE = 12;
const page = ref(1);

// The "What to buy" panel loads its own data. Changing this number makes it load again
// (after something here changes the stock, e.g. a restock from a card).
const panelKey = ref(0);

// "What to buy →" on Products / Home links here with ?highlight=<material id>,
// so that material stands out in the "What to buy" list
const highlightId = ref(null);


// 2. LOAD MATERIALS FROM THE SERVER
async function loadMaterials() {
  let url = '/api/materials';

  try {
    let response = await axios.get(url);
    materials.value = response.data;
  } catch (error) {
    banner.value = { type: 'error', text: "Couldn't load your materials: " + getErrorText(error) };
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

// Load everything again, including the "What to buy" panel
async function refreshEverything() {
  await reloadAll();
  panelKey.value++;
}

// Run once when the page opens
onMounted(() => {
  reloadAll();
  openFormFromLink(); // opened from the floating "+" button?
  highlightFromLink(); // opened from "What to buy →"?
});

// Remember which material to highlight, then tidy the address
// (same idea as ?add=1 below)
function highlightFromLink() {
  if (route.query.highlight) {
    highlightId.value = route.query.highlight;
    router.replace({ query: {} });
  }
}
watch(() => route.query.highlight, highlightFromLink);

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

// 3. COMPUTED VALUES (update automatically)

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

// Only the 12 cards on the current page
const pagedMaterials = computed(() => {
  let start = (page.value - 1) * PER_PAGE;
  return visibleMaterials.value.slice(start, start + PER_PAGE);
});

// Back to page 1 when the filter or search changes (page 3 may not exist any more)
watch([search, showLowOnly], () => {
  page.value = 1;
});

// After deleting the last card on the last page, step back a page
watch(visibleMaterials, (list) => {
  let lastPage = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (page.value > lastPage) {
    page.value = lastPage;
  }
});

// Amounts in the unit people think in: 6074 g → ["6.1", "kg"], 40 ml → ["40", "ml"]
// (split so the number can be big and the unit small on the card)
function amountParts(amount, unit) {
  let text = formatAmount(amount, unit);
  let space = text.indexOf(' ');
  return [text.slice(0, space), text.slice(space + 1)];
}

// The forecast for one material (used inside each card), or null
function forecastFor(materialId) {
  if (forecast.value === null) {
    return null;
  }
  let found = forecast.value.materials.find((f) => f.id === materialId);
  return found || null;
}

// "Low in 6 days" / "Low in 1 day" / "Low today" (same wording as the What to buy panel)
function lowInText(runsLowOn) {
  let days = daysBetween(forecast.value.today, runsLowOn);
  if (days <= 0) return 'Low today';
  return 'Low in ' + days + (days === 1 ? ' day' : ' days');
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

// 4. ADD / EDIT / DELETE
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

  let name = form.value.name;
  let isNew = editingId.value === null;

  try {
    if (isNew) {
      // Add a new material
      let url = '/api/materials';
      await axios.post(url, form.value);
    } else {
      // Edit an existing material
      let url = '/api/materials/' + editingId.value;
      await axios.put(url, form.value);
    }

    showForm.value = false;
    banner.value = { type: 'success', text: isNew ? name + ' added.' : 'Changes to ' + name + ' saved.' };
    await refreshEverything(); // refresh the cards, forecast and What to buy
  } catch (error) {
    formError.value = getErrorText(error);
  }
}

async function deleteMaterial() {
  if (!confirm('Delete ' + form.value.name + '?')) {
    return; // user pressed Cancel
  }

  let url = '/api/materials/' + editingId.value;
  let name = form.value.name;

  try {
    await axios.delete(url);
    showForm.value = false;
    banner.value = { type: 'success', text: name + ' deleted.' };
    await refreshEverything();
  } catch (error) {
    formError.value = getErrorText(error);
  }
}

// 5. MARK AS RESTOCKED

// Called by MaterialCard's $emit('restock', material)
async function markRestocked(material) {
  if (material.trackingMode === 'level') {
    // Level materials: one tap sets the level to High
    let url = '/api/materials/' + material.id + '/restock';

    try {
      await axios.patch(url, { level: 'high' });
      banner.value = { type: 'success', text: material.name + ' restocked. Level set to High.' };
      await refreshEverything();
    } catch (error) {
      banner.value = { type: 'error', text: "Couldn't restock " + material.name + ': ' + getErrorText(error) };
    }
  } else {
    // Quantity materials: open the Restock pop-up, pre-filled with a week's worth.
    // (If the forecast has nothing for it, the amount starts at 0 for the seller to fill in.)
    let row = restockRowFor(forecast.value, material.id);
    restockRows.value = [row || { ...material, buyAmount: 0 }];
  }
}

// After the Restock pop-up saves, from a card's Restock button
async function afterCardRestock(names) {
  banner.value = { type: 'success', text: names.join(', ') + ' restocked.' };
  await refreshEverything();
}

// After the What to buy panel restocks (it already reloaded itself)
async function afterPanelRestock(names) {
  banner.value = {
    type: 'success',
    text: names.length === 1 ? names[0] + ' restocked.' : names.length + ' materials restocked: ' + names.join(', ') + '.',
  };
  await reloadAll();
}
</script>

<template>
  <div class="inv-page" data-testid="page-materials">

    <!-- ===== Title and Add button ===== -->
    <header class="page-header">
      <div>
        <h1>Materials</h1>
        <p>What you have, and what to buy next</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openAddForm">+ Add material</button>
    </header>

    <!-- ===== What just happened (sticks under the navbar) ===== -->
    <ActionBanner :message="banner" @close="banner = null" />

    <!-- No order history yet = nothing to learn from -->
    <p v-if="forecast !== null && forecast.historyOrderCount === 0" class="inv-meta mb-3">
      📅 Suggestions on what to buy start once you have some completed orders.
    </p>

    <!-- Cards on the left, "What to buy" on the right (stacks on small screens) -->
    <div class="mat-layout">
      <div class="mat-layout__main">

        <!-- ===== Filter chips and search ===== -->
        <div class="sk-card inv-toolbar mb-3">
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

        <!-- ===== Material cards (12 per page) ===== -->
        <TransitionGroup v-if="visibleMaterials.length > 0" name="list" tag="div" class="mat-grid">

          <!-- Prop: :material.  Events: @restock and @edit (the card sends the material back). -->
          <MaterialCard v-for="m in pagedMaterials" :key="m.id" :material="m" @restock="markRestocked"
            @edit="openEditForm">
            <!-- Everything in here goes into the card's <slot> -->

            <!-- Quantity materials show a number, in an easy unit (6.1 kg, not 6074 g) -->
            <template v-if="m.trackingMode === 'quantity'">
              <div class="inv-qty">
                {{ amountParts(m.quantity, m.unit)[0] }}<small>{{ amountParts(m.quantity, m.unit)[1] }}</small>
              </div>
              <div class="inv-meter" aria-hidden="true">
                <span :class="{ 'is-low': m.isLow }" :style="{ width: stockPercent(m) + '%' }"></span>
              </div>
              <p v-if="m.lowStockThreshold !== null" class="inv-meta">
                Low below {{ formatAmount(m.lowStockThreshold, m.unit) }}
              </p>
              <!-- From the forecast -->
              <!-- title = the exact date, shown when you hover -->
              <span v-if="forecastFor(m.id) && forecastFor(m.id).runsLowOn" class="inv-forecast"
                :title="formatDay(forecastFor(m.id).runsLowOn)">
                📅 {{ lowInText(forecastFor(m.id).runsLowOn) }}
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

        <Pager v-model="page" :total="visibleMaterials.length" :per-page="PER_PAGE" item-name="materials" />
      </div>

      <!-- ===== What to buy (loads its own data; :key makes it reload) ===== -->
      <div class="mat-layout__side">
        <WhatToBuyPanel :key="panelKey" :highlight="highlightId" @restocked="afterPanelRestock" />
      </div>
    </div>

    <!-- POP-UP: Add / Edit material                            -->
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
              <option value="cm">centimetres (cm)</option>
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

    <!-- ===== Restock pop-up (shared component), from a card's Restock button ===== -->
    <RestockModal v-if="restockRows" :rows="restockRows" @close="restockRows = null" @saved="afterCardRestock" />

  </div>
</template>
<style scoped>
/* Cards on the left, the "What to buy" panel on the right */
.mat-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 1.25rem;
  align-items: start;
}
/* The panel stays in view while scrolling through the cards (80px = below the navbar) */
.mat-layout__side { position: sticky; top: 80px; }

/* 4 cards per row on a wide screen */
.mat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
  align-items: stretch;
}

@media (max-width: 1399.98px) {
  .mat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
/* Tablets: panel goes above the cards */
@media (max-width: 1199.98px) {
  .mat-layout { grid-template-columns: 1fr; }
  .mat-layout__side { position: static; order: -1; }
}
@media (max-width: 767.98px) {
  .mat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 479.98px) {
  .mat-grid { grid-template-columns: 1fr; }
}
</style>