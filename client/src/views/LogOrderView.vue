<script setup>
// Log order page: manual entry → save.
// Still TODO (prototype views 2–4), to add on top of this form later:
//   - "Extract order details" from the pasted message, calling extractOrder()
//   - run checkOrder() and warn if the order can't be fulfilled
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick, onBeforeUnmount } from 'vue';
import axios from 'axios';
import ActionBanner from '../components/ActionBanner.vue';
import StockCheck from '../components/forecast/StockCheck.vue';
import { fullRecipe } from '../utils/capacity.js';
import { formatDay, buildWeekDays, busiestOf, checkOrderLine } from '../utils/forecast.js';

const products = ref([]);
const productsError = ref('');

// Materials, for the "do I have enough?" note under each quantity.
// Stock already has every logged order taken off (the server deducts on save),
// so this is what's left for NEW orders.
// null = not loaded (or failed): the stock checks are hidden rather than showing "can make 0".
const materials = ref(null);

// ---------- message banner (components/ActionBanner.vue) ----------
// green = saved, purple = saved but note something, red = didn't save
const banner = ref(null);

// Smoothly scroll back to the top so the banner and page title are in view.
// People who turned off animations in their system settings get an instant jump.
async function scrollToTop() {
  // Wait until Vue has finished changing the page (form cleared, banner shown).
  // Some browsers drop a smooth scroll if the page changes while it's moving.
  await nextTick();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startY = window.scrollY;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' });

  // Safety net: if the page hasn't moved at all after 1 s, the smooth scroll was
  // dropped, so jump instead. ('instant', not 'auto': Bootstrap makes 'auto' smooth.)
  // Only when nothing moved, so we never pull back a seller who scrolled down themselves.
  setTimeout(() => {
    if (window.scrollY === startY && startY > 0) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, 1000);
}

// ---------- "now", for blocking past due dates ----------
// Updated every 30 s, so a page left open doesn't keep allowing a time that has passed.
const now = ref(new Date());
let clock = null;
onMounted(() => { clock = setInterval(() => { now.value = new Date(); }, 30000); });
onUnmounted(() => clearInterval(clock));

// One line of the order. variantId means:
//   null  = "Regular", the plain product with the main recipe only (the default)
//   an id = one of the product's variants (product.variants[]._id)
function newItem() {
  return { product: '', variantId: null, quantity: 1 };
}

const emptyForm = () => ({
  customerName: '',
  customerContact: '',
  customerEmail: '',
  platform: '',
  items: [newItem()],
  price: null,
  paymentStatus: 'unpaid',
  depositAmount: 0,
  fulfilmentMethod: '',
  deliveryAddress: '',
  dueAt: '',
  rawMessage: '',
});

const form = reactive(emptyForm());
const saving = ref(false);
// Becomes true the first time Save is pressed. Until then, no field is shown in red.
const triedToSubmit = ref(false);

// ---------- customer search ----------
const customers = ref([]);
const showCustomers = ref(false);
const searchingCustomers = ref(false);

onMounted(async () => {
  try {
    const response = await axios.get('/api/products');
    products.value = response.data;
  } catch (err) {
    productsError.value = `Couldn't load products: ${err.message}`;
  }
  loadMaterials();
  loadBusiestDay();
});

// ---------- busiest day: the same rule as the "This week" strip (WeekStrip.vue) ----------
// buildWeekDays + busiestOf come from utils/forecast.js, so both always pick the same day.
const busiestDay = ref(null);   // { date: '2026-11-07', ... } or null
const activeOrders = ref([]);   // in progress + ready, for "you already have x orders"

async function loadBusiestDay() {
  try {
    const [forecastRes, ordersRes] = await Promise.all([
      axios.get('/api/materials/forecast'),
      axios.get('/api/orders', { params: { outcome: 'ongoing' } }), // everything except cancelled
    ]);
    // /api/products is already loading in onMounted; wait for it if it hasn't finished
    const productList = products.value.length ? products.value : (await axios.get('/api/products')).data;
    busiestDay.value = busiestOf(buildWeekDays(forecastRes.data, productList));
    activeOrders.value = ordersRes.data.filter((o) => ['in-progress', 'ready'].includes(o.status));
  } catch (err) {
    // Not fatal: the note just won't show
    console.error("Couldn't load the busiest day:", err.message);
    busiestDay.value = null;
  }
}

// Shown under the Due field when the chosen date is the busiest day
const busiestDayNote = computed(() => {
  if (!busiestDay.value || !form.dueAt) return null;
  // datetime-local is 'YYYY-MM-DDTHH:mm' in the seller's time, the forecast uses 'YYYY-MM-DD' in SG time
  if (form.dueAt.slice(0, 10) !== busiestDay.value.date) return null;

  const count = activeOrders.value.filter(
    (o) => toDateTimeInput(o.dueAt).slice(0, 10) === busiestDay.value.date
  ).length;
  return { day: formatDay(busiestDay.value.date), count };
});

// Also called after each save, because saving an order takes its materials out of stock
async function loadMaterials() {
  try {
    const response = await axios.get('/api/materials');
    materials.value = response.data;
  } catch (err) {
    // Not fatal: the order can still be logged, just without the stock notes
    console.error("Couldn't load materials:", err.message);
    materials.value = null;
  }
}

async function searchCustomers() {
  const name = form.customerName.trim();

  if (name.length < 2) {
    customers.value = [];
    showCustomers.value = false;
    return;
  }

  searchingCustomers.value = true;

  try {
    const response = await axios.get(
      '/api/orders/customers/search',
      {
        params: { name }
      }
    );

    customers.value = response.data;
    showCustomers.value = true;

  } catch (error) {
    console.error('Customer search failed:', error);
    customers.value = [];
  } finally {
    searchingCustomers.value = false;
  }
}

const customerDropdownRef = ref(null);

function handleClickOutside(event) {
  if (
    customerDropdownRef.value &&
    !customerDropdownRef.value.contains(event.target)
  ) {
    showCustomers.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside);
});

function selectCustomer(customer) {
  form.customerName = customer.customerName;
  form.customerContact = customer.customerContact || '';
  form.customerEmail = customer.customerEmail || '';
  form.deliveryAddress = customer.deliveryAddress || '';
  form.platform = customer.platform || '';

  showCustomers.value = false;
  customers.value = [];
}

async function createOrder(order) {
  try {
    const response = await axios.post('/api/orders', order);
    return response.data;
  } catch (err) {
    console.error(err.response?.data?.message || err.message);
    throw err;
  }
}

function addItem() {
  form.items.push(newItem());
}

function removeItem(index) {
  if (form.items.length > 1) form.items.splice(index, 1);
}

// ---------- variants (from the Products page) ----------
function findProduct(productId) {
  return products.value.find((p) => p._id === productId);
}

// The variants the seller created for this item's product ([] if none)
function variantsFor(item) {
  const product = findProduct(item.product);
  return product?.variants ?? [];
}

// A different product has different variants, so go back to Regular
function onProductChange(item) {
  item.variantId = null;
}

function variantPlaceholder(item) {
  if (!item.product) return 'Choose a product first';
  if (variantsFor(item).length === 0) return 'No variants';
  return 'Choose a variant';
}

// Price of one unit: the variant's price, or the product's if the variant has none
function unitPrice(item) {
  const product = findProduct(item.product);
  if (!product) return 0;
  const variant = variantsFor(item).find((v) => v._id === item.variantId);
  return variant?.price ?? product.price ?? 0;
}

// ---------- total price ----------
// Filled in from the Products page prices. The seller can still type a
// different total (discount, delivery fee); after that we stop overwriting it.
const calculatedTotal = computed(() =>
  form.items.reduce((sum, item) => sum + unitPrice(item) * (item.quantity || 0), 0)
);
const priceEditedByHand = ref(false);

watch(calculatedTotal, (total) => {
  if (!priceEditedByHand.value) form.price = total;
});

function useCalculatedTotal() {
  form.price = calculatedTotal.value;
  priceEditedByHand.value = false;
}

// Required fields that are still empty, used to mark fields and disable the button
const missing = computed(() => {
  const list = [];
  if (!form.customerName.trim()) list.push('Customer name');
  if (form.items.some((i) => !i.product || !(i.quantity >= 1))) list.push('Products and quantities');
  if (form.price === null || form.price === '' || form.price < 0) list.push('Price');
  if (!form.fulfilmentMethod) list.push('Collection or delivery');
  if (form.fulfilmentMethod === 'delivery' && !form.deliveryAddress.trim()) list.push('Delivery address');
  if (!form.dueAt) list.push('Due date');
  else if (dueIsInPast.value) list.push('Due date (already passed)');
  if (form.paymentStatus === 'deposit' && !(form.depositAmount > 0)) list.push('Deposit amount');
  return list;
});

// Only show a field in red AFTER the seller has tried to save.
// It goes back to normal as soon as it's filled in, because `missing` updates live.
const isMissing = (label) => triedToSubmit.value && missing.value.includes(label);

// ---------- no backdating ----------
// 'YYYY-MM-DDTHH:mm' for the date picker's min, so past days and times are greyed out
const minDueAt = computed(() => toDateTimeInput(now.value));

// Picker min alone isn't enough: a date can be typed in, or filled by Auto fill
const dueIsInPast = computed(() => Boolean(form.dueAt) && new Date(form.dueAt) < now.value);

// ---------- "do I have enough materials?" (components/forecast/StockCheck.vue) ----------
// StockCheck does the check for each item. The page only works out what the
// OTHER items need, because different products can share a material
// (cookies and cake both use butter).

// The chosen variant object, or null for Regular
function findVariant(item) {
  return variantsFor(item).find((v) => v._id === item.variantId) ?? null;
}

// What one item needs in total, per material id: { <materialId>: amount }
function itemNeeds(item) {
  const product = findProduct(item.product);
  const needs = {};
  if (!product || !(item.quantity >= 1)) return needs;
  for (const line of fullRecipe(product, findVariant(item))) {
    const id = String(line.material);
    needs[id] = (needs[id] || 0) + line.amountPerUnit * item.quantity;
  }
  return needs;
}

// For each item: what all the OTHER items need, per material (for StockCheck's used-by-other-items)
const usedByOtherItems = computed(() => {
  const all = form.items.map(itemNeeds);
  return form.items.map((_, index) => {
    const others = {};
    all.forEach((needs, other) => {
      if (other === index) return;
      for (const id in needs) others[id] = (others[id] || 0) + needs[id];
    });
    return others;
  });
});

// Materials that are short across the whole order, for the purple "saved" banner.
// Same check as StockCheck, so the banner and the notes always agree.
const shortMaterials = computed(() => {
  const names = new Set();
  if (materials.value === null) return [];
  form.items.forEach((item, index) => {
    if (!(item.quantity >= 1)) return;
    const left = materials.value.map((m) => ({
      ...m,
      quantity: m.quantity - (usedByOtherItems.value[index][String(m.id)] || 0),
    }));
    const check = checkOrderLine(findProduct(item.product), findVariant(item), item.quantity, left);
    if (check && !check.enough) names.add(check.limitedBy);
  });
  return [...names];
});

// The "fill these in" error clears itself once nothing is missing
watch(
  () => missing.value.length,
  (count) => {
    if (count === 0 && banner.value?.kind === 'missing') banner.value = null;
  }
);

async function saveOrder() {
  if (saving.value) return;
  triedToSubmit.value = true;

  if (missing.value.length) {
    const n = missing.value.length;
    banner.value = {
      type: 'error',
      kind: 'missing',
      text: `Fill in ${n} required ${n === 1 ? 'field' : 'fields'}: ${missing.value.join(', ')}.`,
    };
    // Take the seller to the first red field rather than the top: that's where they need to be
    await nextTick();
    const firstInvalid = document.querySelector('[data-testid="page-log-order"] .is-invalid');
    if (firstInvalid) {
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstInvalid.focus({ preventScroll: true });
    }
    return;
  }

  saving.value = true;
  banner.value = null;
  const shortAtSave = shortMaterials.value; // remember before the form is cleared

  try {
    const saved = await createOrder({
      ...form,
      // Only send ids and quantities; the server looks up names and prices itself
      items: form.items.map((item) => ({
        product: item.product,
        variantId: item.variantId || null, // Regular (or a product with no variants) → null
        quantity: item.quantity,
      })),
      // datetime-local has no timezone; convert in the browser so the seller's local time is kept
      dueAt: new Date(form.dueAt).toISOString(),
      depositAmount: form.paymentStatus === 'unpaid' ? 0 : form.depositAmount,
    });
    Object.assign(form, emptyForm());
    priceEditedByHand.value = false;
    triedToSubmit.value = false;
    filledFields.value = [];
    missingFields.value = [];
    detectionProblems.value = [];

    banner.value = shortAtSave.length
      ? {
          type: 'info',
          text: `Order for ${saved.customerName} saved. Not enough ${shortAtSave.join(', ')}: restock before it's due.`,
        }
      : { type: 'success', text: `Order for ${saved.customerName} saved.` };

    loadMaterials(); // the server just took this order's materials out of stock
    loadBusiestDay(); // the new order counts towards the busiest day too
  } catch (err) {
    // Show the server's own message ("Due date can't be in the past"), not axios's
    // generic "Request failed with status code 400"
    banner.value = {
      type: 'error',
      text: err.response?.data?.error || err.response?.data?.message || err.message,
    };
  } finally {
    saving.value = false;
    scrollToTop();
  }
}

const filledFields = ref([]);
const missingFields = ref([]);
const detectionProblems = ref([]);
const isProcessing = ref(false);

// Finds the variant whose name matches the text from the message (ignoring
// capitals and spaces at the ends). Returns its _id, or null (Regular) if the
// message named no variant, asked for "Regular", or named one we can't match.
function matchVariant(item, text) {
  if (!text) return null;
  const wanted = String(text).trim().toLowerCase();
  if (wanted === 'regular') return null;
  const match = variantsFor(item).find(v => v.name.trim().toLowerCase() === wanted);
  return match ? match._id : null;
}

// True when the message named a variant (other than "Regular") that we
// couldn't match, so the item fell back to Regular and the seller should check it.
function variantNotMatched(text, variantId) {
  const wanted = text?.trim().toLowerCase();
  return Boolean(wanted) && wanted !== 'regular' && variantId === null;
}

// <input type="datetime-local"> only accepts 'YYYY-MM-DDTHH:mm' in local time.
// A full ISO date from the server ('2026-10-10T10:00:00.000Z') would show blank.
function toDateTimeInput(value) {
  const d = new Date(value);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const autoFillForm = async () => {
  isProcessing.value = true;

  try {
    const response = await axios.post('/api/orders/parse', {
      message: form.rawMessage
    });

    const data = response.data;

    filledFields.value = [];
    missingFields.value = [];
    detectionProblems.value = data.problems ?? [];

    // Customer name
    if (data.customerName) {
      form.customerName = data.customerName;
      filledFields.value.push('Customer Name');
    } else {
      missingFields.value.push('Customer Name');
    }

    // Contact
    if (data.customerContact) {
      form.customerContact = data.customerContact;
      filledFields.value.push('Contact');
    } else {
      missingFields.value.push('Contact');
    }

    // Platform
    if (data.platform) {
      form.platform = data.platform;
      filledFields.value.push('Platform');
    } else {
      missingFields.value.push('Platform');
    }


    // Items
    if (data.items?.length > 0) {
      form.items = data.items.map(item => ({
        product: item.product ?? '',
        variantId: item.variantId ?? null,
        quantity: item.quantity ?? 1
      }));


      filledFields.value.push('Items');

      // Variant is optional: anything not stated or not matched becomes Regular.
      const hasVariant = data.items.some(item => item.variant?.trim());

      const unmatchedVariant = data.items.some(
        (item, index) => variantNotMatched(item.variant, form.items[index]?.variantId)
      );

      if (hasVariant && !unmatchedVariant) {
        filledFields.value.push('Variant');
      }

      if (unmatchedVariant) {
        detectionProblems.value.push(
          'One or more variants could not be matched. Please review them.'
        );
      }

      // Quantity
      const hasQuantity = data.items.some(
        item => item.quantity != null
      );

      if (hasQuantity) {
        filledFields.value.push('Quantity');
      } else {
        missingFields.value.push('Quantity');
      }

    } else {
      missingFields.value.push('Items');
      missingFields.value.push('Quantity');
    }

    // Payment status
    if (data.paymentStatus) {
      form.paymentStatus = data.paymentStatus;
      filledFields.value.push('Payment Status');
    } else {
      missingFields.value.push('Payment Status');
    }

    // Deposit
    if (data.depositAmount != null) {
      form.depositAmount = data.depositAmount;
      filledFields.value.push('Deposit Amount');
    } else {
      missingFields.value.push('Deposit Amount');
    }

    // Fulfilment method
    if (data.fulfilmentMethod) {
      form.fulfilmentMethod = data.fulfilmentMethod;
      filledFields.value.push('Fulfilment Method');
    } else {
      missingFields.value.push('Fulfilment Method');
    }

    if (data.customerEmail) {
      form.customerEmail = data.customerEmail;
      filledFields.value.push('Customer Email');
    } else {
      missingFields.value.push('Customer Email');
    }

    // Delivery address
    if (data.fulfilmentMethod === 'delivery') {
      if (data.deliveryAddress) {
        form.deliveryAddress = data.deliveryAddress;
        filledFields.value.push('Delivery Address');
      } else {
        missingFields.value.push('Delivery Address');
      }
    } else if (data.fulfilmentMethod === 'self-collect') {
      form.deliveryAddress = '';
    } else {
      // Fulfilment method is unknown, so don't assume an address
      // is unnecessary.
      if (data.deliveryAddress) {
        form.deliveryAddress = data.deliveryAddress;
        filledFields.value.push('Delivery Address');
      } else {
        missingFields.value.push('Delivery Address');
      }
    }


    // Due date
    if (data.dueAt) {
      form.dueAt = toDateTimeInput(data.dueAt);
      filledFields.value.push('Due Date');
    } else {
      missingFields.value.push('Due Date');
    }

  } catch (error) {
    console.error('Auto-fill failed:', error);

    filledFields.value = [];
    missingFields.value = [];
    detectionProblems.value = ['Unable to detect fields.'];
  } finally {
    isProcessing.value = false;
  }
};

</script>

<template>
  <section data-testid="page-log-order" class="container py-4" style="max-width: 720px">
    <h1 class="mb-4">Log order</h1>

    <!-- Action banner component -->
    <ActionBanner :message="banner" @close="banner = null" />

    <form @submit.prevent="saveOrder" novalidate>
      <!-- Start from the customer's message: paste it, then Auto fill -->
      <section class="autofill-card mb-4" aria-labelledby="autofill-title">
        <h2 id="autofill-title" class="h5 mb-1">Customer's message</h2>
        <p class="autofill-hint mb-2">
          Paste the customer's message and we'll fill in the form for you. You can check and change everything before
          saving.
        </p>

        <label for="rawMessage" class="visually-hidden">Customer's message (optional)</label>
        <textarea id="rawMessage" v-model="form.rawMessage" rows="3" class="form-control"
          placeholder="e.g. Hi! Can I get 2 boxes of chocolate chip cookies for Saturday? I'll collect."></textarea>

        <div class="autofill-actions">
          <span class="autofill-note">Optional. Kept with the order for reference.</span>
          <!-- type="button": without it, a button inside a <form> also submits the form -->
          <button type="button" @click="autoFillForm" class="btn btn-outline-primary"
            :disabled="form.rawMessage.length === 0 || isProcessing">
            {{ isProcessing ? 'Reading message…' : '✨ Auto fill from message' }}
          </button>
        </div>

        <div v-if="isProcessing" class="processing-overlay">
          <div class="processing-box">
            <div class="spinner-border text-primary mb-3" role="status"></div>

            <h5>Processing order...</h5>

            <p class="text-muted mb-0">
              Extracting order details. Please be patient. Should not take more than 20s.
            </p>
          </div>
        </div>

        <div v-if="filledFields.length > 0 || missingFields.length > 0" class="af-results" role="status">
          <div v-if="filledFields.length > 0" class="af-row">
            <span class="af-label">✓ Filled in</span>
            <span v-for="field in filledFields" :key="field" class="af-chip af-chip--ok">{{ field }}</span>
          </div>

          <div v-if="missingFields.length > 0" class="af-row">
            <span class="af-label">Not in message</span>
            <span v-for="field in missingFields" :key="field" class="af-chip af-chip--todo">{{ field }}</span>
          </div>

          <div v-if="detectionProblems.length > 0" class="af-review">
            <strong>Needs review:</strong>
            <ul class="mb-0">
              <li v-for="(problem, index) in detectionProblems" :key="index">
                {{ problem }}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Customer -->
      <fieldset class="mb-4">
        <legend class="h5">Customer</legend>

        <div class="mb-3 position-relative" ref="customerDropdownRef">
          <label for="customerName" class="form-label">Name *</label>

          <input id="customerName" v-model="form.customerName" class="form-control" :class="{
            'is-invalid': isMissing('Customer name'),
            'is-autofilled': filledFields.includes('Customer Name')
          }" placeholder="Enter customer name" autocomplete="off" @input="searchCustomers" @focus="searchCustomers" />

          <!-- Customer search results -->
          <div v-if="showCustomers" class="customer-dropdown position-absolute w-100 shadow">
            <button v-for="(customer, index) in customers" :key="index" type="button"
              class="customer-option text-start w-100" @mousedown.prevent="selectCustomer(customer)">
              <strong>{{ customer.customerName }}</strong>

              <div class="small text-muted">
                {{ customer.customerContact || 'No contact' }}
                <span v-if="customer.customerEmail">
                  · {{ customer.customerEmail }}
                </span>
              </div>
            </button>

            <div v-if="customers.length === 0" class="customer-empty">
              No past customers found.
            </div>
          </div>
        </div>

        <div class="row g-3">
          <div class="col-sm-6">
            <label for="customerContact" class="form-label">Contact</label>
            <input id="customerContact" v-model="form.customerContact" class="form-control"
              :class="{ 'is-autofilled': filledFields.includes('Contact') }" placeholder="Phone or handle" />
          </div>
          <div class="col-sm-6">
            <label for="platform" class="form-label">Ordered via</label>
            <select id="platform" v-model="form.platform" class="form-select"
              :class="{ 'is-autofilled': filledFields.includes('Platform') }">
              <option value="">Not specified</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="telegram">Telegram</option>
              <option value="tiktok">TikTok</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="col-12">
            <label for="customerEmail" class="form-label">Email (optional)</label>
            <input id="customerEmail" v-model="form.customerEmail" type="email" class="form-control"
              placeholder="customer@example.com" aria-describedby="customerEmailHelp" />
            <div id="customerEmailHelp" class="form-text">
              If you add an email, the customer gets an update automatically each time the order stage changes.
            </div>
          </div>
        </div>
      </fieldset>

      <!-- Items -->
      <fieldset class="mb-4">
        <legend class="h5">Items</legend>

        <div v-if="productsError" class="alert alert-warning">{{ productsError }}</div>
        <div v-else-if="!products.length" class="text-muted mb-2">
          No products yet. Add one on the Products page first.
        </div>

        <div v-for="(item, index) in form.items" :key="index" class="row g-2 align-items-end mb-2">
          <div class="col-sm-5">
            <label :for="`product-${index}`" class="form-label">Product *</label>
            <select :id="`product-${index}`" v-model="item.product" class="form-select"
              :class="{ 'is-invalid': !item.product && isMissing('Products and quantities'), 'is-autofilled': filledFields.includes('Items') }"
              @change="onProductChange(item)">
              <option value="" disabled>Choose a product</option>
              <option v-for="p in products" :key="p._id" :value="p._id">{{ p.name ?? p._id }}</option>
            </select>
          </div>
          <div class="col-sm-3">
            <label :for="`variant-${index}`" class="form-label">Variant</label>
            <select :id="`variant-${index}`" v-model="item.variantId" class="form-select"
              :class="{ 'is-autofilled': filledFields.includes('Variant') }" :disabled="variantsFor(item).length === 0">
              <!-- Placeholder only when there's nothing to choose; otherwise Regular is the default -->
              <option v-if="variantsFor(item).length === 0" :value="null" disabled>{{ variantPlaceholder(item) }}
              </option>
              <!-- Regular = the plain product (main recipe only). Its value is null, not the text "Regular". -->
              <option v-if="variantsFor(item).length > 0" :value="null">
                Regular (${{ (findProduct(item.product).price ?? 0).toFixed(2) }})
              </option>
              <option v-for="v in variantsFor(item)" :key="v._id" :value="v._id">
                {{ v.name }} (${{ (v.price ?? findProduct(item.product).price).toFixed(2) }})
              </option>
            </select>
          </div>
          <div class="col-sm-2">
            <label :for="`qty-${index}`" class="form-label">Qty *</label>
            <input :id="`qty-${index}`" v-model.number="item.quantity" type="number" min="1" class="form-control"
              :class="{
                'is-invalid': !(item.quantity >= 1) && isMissing('Products and quantities'),
                'is-autofilled': filledFields.includes('Quantity')
              }" />
          </div>
          <div class="col-sm-2">
            <button type="button" class="btn btn-outline-danger w-100" :disabled="form.items.length === 1"
              @click="removeItem(index)">Remove</button>
          </div>

          <!-- "You can make 30" / "You can only make 2 …". A warning only: the seller may be restocking. -->
          <div v-if="materials !== null" class="col-12">
            <StockCheck :product="findProduct(item.product)" :variant="findVariant(item)" :quantity="item.quantity"
              :due-text="form.dueAt ? formatDay(form.dueAt.slice(0, 10)) : ''" :materials="materials"
              :used-by-other-items="usedByOtherItems[index]" />
          </div>
        </div>

        <button type="button" class="btn btn-outline-primary btn-sm" @click="addItem">+ Add another item</button>
      </fieldset>

      <!-- Payment -->
      <fieldset class="mb-4">
        <legend class="h5">Payment</legend>
        <div class="row g-3">
          <div class="col-sm-4">
            <label for="price" class="form-label">Total price ($) *</label>
            <input id="price" v-model.number="form.price" type="number" min="0" step="0.01" class="form-control"
              :class="{ 'is-invalid': isMissing('Price') }" @input="priceEditedByHand = true" />
            <div class="form-text">
              <template v-if="priceEditedByHand && form.price !== calculatedTotal">
                Your prices add up to ${{ calculatedTotal.toFixed(2) }}.
                <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="useCalculatedTotal">Use
                  that</button>
              </template>
              <template v-else>Calculated from your product prices. You can change it.</template>
            </div>
          </div>
          <div class="col-sm-4">
            <label for="paymentStatus" class="form-label">Status</label>
            <select id="paymentStatus" v-model="form.paymentStatus" class="form-select"
              :class="{ 'is-autofilled': filledFields.includes('Payment Status') }">
              <option value="unpaid">Unpaid</option>
              <option value="deposit">Deposit paid</option>
              <option value="paid">Fully paid</option>
            </select>
          </div>
          <div v-if="form.paymentStatus === 'deposit'" class="col-sm-4">
            <label for="depositAmount" class="form-label">Deposit ($) *</label>
            <input id="depositAmount" v-model.number="form.depositAmount" type="number" min="0" step="0.01"
              class="form-control"
              :class="{ 'is-invalid': isMissing('Deposit amount'), 'is-autofilled': filledFields.includes('Deposit Amount') }" />
          </div>
        </div>
      </fieldset>

      <!-- Fulfilment -->
      <fieldset class="mb-4">
        <legend class="h5">Fulfilment</legend>
        <div class="row g-3">
          <div class="col-sm-6">
            <label for="fulfilmentMethod" class="form-label">Collection or delivery *</label>
            <select id="fulfilmentMethod" v-model="form.fulfilmentMethod" class="form-select"
              :class="{ 'is-invalid': isMissing('Collection or delivery'), 'is-autofilled': filledFields.includes('Fulfilment Method') }">
              <option value="" disabled>Choose one</option>
              <option value="self-collect">Self-collect</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label for="dueAt" class="form-label">Due *</label>
            <!-- min greys out past days and times in the picker -->
            <input id="dueAt" v-model="form.dueAt" type="datetime-local" class="form-control" :min="minDueAt"
              :class="{
                'is-invalid': isMissing('Due date') || isMissing('Due date (already passed)'),
                'is-autofilled': filledFields.includes('Due Date')
              }" aria-describedby="dueAtHelp" />
            <div v-if="isMissing('Due date (already passed)')" class="invalid-feedback">
              This time has already passed. Pick a later one.
            </div>
            <!-- Shown even before Save is pressed, so the seller can decide before committing -->
            <div v-else-if="dueIsInPast" id="dueAtHelp" class="form-text text-danger">
              This time has already passed.
            </div>
            <div v-else-if="busiestDayNote" id="dueAtHelp" class="busy-note" aria-live="polite">
              📅 {{ busiestDayNote.day }} is your busiest day. You already have
              {{ busiestDayNote.count }} active {{ busiestDayNote.count === 1 ? 'order' : 'orders' }} due. Take note.
            </div>
          </div>
          <div v-if="form.fulfilmentMethod === 'delivery'" class="col-12">
            <label for="deliveryAddress" class="form-label">Delivery address *</label>
            <input id="deliveryAddress" v-model="form.deliveryAddress" class="form-control"
              :class="{ 'is-invalid': isMissing('Delivery address'), 'is-autofilled': filledFields.includes('Delivery Address') }" />
          </div>
        </div>
      </fieldset>

      <!-- Footer: what's still missing on the left, Save on the right (stays visible while scrolling) -->
      <div class="order-footer">
        <p class="order-footer__note mb-0">
          <template v-if="missing.length">
            {{ missing.length }} required {{ missing.length === 1 ? 'field' : 'fields' }} left: {{ missing.join(', ') }}
          </template>
          <template v-else>All set. Ready to save.</template>
        </p>

        <!-- Not disabled when fields are missing: pressing it is what turns them red -->
        <button type="submit" class="btn btn-primary order-footer__save" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save order' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.processing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);

  display: flex;
  justify-content: center;
  align-items: center;

  z-index: 9999;
}

.processing-box {
  background: white;
  padding: 30px;
  border-radius: 10px;
  text-align: center;
  min-width: 280px;
}

/* ---------- Customer's message + Auto fill ---------- */
.autofill-card {
  background: var(--sk-brand-soft);
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius);
  padding: 1rem 1.15rem;
}

.autofill-hint {
  font-size: 0.9rem;
  color: var(--sk-muted);
}

.autofill-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin-top: 0.75rem;
}

.autofill-note {
  font-size: 0.8rem;
  color: var(--sk-muted);
}

.autofill-actions .btn {
  background-color: var(--sk-surface);
}

.autofill-actions .btn:hover:not(:disabled) {
  background-color: var(--sk-brand);
}

/* ---------- Auto fill results (tags) ---------- */
.af-results {
  display: grid;
  gap: 0.6rem;
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--sk-border);
}

.af-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.af-label {
  min-width: 6.5rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--sk-muted);
}

.af-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.af-chip--ok {
  background: var(--sk-ok-soft);
  color: var(--sk-ok);
}

.af-chip--todo {
  background: var(--sk-surface);
  color: var(--sk-muted);
  border: 1px dashed var(--sk-brand-muted);
}

.af-review {
  background: var(--sk-warn-soft);
  color: var(--sk-warn);
  border-radius: var(--sk-radius-sm);
  padding: 0.55rem 0.8rem;
  font-size: 0.85rem;
}

.af-review ul {
  padding-left: 1.1rem;
  margin-top: 0.25rem;
}

/* Fields that Auto fill filled in: soft green outline */
.is-autofilled:not(.is-invalid) {
  border-color: var(--sk-ok);
  box-shadow: 0 0 0 3px rgb(31 122 109 / 0.15);
}

/* ---------- Busiest-day note (amber, not red: it doesn't stop the save) ---------- */
.busy-note {
  margin-top: 0.35rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.85rem;
  color: var(--sk-warn);
  background: var(--sk-warn-soft);
  border-radius: var(--sk-radius-sm);
}

/* ---------- Footer with Save ---------- */
.order-footer {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  margin-top: 1.5rem;
  padding: 0.85rem 1rem;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius);
  box-shadow: var(--sk-shadow-lift);
}

.order-footer__note {
  font-size: 0.85rem;
  color: var(--sk-muted);
}

.order-footer__save {
  flex-shrink: 0;
  min-width: 10rem;
  padding-block: 0.6rem;
}

/* Phones: note on top, full-width Save button */
@media (max-width: 575.98px) {
  .order-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .order-footer__save {
    width: 100%;
  }
}

.customer-dropdown {
  top: 100%;
  left: 0;
  z-index: 1050;
  background-color: #ffffff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  margin-top: 4px;
  max-height: 250px;
  overflow-y: auto;
}

.customer-option {
  display: block;
  padding: 10px 14px;
  background-color: #ffffff;
  color: #212529;
  border: none;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.customer-option:hover {
  background-color: #f1f3f5;
}

.customer-option:focus-visible {
  background-color: #e9ecef;
  outline: 2px solid #adb5bd;
  outline-offset: -2px;
}

.customer-empty {
  padding: 12px 14px;
  color: #6c757d;
  background-color: #ffffff;
  font-size: 0.875rem;
}
</style>