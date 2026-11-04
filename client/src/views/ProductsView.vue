<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import ProductCard from '../components/ProductCard.vue';
import ActionBanner from '../components/ActionBanner.vue';
import Pager from '../components/Pager.vue';
import '../assets/inventory.css'; // styles for the Materials and Products pages
import { fullRecipe, calculateCanMake } from '../utils/capacity.js';
import { dayForecast } from '../utils/forecast.js';

const route = useRoute();   // the current address (to read ?add=1)
const router = useRouter(); // to change the address

// =====================================================
// 1. DATA
// =====================================================
const products = ref([]);         // all products from the server
const materials = ref([]);        // all materials (needed for recipes and "can make")
const banner = ref(null);         // message under the navbar, e.g. { type: 'success', text: 'Brownies added' }
const search = ref('');
const forecast = ref(null);       // the 30-day forecast from the server (null = not loaded)

const suggestions = ref([]);          // from /api/products/price-suggestions
const suggestionsError = ref('');
const showSuggestions = ref(true);
const margin = ref(40);               // target margin in %, sent to the server as 0.40

// Paging: 12 cards per page
const PER_PAGE = 12;
const page = ref(1);

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
    banner.value = { type: 'error', text: "Couldn't load your products: " + getErrorText(error) };
  }

  await loadForecast();
  await loadSuggestions();
}

// Load the forecast (for the "Tomorrow" column)
async function loadForecast() {
  try {
    let response = await axios.get('/api/materials/forecast');
    forecast.value = response.data;
  } catch (error) {
    // The forecast is extra information, so if it fails the page still works
    console.error('Forecast failed:', getErrorText(error));
  }
}

// Price suggestions (extra info, so a failure never blocks the page)
async function loadSuggestions() {
  // keep the margin in a sensible range
  if (!(margin.value >= 0)) margin.value = 0;
  if (margin.value > 90) margin.value = 90;

  try {
    let response = await axios.get('/api/products/price-suggestions', {
      params: { margin: autoMargin.value ? 'auto' : margin.value / 100 },
    });
    suggestions.value = response.data.suggestions;
    suggestionsError.value = '';
  } catch (error) {
    suggestions.value = [];
    suggestionsError.value = getErrorText(error);
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
// Each item in this list = { product, rows: [{ name, price, canMake, limitedBy, warnings, tomorrow }] }
//   tomorrow = { orders, extra } from the forecast, or null
const productCards = computed(() => {
  let list = [];

  for (let product of products.value) {
    let rows = [];
    let hasVariants = product.variants.length > 0;

    // The plain product: just the main recipe.
    // Always called "Regular", so every card looks the same.
    // In the forecast, a product without variants is "<id>"; with variants, its Regular is "<id>:regular".
    let plain = calculateCanMake(fullRecipe(product, null), materials.value);
    rows.push({
      name: 'Regular',
      price: product.price,
      canMake: plain.canMake,
      limitedBy: plain.limitedBy,
      warnings: plain.warnings,
      tomorrow: tomorrowFor(hasVariants ? product.id + ':regular' : product.id),
    });

    if (hasVariants) {
      // One row per variant: main recipe + that variant's extras
      for (let variant of product.variants) {
        let result = calculateCanMake(fullRecipe(product, variant), materials.value);
        rows.push({
          name: variant.name,
          price: variant.price ?? product.price, // empty price = product's price (?? so a $0 variant stays $0)
          canMake: result.canMake,
          limitedBy: result.limitedBy,
          warnings: result.warnings,
          tomorrow: tomorrowFor(product.id + ':' + variant._id),
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

const autoMargin = ref(false);

// One row per product, plus one per variant. Follows the search box too.
const suggestionRows = computed(() => {
  let rows = [];
  let text = search.value.toLowerCase();

  for (let s of suggestions.value) {
    if (text !== '' && !s.name.toLowerCase().includes(text)) continue;

    rows.push({
      key: s.productId,
      productId: s.productId,
      name: s.name,
      option: s.variants.length > 0 ? 'Regular' : '',
      cost: s.cost,
      current: s.currentPrice,
      suggested: s.suggestedPrice,
      demandRatio: s.demandRatio,
      margin: s.margin,          // new
      basis: s.marginBasis,      // new
    });

    for (let v of s.variants) {
      rows.push({
        key: s.productId + ':' + v.variantId,
        productId: s.productId,
        name: s.name,
        option: v.name,
        cost: v.cost,
        current: v.currentPrice,
        suggested: v.suggestedPrice,
        demandRatio: v.demandRatio,
        margin: v.margin,        // new
        basis: v.marginBasis,    // new
      });
    }
  }
  return rows;
});

// "+$0.50", "-$1.00", or "" when there's no change or no suggestion
function changeText(row) {
  if (row.suggested === null) return '';
  let diff = row.suggested - row.current;
  if (Math.abs(diff) < 0.005) return 'No change';
  return (diff > 0 ? '+$' : '-$') + Math.abs(diff).toFixed(2);
}

function changeClass(row) {
  if (row.suggested === null) return '';
  let diff = row.suggested - row.current;
  if (Math.abs(diff) < 0.005) return 'ps-same';
  return diff > 0 ? 'ps-up' : 'ps-down';
}

// Open the existing Edit pop-up for a product
function editFromSuggestion(productId) {
  let product = products.value.find((p) => p.id === productId);
  if (product) openEditForm(product);
}

// Tomorrow's forecast for one row: { orders, extra }, or null if there's no forecast yet
// Is there enough stock for tomorrow? Orders already logged have taken their materials
// out of stock, so we only compare the EXTRA expected with what we can still make.
//   null   = can't tell (no forecast or no recipe)
//   0      = enough
//   3      = short by 3
function shortTomorrow(row) {
  if (row.tomorrow === null || row.canMake === null) return null;
  // Nothing ordered or expected tomorrow → nothing to say (a green "Enough" next to a red 0 is confusing)
  if (row.tomorrow.orders === 0 && row.tomorrow.extra === 0) return null;
  return Math.max(0, row.tomorrow.extra - row.canMake);
}

// Orders can be saved without enough materials (the New order page warns but allows it),
// so stock can be below 0. Then tomorrow's ORDERED items can't all be made either.
function loggedOrdersShort(row) {
  if (row.tomorrow === null || row.tomorrow.orders === 0) return false;
  let material = materials.value.find((m) => m.name === row.limitedBy);
  return material !== undefined && material.quantity < 0;
}

// The material holding this row back, for the "What to buy →" link
// (Materials highlights it in the "What to buy" list)
function buyLink(row) {
  let material = materials.value.find((m) => m.name === row.limitedBy);
  if (!material) return '/materials';
  return { path: '/materials', query: { highlight: material.id } };
}

function tomorrowFor(rowId) {
  if (forecast.value === null) {
    return null;
  }
  return dayForecast(forecast.value.products.items, rowId, 1); // 0 = today, 1 = tomorrow
}

// 1 → "1 item", 3 → "3 items" (an item = one of what you sell, e.g. one box of cookies)
function itemsText(count) {
  return count === 1 ? '1 item' : count + ' items';
}

// Only the 12 cards on the current page
const pagedCards = computed(() => {
  let start = (page.value - 1) * PER_PAGE;
  return productCards.value.slice(start, start + PER_PAGE);
});

// Back to page 1 when the search changes
watch(search, () => {
  page.value = 1;
});

// After deleting the last card on the last page, step back a page
watch(productCards, (list) => {
  let lastPage = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (page.value > lastPage) {
    page.value = lastPage;
  }
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

  let isNew = editingId.value === null;

  try {
    if (isNew) {
      let url = '/api/products';
      await axios.post(url, productData);
    } else {
      let url = '/api/products/' + editingId.value;
      await axios.put(url, productData);
    }

    showForm.value = false;
    banner.value = {
      type: 'success',
      text: isNew ? productData.name + ' added.' : 'Changes to ' + productData.name + ' saved.',
    };
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
      banner.value = {
        type: 'info',
        text: name + ' is used in past orders, so it was archived (hidden) instead of deleted. ' +
          'Old orders will still show it.',
      };
    } else {
      banner.value = { type: 'success', text: name + ' deleted.' };
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
        <p>How many you can make, and what tomorrow needs</p>
      </div>
      <button type="button" class="btn btn-primary" @click="openAddForm">+ Add product</button>
    </header>

    <!-- ===== What just happened (sticks under the navbar) ===== -->
    <ActionBanner :message="banner" @close="banner = null" />

    <!-- ===== Price suggestions ===== -->
    <section class="sk-card ps-section mb-3" data-testid="price-suggestions">
      <div class="ps-header">
        <h2 class="ps-title">Price suggestions</h2>

        <label class="ps-margin">
          <input type="checkbox" v-model="autoMargin" @change="loadSuggestions" /> Auto margin
        </label>

        <label v-if="!autoMargin" class="ps-margin" for="ps-margin">
          Target margin (%)
          <input id="ps-margin" v-model.number="margin" type="number" min="0" max="90" step="5"
            class="form-control form-control-sm" @change="loadSuggestions" />
        </label>

        <button type="button" class="btn btn-light btn-sm" @click="showSuggestions = !showSuggestions">
          {{ showSuggestions ? 'Hide' : 'Show' }}
        </button>
      </div>

      <template v-if="showSuggestions">
        <p v-if="suggestionsError" class="inv-meta mb-0">Couldn't load suggestions: {{ suggestionsError }}</p>
        <p v-else-if="suggestionRows.length === 0" class="inv-meta mb-0">No products to suggest prices for.</p>

        <div v-else class="ps-scroll">
          <table class="table table-sm align-middle mb-0">
            <thead>
              <tr>
                <th>Product</th>
                <th class="text-end">Cost</th>
                <th class="text-end">Current</th>
                <th class="text-end">Suggested</th>
                <th>Change</th>
                <th class="text-end">Margin</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in suggestionRows" :key="row.key">
                <td>
                  {{ row.name }}<span v-if="row.option" class="ps-option"> · {{ row.option }}</span>
                </td>
                <td class="text-end">{{ row.cost !== null ? '$' + row.cost.toFixed(2) : '—' }}</td>
                <td class="text-end">${{ row.current.toFixed(2) }}</td>

                <td v-if="row.suggested === null" class="text-end ps-missing" colspan="3">
                  Add a cost to get a suggestion
                </td>
                <template v-else>
                  <td class="text-end"><strong>${{ row.suggested.toFixed(2) }}</strong></td>
                  <td :class="changeClass(row)">
                    {{ changeText(row) }}
                    <span v-if="row.demandRatio > 1.05" title="Selling faster than usual"> ↑ demand</span>
                    <span v-else-if="row.demandRatio < 0.95" title="Selling slower than usual"> ↓ demand</span>
                  </td>
                  <td class="text-end">
                    {{ Math.round(row.margin * 100) }}%
                    <small v-if="row.basis === 'history'"
                      title="Estimated from your past sales and price changes">📈</small>
                  </td>
                </template>

                <td class="text-end">
                  <button type="button" class="btn btn-outline-primary btn-sm"
                    @click="editFromSuggestion(row.productId)">Edit</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <!-- ===== Search ===== -->
    <div class="sk-card inv-toolbar mb-3">
      <span class="inv-meta">{{ productCards.length }} product(s)</span>
      <input id="product-search" v-model="search" class="form-control inv-search" placeholder="Search products"
        aria-label="Search products" />
    </div>

    <!-- ===== Product cards (12 per page, 4 per row on a wide screen) ===== -->
    <TransitionGroup v-if="productCards.length > 0" name="list" tag="div" class="prod-grid inv-grid-top">
      <ProductCard v-for="item in pagedCards" :key="item.product.id" :product="item.product" @edit="openEditForm">
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

            <!-- From the forecast -->
            <div v-if="row.tomorrow !== null" class="fc-tomorrow">
              <span>Tomorrow</span>
              <span><strong>{{ itemsText(row.tomorrow.orders) }}</strong> ordered + ~{{ row.tomorrow.extra }}
                more</span>
            </div>

            <!-- Enough for tomorrow? If not, send them to the "What to buy" list -->
            <div v-if="loggedOrdersShort(row)" class="fc-status is-short">
              <span>⚠ Need more {{ row.limitedBy }} for tomorrow</span>
              <RouterLink :to="buyLink(row)">What to buy →</RouterLink>
            </div>
            <div v-else-if="shortTomorrow(row) === 0" class="fc-status is-ok">✓ Enough for tomorrow</div>
            <div v-else-if="shortTomorrow(row) > 0" class="fc-status is-short">
              <span>⚠ Short {{ shortTomorrow(row) }} for tomorrow</span>
              <RouterLink :to="buyLink(row)">What to buy →</RouterLink>
            </div>
          </div>
        </div>
      </ProductCard>
    </TransitionGroup>

    <div v-else class="empty-state">
      <template v-if="products.length === 0">No products yet. Add one and give it a recipe to see how many you can
        make.</template>
      <template v-else>No products match.</template>
    </div>

    <Pager v-model="page" :total="productCards.length" :per-page="PER_PAGE" item-name="products" />

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
                <input id="product-price" v-model.number="form.price" type="number" min="0" step="0.5"
                  class="form-control" />
              </div>
              <div class="col-sm-4">
                <label for="product-cost" class="form-label">Cost to make ($)</label>
                <input id="product-cost" v-model.number="form.cost" type="number" min="0" step="0.1"
                  class="form-control" placeholder="e.g. 6.50" />
              </div>
              <div class="col-sm-4">
                <label for="product-time" class="form-label">Time to make (min)</label>
                <input id="product-time" v-model.number="form.makingTimeMins" type="number" min="0" class="form-control"
                  placeholder="Optional" />
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
              <input v-model.number="line.amountPerUnit" type="number" min="0" class="form-control"
                :aria-label="`Amount ${index + 1}`" />
              <span class="unit">{{ unitOf(line.material) }}</span>
              <button type="button" class="btn btn-light inv-remove" aria-label="Remove material"
                @click="removeRecipeRow(index)">✕</button>
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
                  <input :id="`variant-name-${vIndex}`" v-model="variant.name" class="form-control"
                    placeholder="e.g. Large" />
                </div>
                <div>
                  <label :for="`variant-price-${vIndex}`" class="form-label">Price ($)</label>
                  <input :id="`variant-price-${vIndex}`" v-model.number="variant.price" type="number" min="0" step="0.5"
                    class="form-control" :placeholder="`Same: ${form.price ?? 0}`" />
                </div>
                <div>
                  <label :for="`variant-cost-${vIndex}`" class="form-label">Cost ($)</label>
                  <input :id="`variant-cost-${vIndex}`" v-model.number="variant.cost" type="number" min="0" step="0.1"
                    class="form-control" :placeholder="`Same: ${form.cost ?? '–'}`" />
                </div>
                <button type="button" class="btn btn-light btn-sm" @click="removeVariant(vIndex)">Remove</button>
              </div>

              <div class="inv-meta mb-2">Extra materials only this variant uses:</div>
              <div v-for="(line, eIndex) in variant.extras" :key="eIndex" class="inv-line">
                <select v-model="line.material" class="form-select" :aria-label="`Extra material ${eIndex + 1}`">
                  <option value="" disabled>Choose material…</option>
                  <option v-for="m in materials" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
                <input v-model.number="line.amountPerUnit" type="number" min="0" class="form-control"
                  :aria-label="`Extra amount ${eIndex + 1}`" />
                <span class="unit">{{ unitOf(line.material) }}</span>
                <button type="button" class="btn btn-light inv-remove" aria-label="Remove extra material"
                  @click="removeExtraRow(variant, eIndex)">✕</button>
              </div>
              <button type="button" class="btn btn-outline-primary btn-sm" @click="addExtraRow(variant)">+ Add extra
                material</button>
            </div>

            <button type="button" class="btn btn-light btn-sm" @click="addVariant">+ Add variant</button>
          </div>

          <div class="modal-footer">
            <button v-if="editingId !== null" type="button" class="btn btn-outline-danger btn-sm me-auto"
              @click="deleteProduct">
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

<style scoped>
/* 4 product cards per row on a wide screen; each card keeps its own height */
.prod-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.9rem;
  align-items: start;
}

@media (max-width: 1199.98px) {
  .prod-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 767.98px) {
  .prod-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 479.98px) {
  .prod-grid {
    grid-template-columns: 1fr;
  }
}

/* "✓ Enough for tomorrow" / "⚠ Short 3 for tomorrow  What to buy →" */
.fc-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 0.5rem;
  margin-top: 0.3rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.78rem;
  font-weight: 700;
  border-radius: var(--sk-radius-sm);
}

.fc-status.is-ok {
  color: var(--sk-ok);
  background: var(--sk-ok-soft);
}

.fc-status.is-short {
  color: var(--sk-warn);
  background: var(--sk-warn-soft);
}

.fc-status a {
  color: inherit;
  white-space: nowrap;
}
</style>