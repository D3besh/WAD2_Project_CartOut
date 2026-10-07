<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import MaterialCard from '../components/MaterialCard.vue';

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

// Run once when the page opens
onMounted(() => {
  loadMaterials();
});

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
    await loadMaterials(); // refresh the list
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
    await loadMaterials();
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
      await loadMaterials();
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
    await loadMaterials();
  } catch (error) {
    restockError.value = getErrorText(error);
  }
}
</script>

<template>
  <section class="container py-3" data-testid="page-materials">

    <!-- ===== Title and Add button ===== -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="m-0">Materials</h1>
      <button class="btn btn-success" @click="openAddForm">+ Add material</button>
    </div>

    <!-- ===== Error message ===== -->
    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <!-- ===== Shopping list banner (only when something is low) ===== -->
    <div
      v-if="lowMaterials.length > 0"
      class="alert alert-warning d-flex justify-content-between align-items-center"
    >
      <span>🛒 <strong>{{ lowMaterials.length }}</strong> material(s) running low</span>
      <button class="btn btn-sm btn-dark" @click="showShoppingList = true">View shopping list</button>
    </div>

    <!-- ===== Filter and search ===== -->
    <div class="d-flex flex-wrap gap-2 mb-3">
      <button
        class="btn btn-sm"
        :class="showLowOnly ? 'btn-outline-secondary' : 'btn-secondary'"
        @click="setShowLowOnly(false)"
      >
        All
      </button>
      <button
        class="btn btn-sm"
        :class="showLowOnly ? 'btn-secondary' : 'btn-outline-secondary'"
        @click="setShowLowOnly(true)"
      >
        Low stock ({{ lowMaterials.length }})
      </button>
      <input
        v-model="search"
        class="form-control form-control-sm ms-auto"
        style="max-width: 250px"
        placeholder="Search materials"
      />
    </div>

    <!-- ===== Material cards ===== -->
    <p v-if="visibleMaterials.length === 0" class="text-muted">No materials to show.</p>

    <div class="row g-3">
      <div v-for="m in visibleMaterials" :key="m.id" class="col-12 col-md-6 col-lg-4">

        <!-- Prop: :material.  Events: @restock and @edit (the card sends the material back). -->
        <MaterialCard :material="m" @restock="markRestocked" @edit="openEditForm">

          <!-- Everything in here goes into the card's <slot> -->

          <!-- Quantity materials show a number -->
          <div v-if="m.trackingMode === 'quantity'">
            <p class="fs-4 fw-bold mb-1">{{ m.quantity }} {{ m.unit }}</p>
            <p v-if="m.lowStockThreshold !== null" class="text-muted small mb-1">
              Low below {{ m.lowStockThreshold }} {{ m.unit }}
            </p>
          </div>

          <!-- Level materials show Low / Medium / High -->
          <div v-else>
            <p class="fs-4 fw-bold mb-1 text-capitalize">{{ m.level }}</p>
            <p class="text-muted small mb-1">Tracked by level</p>
          </div>

          <p v-if="m.usedIn.length > 0" class="small mb-2">
            Used in: {{ m.usedIn.join(', ') }}
          </p>

        </MaterialCard>
      </div>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Add / Edit material                            -->
    <!-- ===================================================== -->
    <div v-if="showForm" class="modal d-block popup-backdrop">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingId === null ? 'Add material' : 'Edit material' }}</h5>
            <button class="btn-close" @click="showForm = false"></button>
          </div>

          <div class="modal-body">
            <div v-if="formError" class="alert alert-danger py-2">{{ formError }}</div>

            <label class="form-label">Name</label>
            <input v-model="form.name" class="form-control mb-3" placeholder="e.g. Matcha powder" />

            <label class="form-label">Unit</label>
            <select v-model="form.unit" class="form-select mb-3">
              <option value="g">grams (g)</option>
              <option value="ml">millilitres (ml)</option>
              <option value="pieces">pieces</option>
            </select>

            <label class="form-label d-block">How do you track it?</label>
            <div class="form-check form-check-inline mb-3">
              <input v-model="form.trackingMode" id="mode-qty" type="radio" value="quantity" class="form-check-input" />
              <label for="mode-qty" class="form-check-label">Exact amount</label>
            </div>
            <div class="form-check form-check-inline mb-3">
              <input v-model="form.trackingMode" id="mode-level" type="radio" value="level" class="form-check-input" />
              <label for="mode-level" class="form-check-label">Low / Medium / High</label>
            </div>

            <!-- Only for exact amount -->
            <div v-if="form.trackingMode === 'quantity'">
              <label class="form-label">How much do you have now?</label>
              <input v-model.number="form.quantity" type="number" min="0" class="form-control mb-3" />

              <label class="form-label">Warn me when it drops below (optional)</label>
              <input v-model.number="form.lowStockThreshold" type="number" min="0" class="form-control" />
            </div>

            <!-- Only for level -->
            <div v-else>
              <label class="form-label">Current level</label>
              <select v-model="form.level" class="form-select">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div class="modal-footer">
            <button v-if="editingId !== null" class="btn btn-outline-danger me-auto" @click="deleteMaterial">
              Delete
            </button>
            <button class="btn btn-secondary" @click="showForm = false">Cancel</button>
            <button class="btn btn-success" @click="saveForm">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Restock (quantity materials only)              -->
    <!-- ===================================================== -->
    <div v-if="restockTarget !== null" class="modal d-block popup-backdrop">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Restock {{ restockTarget.name }}</h5>
            <button class="btn-close" @click="restockTarget = null"></button>
          </div>

          <div class="modal-body">
            <div v-if="restockError" class="alert alert-danger py-2">{{ restockError }}</div>
            <p>You have {{ restockTarget.quantity }} {{ restockTarget.unit }} now.</p>
            <label class="form-label">How much did you buy? ({{ restockTarget.unit }})</label>
            <input v-model.number="restockAmount" type="number" min="0" class="form-control" />
            <p class="mt-2 mb-0">
              New total: <strong>{{ restockTarget.quantity + restockAmount }} {{ restockTarget.unit }}</strong>
            </p>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" @click="restockTarget = null">Cancel</button>
            <button class="btn btn-success" @click="saveRestock">Mark as restocked</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Shopping list                                  -->
    <!-- ===================================================== -->
    <div v-if="showShoppingList" class="modal d-block popup-backdrop">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">🛒 Shopping list</h5>
            <button class="btn-close" @click="showShoppingList = false"></button>
          </div>

          <div class="modal-body">
            <p v-if="lowMaterials.length === 0">Nothing is running low!</p>
            <ul class="list-group">
              <li v-for="m in lowMaterials" :key="m.id" class="list-group-item">
                <strong>{{ m.name }}</strong><br />
                <small v-if="m.trackingMode === 'quantity'" class="text-muted">
                  Have {{ m.quantity }} {{ m.unit }} (low below {{ m.lowStockThreshold }})
                </small>
                <small v-else class="text-muted">Level is low</small>
              </li>
            </ul>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" @click="showShoppingList = false">Close</button>
          </div>
        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
/* Dark see-through background behind the pop-ups */
.popup-backdrop {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>