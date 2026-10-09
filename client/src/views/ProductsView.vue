<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import ProductCard from '../components/ProductCard.vue';
import { fullRecipe, calculateCanMake } from '../utils/capacity.js';

// =====================================================
// 1. DATA
// =====================================================
const products = ref([]);         // all products from the server
const materials = ref([]);        // all materials (needed for recipes and "can make")
const errorMessage = ref('');
const search = ref('');

// Add / Edit pop-up
const showForm = ref(false);
const editingId = ref(null);      // null = adding, otherwise the id being edited
const form = ref({});
const formError = ref('');

// =====================================================
// 2. LOAD PRODUCTS AND MATERIALS
// =====================================================
async function loadData() {
  try {
    let productsResponse = await axios.get('/api/products');
    let materialsResponse = await axios.get('/api/materials');

    products.value = productsResponse.data;
    materials.value = materialsResponse.data;
  } catch (error) {
    errorMessage.value = getErrorText(error);
  }
}

onMounted(() => {
  loadData();
});

function getErrorText(error) {
  if (error.response && error.response.data && error.response.data.message) {
    return error.response.data.message;
  }
  return error.message;
}

// =====================================================
// 3. MERGE PRODUCTS + MATERIALS → "CAN MAKE"
// =====================================================

// For every product, work out how many can be made.
// A product with variants gets one row PER VARIANT.
// A product without variants gets one row for the main recipe.
//
// Each item in this list = { product, rows: [{ name, price, canMake, limitedBy, warnings }] }
const productCards = computed(() => {
  let list = [];

  for (let product of products.value) {
    let rows = [];

    if (product.variants.length === 0) {
      // No variants: just the main recipe
      let result = calculateCanMake(fullRecipe(product, null), materials.value);
      rows.push({
        name: '',
        price: product.price,
        canMake: result.canMake,
        limitedBy: result.limitedBy,
        warnings: result.warnings,
      });
    } else {
      // One row per variant: main recipe + that variant's extras
      for (let variant of product.variants) {
        let result = calculateCanMake(fullRecipe(product, variant), materials.value);
        rows.push({
          name: variant.name,
          price: variant.price ?? product.price, // empty price = product's price (?? so a $0 variant stays $0)
          canMake: result.canMake,
          limitedBy: result.limitedBy,
          warnings: result.warnings,
        });
      }
    }

    list.push({ product: product, rows: rows });
  }

  if (search.value !== '') {
    let text = search.value.toLowerCase();
    list = list.filter((item) => item.product.name.toLowerCase().includes(text));
  }

  return list;
});

// Every product/variant that cannot be made right now (for the warning banner)
const cannotMake = computed(() => {
  let names = [];
  for (let item of productCards.value) {
    for (let row of item.rows) {
      if (row.canMake === 0) {
        let fullName = item.product.name;
        if (row.name !== '') {
          fullName = fullName + ' (' + row.name + ')';
        }
        names.push(fullName + ' — out of ' + row.limitedBy);
      }
    }
  }
  return names;
});

// Colour of the "can make" number
function canMakeColour(canMake) {
  if (canMake === null) return 'text-muted';
  if (canMake === 0) return 'text-danger';
  if (canMake < 5) return 'text-warning';
  return 'text-success';
}

// Unit of a material, for the form ("g", "ml", "pieces")
function unitOf(materialId) {
  let material = materials.value.find((m) => m.id === materialId);
  if (material) {
    return material.unit;
  }
  return '';
}

// =====================================================
// 4. OPEN THE FORM (ADD / EDIT)
// =====================================================
function openAddForm() {
  editingId.value = null;
  form.value = {
    name: '',
    price: 0,
    makingTimeMins: null,
    recipe: [{ material: '', amountPerUnit: 0 }], // start with one empty row
    variants: [],                                 // no variants to start with
  };
  formError.value = '';
  showForm.value = true;
}

// Copy a list of recipe lines, so editing the form doesn't change the card
// until the seller presses Save.
function copyLines(lines) {
  let copy = [];
  for (let line of lines) {
    copy.push({ material: line.material, amountPerUnit: line.amountPerUnit });
  }
  return copy;
}

// Called by ProductCard's $emit('edit', product)
function openEditForm(product) {
  editingId.value = product.id;

  let variantsCopy = [];
  for (let v of product.variants) {
    // Keep _id so the server updates this variant instead of making a new one.
    // Orders point at variants by _id, so losing it would break old orders.
    variantsCopy.push({ _id: v._id, name: v.name, price: v.price, extras: copyLines(v.extras) });
  }

  form.value = {
    name: product.name,
    price: product.price,
    makingTimeMins: product.makingTimeMins,
    recipe: copyLines(product.recipe),
    variants: variantsCopy,
  };
  formError.value = '';
  showForm.value = true;
}

// =====================================================
// 5. ROWS IN THE FORM
// =====================================================

// Main recipe rows
function addRecipeRow() {
  form.value.recipe.push({ material: '', amountPerUnit: 0 });
}
function removeRecipeRow(index) {
  form.value.recipe.splice(index, 1); // remove 1 item at this position
}

// Variants
function addVariant() {
  form.value.variants.push({ name: '', price: null, extras: [] });
}
function removeVariant(index) {
  form.value.variants.splice(index, 1);
}

// Extra materials inside one variant
function addExtraRow(variant) {
  variant.extras.push({ material: '', amountPerUnit: 0 });
}
function removeExtraRow(variant, index) {
  variant.extras.splice(index, 1);
}

// =====================================================
// 6. SAVE / DELETE
// =====================================================

// Drop rows where no material was chosen or the amount is 0
function cleanLines(lines) {
  return lines.filter((line) => line.material !== '' && line.amountPerUnit > 0);
}

async function saveForm() {
  if (form.value.name.trim() === '') {
    formError.value = 'Please enter a product name';
    return;
  }

  // Check every variant has a name, and tidy up its extras
  let cleanVariants = [];
  for (let v of form.value.variants) {
    if (v.name.trim() === '') {
      formError.value = 'Every variant needs a name';
      return;
    }
    cleanVariants.push({
      _id: v._id, // undefined for a new variant; the server gives it one
      name: v.name,
      price: v.price === '' ? null : v.price, // empty box = same as product price
      extras: cleanLines(v.extras),
    });
  }

  let productData = {
    name: form.value.name,
    price: form.value.price,
    makingTimeMins: form.value.makingTimeMins,
    recipe: cleanLines(form.value.recipe),
    variants: cleanVariants,
  };

  try {
    if (editingId.value === null) {
      let url = '/api/products';
      await axios.post(url, productData);
    } else {
      let url = '/api/products/' + editingId.value;
      await axios.put(url, productData);
    }

    showForm.value = false;
    await loadData();
  } catch (error) {
    formError.value = getErrorText(error);
  }
}

async function deleteProduct() {
  if (!confirm('Delete ' + form.value.name + '?')) {
    return;
  }

  let url = '/api/products/' + editingId.value;

  try {
    await axios.delete(url);
    showForm.value = false;
    await loadData();
  } catch (error) {
    formError.value = getErrorText(error); // e.g. "This product is in existing orders"
  }
}
</script>

<template>
  <section class="container py-3" data-testid="page-products">

    <!-- ===== Title and Add button ===== -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div>
        <h1 class="m-0">Products</h1>
        <p class="text-muted m-0">How many you can make with your current stock</p>
      </div>
      <button class="btn btn-success" @click="openAddForm">+ Add product</button>
    </div>

    <!-- ===== Error message ===== -->
    <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

    <!-- ===== Warning: products/variants that can't be made ===== -->
    <div v-if="cannotMake.length > 0" class="alert alert-warning">
      ⚠️ <strong>Can't make right now:</strong>
      <ul class="mb-0">
        <li v-for="name in cannotMake" :key="name">{{ name }}</li>
      </ul>
    </div>

    <!-- ===== Search ===== -->
    <input v-model="search" class="form-control mb-3" style="max-width: 300px" placeholder="Search products" />

    <!-- ===== Product cards ===== -->
    <p v-if="productCards.length === 0" class="text-muted">No products to show.</p>

    <div class="row g-3">
      <div v-for="item in productCards" :key="item.product.id" class="col-12 col-md-6 col-lg-4">

        <ProductCard :product="item.product" @edit="openEditForm">

          <!-- This goes into the card's <slot>: one row per variant -->
          <div class="border rounded p-2 mb-2 bg-light">
            <div class="small text-muted mb-1">Can make now</div>

            <div v-for="(row, index) in item.rows" :key="index" class="mb-2">
              <div class="d-flex justify-content-between align-items-center">
                <span v-if="row.name !== ''">
                  {{ row.name }} <span class="text-muted small">${{ row.price.toFixed(2) }}</span>
                </span>
                <span v-else></span>

                <span v-if="row.canMake === null" class="text-muted">—</span>
                <span v-else class="fs-5 fw-bold" :class="canMakeColour(row.canMake)">{{ row.canMake }}</span>
              </div>

              <div v-if="row.limitedBy" class="small text-muted">Limited by {{ row.limitedBy }}</div>
              <div v-for="w in row.warnings" :key="w" class="small text-warning">⚠️ {{ w }}</div>
            </div>
          </div>

        </ProductCard>
      </div>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Add / Edit product                             -->
    <!-- ===================================================== -->
    <div v-if="showForm" class="modal d-block popup-backdrop">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingId === null ? 'Add product' : 'Edit product' }}</h5>
            <button class="btn-close" @click="showForm = false"></button>
          </div>

          <div class="modal-body">
            <div v-if="formError" class="alert alert-danger py-2">{{ formError }}</div>

            <!-- ----- Basics ----- -->
            <label class="form-label">Product name</label>
            <input v-model="form.name" class="form-control mb-3" placeholder="e.g. Matcha Latte" />

            <div class="row mb-3">
              <div class="col">
                <label class="form-label">Price ($)</label>
                <input v-model.number="form.price" type="number" min="0" step="0.5" class="form-control" />
              </div>
              <div class="col">
                <label class="form-label">Time to make (min, optional)</label>
                <input v-model.number="form.makingTimeMins" type="number" min="0" class="form-control" />
              </div>
            </div>

            <!-- ----- Main recipe ----- -->
            <h6 class="mt-4">Recipe <span class="text-muted small">(materials for ONE unit, shared by every variant)</span></h6>
            <p v-if="materials.length === 0" class="text-muted small">
              You have no materials yet. Add some on the Materials page first.
            </p>

            <div v-for="(line, index) in form.recipe" :key="index" class="d-flex gap-2 mb-2">
              <select v-model="line.material" class="form-select">
                <option value="" disabled>Choose material…</option>
                <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
              <input v-model.number="line.amountPerUnit" type="number" min="0" class="form-control" style="max-width: 110px" />
              <span class="align-self-center" style="min-width: 50px">{{ unitOf(line.material) }}</span>
              <button class="btn btn-outline-danger" @click="removeRecipeRow(index)">✕</button>
            </div>
            <button class="btn btn-sm btn-outline-primary" @click="addRecipeRow">+ Add material</button>

            <!-- ----- Variants ----- -->
            <h6 class="mt-4">Variants <span class="text-muted small">(optional, e.g. Small, Large, Large + lavender topping)</span></h6>
            <p class="text-muted small mb-2">
              Customers pick one variant per item. For a combination, add it as its own variant.
            </p>

            <div v-for="(variant, vIndex) in form.variants" :key="variant._id ?? vIndex" class="border rounded p-3 mb-3 bg-light">
              <div class="d-flex gap-2 mb-2 align-items-end">
                <div class="flex-grow-1">
                  <label :for="`variant-name-${vIndex}`" class="form-label small mb-1">Variant name</label>
                  <input :id="`variant-name-${vIndex}`" v-model="variant.name" class="form-control" placeholder="e.g. Large" />
                </div>
                <div style="max-width: 140px">
                  <label :for="`variant-price-${vIndex}`" class="form-label small mb-1">Price ($)</label>
                  <input
                    :id="`variant-price-${vIndex}`"
                    v-model.number="variant.price"
                    type="number"
                    min="0"
                    step="0.5"
                    class="form-control"
                    :placeholder="`Same: ${form.price ?? 0}`"
                  />
                </div>
                <button class="btn btn-outline-danger" @click="removeVariant(vIndex)">Remove</button>
              </div>

              <div class="small text-muted mb-1">Extra materials only this variant uses:</div>
              <div v-for="(line, eIndex) in variant.extras" :key="eIndex" class="d-flex gap-2 mb-2">
                <select v-model="line.material" class="form-select">
                  <option value="" disabled>Choose material…</option>
                  <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
                <input v-model.number="line.amountPerUnit" type="number" min="0" class="form-control" style="max-width: 110px" />
                <span class="align-self-center" style="min-width: 50px">{{ unitOf(line.material) }}</span>
                <button class="btn btn-outline-danger" @click="removeExtraRow(variant, eIndex)">✕</button>
              </div>
              <button class="btn btn-sm btn-outline-primary" @click="addExtraRow(variant)">+ Add extra material</button>
            </div>

            <button class="btn btn-sm btn-outline-secondary" @click="addVariant">+ Add variant</button>
          </div>

          <div class="modal-footer">
            <button v-if="editingId !== null" class="btn btn-outline-danger me-auto" @click="deleteProduct">
              Delete
            </button>
            <button class="btn btn-secondary" @click="showForm = false">Cancel</button>
            <button class="btn btn-success" @click="saveForm">Save</button>
          </div>
        </div>
      </div>
    </div>

  </section>
</template>

<style scoped>
.popup-backdrop {
  background-color: rgba(0, 0, 0, 0.5);
}
</style>