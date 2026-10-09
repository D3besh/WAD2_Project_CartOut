<script setup>
// Log order page: manual entry → save.
// Still TODO (prototype views 2–4), to add on top of this form later:
//   - "Extract order details" from the pasted message, calling extractOrder()
//   - run checkOrder() and warn if the order can't be fulfilled
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { api } from '../services/api.js';
import { createOrder } from '../services/orders.js';
import axios from 'axios';

const products = ref([]);
const productsError = ref('');

// One line of the order. variantId is the _id of one of the product's variants.
function newItem() {
  return { product: '', variantId: '', quantity: 1 };
}

const emptyForm = () => ({
  customerName: '',
  customerContact: '',
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
const saveError = ref('');
const savedOrder = ref(null);

onMounted(async () => {
  try {
    products.value = await api('/products');
  } catch (err) {
    productsError.value = `Couldn't load products: ${err.message}`;
  }
});

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

// A different product has different variants, so clear the old choice
function onProductChange(item) {
  item.variantId = '';
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
  if (form.items.some((i) => variantsFor(i).length > 0 && !i.variantId)) list.push('Variant');
  if (form.price === null || form.price === '' || form.price < 0) list.push('Price');
  if (!form.fulfilmentMethod) list.push('Collection or delivery');
  if (form.fulfilmentMethod === 'delivery' && !form.deliveryAddress.trim()) list.push('Delivery address');
  if (!form.dueAt) list.push('Due date');
  if (form.paymentStatus === 'deposit' && !(form.depositAmount > 0)) list.push('Deposit amount');
  return list;
});

const isMissing = (label) => missing.value.includes(label);

async function saveOrder() {
  if (missing.value.length || saving.value) return;
  saving.value = true;
  saveError.value = '';

  try {
    savedOrder.value = await createOrder({
      ...form,
      // Only send ids and quantities; the server looks up names and prices itself
      items: form.items.map((item) => ({
        product: item.product,
        variantId: item.variantId || undefined,
        quantity: item.quantity,
      })),
      // datetime-local has no timezone; convert in the browser so the seller's local time is kept
      dueAt: new Date(form.dueAt).toISOString(),
      depositAmount: form.paymentStatus === 'unpaid' ? 0 : form.depositAmount,
    });
    Object.assign(form, emptyForm());
    priceEditedByHand.value = false;
  } catch (err) {
    saveError.value = err.message;
  } finally {
    saving.value = false;
  }
}

const filledFields = ref([]);
const missingFields = ref([]);
const detectionProblems = ref([]);
const isProcessing = ref(false);

// Finds the variant whose name matches the text from the message (ignoring
// capitals and spaces at the ends). Returns its _id, or '' if nothing matches.
function matchVariant(item, text) {
  if (!text) return '';
  const wanted = String(text).trim().toLowerCase();
  const match = variantsFor(item).find(v => v.name.trim().toLowerCase() === wanted);
  return match ? match._id : '';
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
      form.items = data.items.map(item => {
        const line = {
          product: item.product ?? '',
          variantId: '',
          quantity: item.quantity ?? 1
        };
        // The message gives a variant as text ("large"). Only accept it if it
        // matches one of this product's real variants; otherwise leave it
        // empty so the seller has to choose.
        line.variantId = matchVariant(line, item.variant);
        return line;
      });

      filledFields.value.push('Items');

      // Variant counts as detected only if every item that needs one got a match
      const variantsOk = form.items.every(i => variantsFor(i).length === 0 || i.variantId);

      if (variantsOk) {
        filledFields.value.push('Variant');
      } else {
        missingFields.value.push('Variant');
      }

      // Check quantity separately
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
      missingFields.value.push('Variant');
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

    // Delivery address
    if (data.deliveryAddress) {
      form.deliveryAddress = data.deliveryAddress;
      filledFields.value.push('Delivery Address');
    } else {
      missingFields.value.push('Delivery Address');
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

    <div v-if="savedOrder" class="alert alert-success" role="status">
      Order for {{ savedOrder.customerName }} saved.
      <button type="button" class="btn-close float-end" aria-label="Dismiss" @click="savedOrder = null"></button>
    </div>

    <div v-if="saveError" class="alert alert-danger" role="alert">{{ saveError }}</div>

    <form @submit.prevent="saveOrder" novalidate>
      <!-- Customer -->
      <fieldset class="mb-4">
        <legend class="h5">Customer</legend>

        <div class="mb-3">
          <label for="customerName" class="form-label">Name *</label>
          <input id="customerName" v-model="form.customerName" class="form-control"
            :class="{ 'is-invalid': isMissing('Customer name') }" />
        </div>

        <div class="row g-3">
          <div class="col-sm-6">
            <label for="customerContact" class="form-label">Contact</label>
            <input id="customerContact" v-model="form.customerContact" class="form-control"
              placeholder="Phone or handle" />
          </div>
          <div class="col-sm-6">
            <label for="platform" class="form-label">Ordered via</label>
            <select id="platform" v-model="form.platform" class="form-select">
              <option value="">Not specified</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="telegram">Telegram</option>
              <option value="tiktok">TikTok</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      </fieldset>

      <!-- Items -->
      <fieldset class="mb-4">
        <legend class="h5">Items *</legend>

        <div v-if="productsError" class="alert alert-warning">{{ productsError }}</div>
        <div v-else-if="!products.length" class="text-muted mb-2">
          No products yet. Add one on the Products page first.
        </div>

        <div v-for="(item, index) in form.items" :key="index" class="row g-2 align-items-end mb-2">
          <div class="col-sm-5">
            <label :for="`product-${index}`" class="form-label">Product</label>
            <select :id="`product-${index}`" v-model="item.product" class="form-select"
              :class="{ 'is-invalid': !item.product && isMissing('Products and quantities') }"
              @change="onProductChange(item)">
              <option value="" disabled>Choose a product</option>
              <option v-for="p in products" :key="p._id" :value="p._id">{{ p.name ?? p._id }}</option>
            </select>
          </div>
          <div class="col-sm-3">
            <label :for="`variant-${index}`" class="form-label">Variant</label>
            <select :id="`variant-${index}`" v-model="item.variantId" class="form-select"
              :disabled="variantsFor(item).length === 0"
              :class="{ 'is-invalid': variantsFor(item).length > 0 && !item.variantId && isMissing('Variant') }">
              <option value="" disabled>{{ variantPlaceholder(item) }}</option>
              <option v-for="v in variantsFor(item)" :key="v._id" :value="v._id">
                {{ v.name }} (${{ (v.price ?? findProduct(item.product).price).toFixed(2) }})
              </option>
            </select>
          </div>
          <div class="col-sm-2">
            <label :for="`qty-${index}`" class="form-label">Qty</label>
            <input :id="`qty-${index}`" v-model.number="item.quantity" type="number" min="1" class="form-control" />
          </div>
          <div class="col-sm-2">
            <button type="button" class="btn btn-outline-danger w-100" :disabled="form.items.length === 1"
              @click="removeItem(index)">Remove</button>
          </div>
        </div>

        <button type="button" class="btn btn-outline-secondary btn-sm" @click="addItem">Add another item</button>
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
                <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="useCalculatedTotal">Use that</button>
              </template>
              <template v-else>Calculated from your product prices. You can change it.</template>
            </div>
          </div>
          <div class="col-sm-4">
            <label for="paymentStatus" class="form-label">Status</label>
            <select id="paymentStatus" v-model="form.paymentStatus" class="form-select">
              <option value="unpaid">Unpaid</option>
              <option value="deposit">Deposit paid</option>
              <option value="paid">Fully paid</option>
            </select>
          </div>
          <div v-if="form.paymentStatus === 'deposit'" class="col-sm-4">
            <label for="depositAmount" class="form-label">Deposit ($) *</label>
            <input id="depositAmount" v-model.number="form.depositAmount" type="number" min="0" step="0.01"
              class="form-control" :class="{ 'is-invalid': isMissing('Deposit amount') }" />
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
              :class="{ 'is-invalid': isMissing('Collection or delivery') }">
              <option value="" disabled>Choose one</option>
              <option value="self-collect">Self-collect</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div class="col-sm-6">
            <label for="dueAt" class="form-label">Due *</label>
            <input id="dueAt" v-model="form.dueAt" type="datetime-local" class="form-control"
              :class="{ 'is-invalid': isMissing('Due date') }" />
          </div>
          <div v-if="form.fulfilmentMethod === 'delivery'" class="col-12">
            <label for="deliveryAddress" class="form-label">Delivery address *</label>
            <input id="deliveryAddress" v-model="form.deliveryAddress" class="form-control"
              :class="{ 'is-invalid': isMissing('Delivery address') }" />
          </div>
        </div>
      </fieldset>

      <!-- Original message -->
      <div class="mb-4">
        <label for="rawMessage" class="form-label">Customer's message (optional)</label>
        <textarea id="rawMessage" v-model="form.rawMessage" rows="3" class="form-control"
          placeholder="Paste the original message for reference"></textarea>
      </div>

      <!-- type="button": without it, a button inside a <form> also submits the form -->
      <button type="button" @click="autoFillForm" class="btn btn-primary" :disabled="form.rawMessage.length === 0 || isProcessing">
        {{ isProcessing ? 'Processing...' : 'Auto Fill' }}
      </button>

      <div v-if="isProcessing" class="processing-overlay">
        <div class="processing-box">
          <div class="spinner-border text-primary mb-3" role="status"></div>

          <h5>Processing order...</h5>

          <p class="text-muted mb-0">
            Extracting order details. Please be patient. Should not take more than 20s.
          </p>
        </div>
      </div>

      <div v-if="filledFields.length > 0 || missingFields.length > 0" class="mt-3">
        <div class="alert alert-success">
          <div class="fw-bold mb-2">
            ✓ Auto-fill completed
          </div>

          <div class="fw-bold">Detected:</div>

          <ul class="mb-0">
            <li v-for="field in filledFields" :key="field">
              ✓ {{ field }}
            </li>
          </ul>
        </div>

        <div v-if="missingFields.length > 0" class="alert alert-warning">
          <div class="fw-bold mb-2">
            Not detected:
          </div>

          <ul class="mb-0">
            <li v-for="field in missingFields" :key="field">
              ○ {{ field }}
            </li>
          </ul>
        </div>

        <div v-if="detectionProblems.length > 0" class="alert alert-danger">
          <div class="fw-bold mb-2">
            Needs review:
          </div>

          <ul class="mb-0">
            <li v-for="(problem, index) in detectionProblems" :key="index">
              {{ problem }}
            </li>
          </ul>
        </div>
      </div>

      <p v-if="missing.length" class="text-muted small">
        {{ missing.length }} required {{ missing.length === 1 ? 'field' : 'fields' }} left: {{ missing.join(', ') }}
      </p>

      <button type="submit" class="btn btn-primary" :disabled="missing.length > 0 || saving">
        {{ saving ? 'Saving…' : 'Save order' }}
      </button>
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
</style>