<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import ProductCard from '../components/ProductCard.vue';
import '../assets/inventory.css'; // styles for the Materials and Products pages
import { fullRecipe, calculateCanMake } from '../utils/capacity.js';

const route = useRoute();   // the current address (to read ?add=1)
const router = useRouter(); // to change the address

// =====================================================
// 1. DATA
// =====================================================
const products = ref([]);         // all products from the server
const materials = ref([]);        // all materials (needed for recipes and "can make")
const errorMessage = ref('');
const infoMessage = ref('');      // blue message, e.g. "... was archived"
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
// Every option a customer can order gets its own row:
//   - the plain product (main recipe only). Called "Regular" when the product has variants.
//   - one row PER VARIANT (main recipe + that variant's extras)
//
// Each item in this list = { product, rows: [{ name, price, canMake, limitedBy, warnings }] }
const productCards = computed(() => {
  let list = [];

  for (let product of products.value) {
    let rows = [];

    // The plain product: just the main recipe.
    // Always called "Regular", so every card looks the same
    let plain = calculateCanMake(fullRecipe(product, null), materials.value);
    rows.push({
      name: 'Regular',
      price: product.price,
      canMake: plain.canMake,
      limitedBy: plain.limitedBy,
      warnings: plain.warnings,
    });

    if (product.variants.length > 0) {
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
        // Only add "(Regular)" / "(Oat milk)" when the product has variants
        if (item.product.variants.length > 0) {
          fullName = fullName + ' (' + row.name + ')';
        }
        names.push(fullName + ' — out of ' + row.limitedBy);
      }
    }
  }
  return names;
});

// Colour class of the "can make" number (the classes are in inventory.css)
function canMakeColour(canMake) {
  if (canMake === null) return 'cap--none';
  if (canMake === 0) return 'cap--danger';
  if (canMake < 5) return 'cap--warn';
  return 'cap--ok';
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
    cost: null,                                   // cost to make one (optional)
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
    variantsCopy.push({ _id: v._id, name: v.name, price: v.price, cost: v.cost ?? null, extras: copyLines(v.extras) });
  }

  form.value = {
    name: product.name,
    price: product.price,
    cost: product.cost ?? null, // older products may not have a cost yet
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
  form.value.variants.push({ name: '', price: null, cost: null, extras: [] });
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
      cost: v.cost === '' ? null : v.cost,    // empty box = same as product cost
      extras: cleanLines(v.extras),
    });
  }

  let productData = {
    name: form.value.name,
    price: form.value.price,
    cost: form.value.cost === '' ? null : form.value.cost, // empty box = no cost entered yet
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
  let name = form.value.name;

  try {
    let response = await axios.delete(url);

    // The server archives (hides) the product instead of deleting it
    // if past (ready / completed) orders use it. It replies { archived: true } then.
    if (response.data && response.data.archived) {
      infoMessage.value =
        name + ' is used in past orders, so it was archived (hidden) instead of deleted. ' +
        'Old orders will still show it.';
    } else {
      infoMessage.value = name + ' was deleted.';
    }

    showForm.value = false;
    await loadData();
  } catch (error) {
    // e.g. "... is in 1 in-progress order(s). Complete or cancel them first."
    formError.value = getErrorText(error);
  }
}
</script>

<template>
  <div class="inv-page" data-testid="page-products">

    <!-- ===== Title and Add button ===== -->
    <header class="page-header">
      <div>
        <h1>Products</h1>
        <p>How many you can make with your current stock</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openAddForm">+ Add product</button>
    </header>

    <!-- ===== Error message ===== -->
    <div v-if="errorMessage" class="inv-banner inv-banner--danger mb-3">{{ errorMessage }}</div>

    <!-- ===== Info message (e.g. after archiving or deleting) ===== -->
    <div v-if="infoMessage" class="inv-banner inv-banner--info mb-3">
      <span>{{ infoMessage }}</span>
      <button type="button" class="btn-close" aria-label="Dismiss" @click="infoMessage = ''"></button>
    </div>

    <!-- ===== Warning: products/variants that can't be made ===== -->
    <div v-if="cannotMake.length > 0" class="inv-banner inv-banner--warn mb-3">
      <div>
        <p class="inv-banner__title">⚠️ Can't make right now</p>
        <ul>
          <li v-for="name in cannotMake" :key="name">{{ name }}</li>
        </ul>
      </div>
    </div>

    <!-- ===== Search ===== -->
    <div class="sk-card inv-toolbar mb-4">
      <span class="inv-meta">{{ productCards.length }} product(s)</span>
      <input
        id="product-search"
        v-model="search"
        class="form-control inv-search"
        placeholder="Search products"
        aria-label="Search products"
      />
    </div>

    <!-- ===== Product cards ===== -->
    <TransitionGroup v-if="productCards.length > 0" name="list" tag="div" class="sk-grid inv-grid-top">
      <ProductCard
        v-for="item in productCards"
        :key="item.product.id"
        :product="item.product"
        @edit="openEditForm"
      >
        <!-- This goes into the card's <slot> -->
        <div class="inv-capacity">
          <div class="inv-capacity__label">Can make now</div>

          <!-- One row per option: Regular, then each variant -->
          <div v-for="(row, index) in item.rows" :key="index" class="inv-cap-row">
            <div class="inv-cap-row__main">
              <span class="inv-cap-row__name">
                {{ row.name }}<span class="price">${{ row.price.toFixed(2) }}</span>
              </span>
              <span v-if="row.canMake === null" class="cap-num cap--none">—</span>
              <span v-else class="cap-num" :class="canMakeColour(row.canMake)">{{ row.canMake }}</span>
            </div>
            <div v-if="row.limitedBy" class="inv-cap-row__note">Limited by {{ row.limitedBy }}</div>
            <div v-for="w in row.warnings" :key="w" class="inv-cap-row__warn">⚠️ {{ w }}</div>
          </div>
        </div>
      </ProductCard>
    </TransitionGroup>

    <div v-else class="empty-state">
      <template v-if="products.length === 0">No products yet. Add one and give it a recipe to see how many you can make.</template>
      <template v-else>No products match.</template>
    </div>

    <!-- ===================================================== -->
    <!-- POP-UP: Add / Edit product                             -->
    <!-- ===================================================== -->
    <div v-if="showForm" class="modal d-block inv-modal">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ editingId === null ? 'Add product' : 'Edit product' }}</h5>
            <button type="button" class="btn-close" aria-label="Close" @click="showForm = false"></button>
          </div>

          <div class="modal-body">
            <div v-if="formError" class="inv-banner inv-banner--danger mb-3">{{ formError }}</div>

            <!-- ----- Basics ----- -->
            <label for="product-name" class="form-label">Product name</label>
            <input id="product-name" v-model="form.name" class="form-control mb-3" placeholder="e.g. Matcha Latte" />

            <div class="row g-3">
              <div class="col-sm-4">
                <label for="product-price" class="form-label">Price ($)</label>
                <input id="product-price" v-model.number="form.price" type="number" min="0" step="0.5" class="form-control" />
              </div>
              <div class="col-sm-4">
                <label for="product-cost" class="form-label">Cost to make ($)</label>
                <input id="product-cost" v-model.number="form.cost" type="number" min="0" step="0.1" class="form-control" placeholder="e.g. 6.50" />
              </div>
              <div class="col-sm-4">
                <label for="product-time" class="form-label">Time to make (min)</label>
                <input id="product-time" v-model.number="form.makingTimeMins" type="number" min="0" class="form-control" placeholder="Optional" />
              </div>
            </div>

            <!-- ----- Main recipe ----- -->
            <h6 class="inv-section-title">
              Recipe <span class="hint">· materials for ONE unit, shared by every variant</span>
            </h6>
            <p v-if="materials.length === 0" class="inv-meta mb-2">
              You have no materials yet. Add some on the Materials page first.
            </p>

            <div v-for="(line, index) in form.recipe" :key="index" class="inv-line">
              <select v-model="line.material" class="form-select" :aria-label="`Recipe material ${index + 1}`">
                <option value="" disabled>Choose material…</option>
                <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
              </select>
              <input v-model.number="line.amountPerUnit" type="number" min="0" class="form-control" :aria-label="`Amount ${index + 1}`" />
              <span class="unit">{{ unitOf(line.material) }}</span>
              <button type="button" class="btn btn-light inv-remove" aria-label="Remove material" @click="removeRecipeRow(index)">✕</button>
            </div>
            <button type="button" class="btn btn-outline-primary btn-sm" @click="addRecipeRow">+ Add material</button>

            <!-- ----- Variants ----- -->
            <h6 class="inv-section-title">
              Variants <span class="hint">· optional, e.g. Small, Large, Oat milk</span>
            </h6>
            <p class="inv-meta mb-2">
              Customers can order the regular product or one variant. For a combination, add it as its own variant.
            </p>

            <div v-for="(variant, vIndex) in form.variants" :key="variant._id ?? vIndex" class="inv-variant">
              <div class="inv-variant__fields">
                <div>
                  <label :for="`variant-name-${vIndex}`" class="form-label">Variant name</label>
                  <input :id="`variant-name-${vIndex}`" v-model="variant.name" class="form-control" placeholder="e.g. Large" />
                </div>
                <div>
                  <label :for="`variant-price-${vIndex}`" class="form-label">Price ($)</label>
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
                <div>
                  <label :for="`variant-cost-${vIndex}`" class="form-label">Cost ($)</label>
                  <input
                    :id="`variant-cost-${vIndex}`"
                    v-model.number="variant.cost"
                    type="number"
                    min="0"
                    step="0.1"
                    class="form-control"
                    :placeholder="`Same: ${form.cost ?? '–'}`"
                  />
                </div>
                <button type="button" class="btn btn-light btn-sm" @click="removeVariant(vIndex)">Remove</button>
              </div>

              <div class="inv-meta mb-2">Extra materials only this variant uses:</div>
              <div v-for="(line, eIndex) in variant.extras" :key="eIndex" class="inv-line">
                <select v-model="line.material" class="form-select" :aria-label="`Extra material ${eIndex + 1}`">
                  <option value="" disabled>Choose material…</option>
                  <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
                <input v-model.number="line.amountPerUnit" type="number" min="0" class="form-control" :aria-label="`Extra amount ${eIndex + 1}`" />
                <span class="unit">{{ unitOf(line.material) }}</span>
                <button type="button" class="btn btn-light inv-remove" aria-label="Remove extra material" @click="removeExtraRow(variant, eIndex)">✕</button>
              </div>
              <button type="button" class="btn btn-outline-primary btn-sm" @click="addExtraRow(variant)">+ Add extra material</button>
            </div>

            <button type="button" class="btn btn-light btn-sm" @click="addVariant">+ Add variant</button>
          </div>

          <div class="modal-footer">
            <button
              v-if="editingId !== null"
              type="button"
              class="btn btn-outline-danger btn-sm me-auto"
              @click="deleteProduct"
            >
              Delete
            </button>
            <button type="button" class="btn btn-light" @click="showForm = false">Cancel</button>
            <button type="button" class="btn btn-primary" @click="saveForm">Save</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>