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
        variantId: item.variantId || null, // Regular (or a product with no variants) → null
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
    
    // Items
    if (data.items?.length > 0) {
      form.items = data.items.map(item => {
        const line = {
          product: item.product ?? '',
          variantId: null,
          quantity: item.quantity ?? 1
        };

        // Match the AI-detected variant name to its MongoDB ID (or Regular).
        line.variantId = matchVariant(line, item.variant);

        // Only flag a variant if one was specified but couldn't be matched.
        if (variantNotMatched(item.variant, line.variantId)) {
          detectionProblems.value.push(
            `Could not match variant "${item.variant}" for "${item.matchedName ?? item.requestedName ?? 'this product'}", so it was set to Regular. Please check it.`
          );
        }

        return line;
      });

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

    <div v-if="savedOrder" class="alert alert-success" role="status">
      Order for {{ savedOrder.customerName }} saved.
      <button type="button" class="btn-close float-end" aria-label="Dismiss" @click="savedOrder = null"></button>
    </div>

    <div v-if="saveError" class="alert alert-danger" role="alert">{{ saveError }}</div>

    <form @submit.prevent="saveOrder" novalidate>
      <!-- Start from the customer's message: paste it, then Auto fill -->
      <section class="autofill-card mb-4" aria-labelledby="autofill-title">
        <h2 id="autofill-title" class="h5 mb-1">Customer's message</h2>
        <p class="autofill-hint mb-2">
          Paste the customer's message and we'll fill in the form for you. You can check and change everything before saving.
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

        <div class="mb-3">
          <label for="customerName" class="form-label">Name *</label>
          <input id="customerName" v-model="form.customerName" class="form-control"
            :class="{ 'is-invalid': isMissing('Customer name'), 'is-autofilled': filledFields.includes('Customer Name') }" />
        </div>

        <div class="row g-3">
          <div class="col-sm-6">
            <label for="customerContact" class="form-label">Contact</label>
            <input id="customerContact" v-model="form.customerContact" class="form-control"
              :class="{ 'is-autofilled': filledFields.includes('Contact') }"
              placeholder="Phone or handle" />
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
              :class="{ 'is-autofilled': filledFields.includes('Variant') }"
              :disabled="variantsFor(item).length === 0">
              <!-- Placeholder only when there's nothing to choose; otherwise Regular is the default -->
              <option v-if="variantsFor(item).length === 0" :value="null" disabled>{{ variantPlaceholder(item) }}</option>
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
              :class="{ 'is-autofilled': filledFields.includes('Quantity') }" />
          </div>
          <div class="col-sm-2">
            <button type="button" class="btn btn-outline-danger w-100" :disabled="form.items.length === 1"
              @click="removeItem(index)">Remove</button>
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
              class="form-control" :class="{ 'is-invalid': isMissing('Deposit amount'), 'is-autofilled': filledFields.includes('Deposit Amount') }" />
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
            <input id="dueAt" v-model="form.dueAt" type="datetime-local" class="form-control"
              :class="{ 'is-invalid': isMissing('Due date'), 'is-autofilled': filledFields.includes('Due Date') }" />
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

        <button type="submit" class="btn btn-primary order-footer__save" :disabled="missing.length > 0 || saving">
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
</style>