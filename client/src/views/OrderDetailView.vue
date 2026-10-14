<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import StageTracker from '../components/StageTracker.vue';
import ShareMessage from '../components/ShareMessage.vue';

const route = useRoute();
const order = ref(null);
const status = ref('in-progress');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref('');
const copied = ref(false);

// payment
const paymentOptions = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'paid', label: 'Paid' },
];
const paymentChoice = ref('unpaid');
const depositInput = ref('');
const savingPayment = ref(false);
const paymentSaved = ref(false);

// Which buttons are locked (greyed out), based on the saved payment status:
//   unpaid  -> only Unpaid
//   deposit -> Unpaid and Deposit
//   paid    -> all of them
function isDisabled(value) {
  if (savingPayment.value) return true;

  const saved = order.value?.paymentStatus || 'unpaid';

  if (saved === 'paid') return true;
  if (saved === 'deposit') return value === 'unpaid' || value === 'deposit';
  return value === 'unpaid';
}

// the deposit box only shows when switching to deposit from unpaid
const showDepositBox = computed(
  () => paymentChoice.value === 'deposit' && order.value?.paymentStatus !== 'deposit'
);

const balance = computed(() => {
  if (!order.value) return 0;
  return Math.max(order.value.price - (order.value.depositAmount || 0), 0);
});

const itemText = computed(() => {
  if (!order.value) {
    return '';
  }

  const parts = [];

  for (const item of order.value.items) {
    let name = 'item';
    if (item.product) {
      name = item.product.name;
    }

    let text = item.quantity + ' ' + name;
    if (item.variant) {
      text += ' (' + item.variant + ')';
    }

    parts.push(text);
  }

  return parts.join(', ');
});

const generated = computed(() => {
  if (!order.value) return '';

  const name = order.value.customerName;
  const how = order.value.fulfilmentMethod === 'delivery' ? 'delivering to you' : 'ready for you to collect';

  if (status.value === 'ready') {
    return `Hi ${name}! Your order of ${itemText.value} is ready 🎉 We are ${how}. Thank you for your support!`;
  }
  if (status.value === 'completed') {
    return `Hi ${name}! Thanks for your order of ${itemText.value}. Hope you enjoy it! 😊`;
  }
  return `Hi ${name}! Thanks for your order of ${itemText.value}. We're working on it now 😊`;
});

const shown = computed({
  get: () => message.value || generated.value,
  set: (v) => (message.value = v),
});

async function loadOrder() {
  loading.value = true;
  error.value = '';

  try {
    const response = await axios.get(`/api/orders/${route.params.id}`);
    order.value = response.data;
    status.value = response.data.status;
    paymentChoice.value = response.data.paymentStatus || 'unpaid';
    depositInput.value = response.data.depositAmount || '';
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load order.';
  } finally {
    loading.value = false;
  }
}

async function changeStatus(newStatus) {
  const previous = status.value;
  status.value = newStatus;
  message.value = ''; // use a fresh generated message for the new stage
  saving.value = true;
  error.value = '';

  try {
    const response = await axios.patch(`/api/orders/${route.params.id}/status`, {
      status: newStatus,
    });

    order.value = response.data.order;
  } catch (err) {
    status.value = previous; // undo if saving failed
    error.value = err.response?.data?.message || 'Could not update status.';
  } finally {
    saving.value = false;
  }
}

// Paid saves straight away. Deposit waits until Save is pressed.
function choosePayment(value) {
  if (isDisabled(value)) return;

  paymentChoice.value = value;
  error.value = '';
  if (value !== 'deposit') {
    savePayment();
  }
}

async function savePayment() {
  savingPayment.value = true;
  paymentSaved.value = false;
  error.value = '';

  try {
    const response = await axios.patch(`/api/orders/${route.params.id}/payment`, {
      paymentStatus: paymentChoice.value,
      depositAmount: Number(depositInput.value) || 0,
    });

    order.value = response.data.order;
    paymentChoice.value = response.data.order.paymentStatus;
    depositInput.value = response.data.order.depositAmount || '';

    paymentSaved.value = true;
    setTimeout(() => (paymentSaved.value = false), 2000);
  } catch (err) {
    paymentChoice.value = order.value.paymentStatus || 'unpaid'; // undo if saving failed
    error.value = err.response?.data?.message || 'Could not update payment.';
  } finally {
    savingPayment.value = false;
  }
}

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(shown.value);
  } catch (err) {
    const temp = document.createElement('textarea');
    temp.value = shown.value;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
  }

  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

onMounted(loadOrder);
</script>

<template>
  <div style="max-width: 720px">
    <RouterLink to="/orders" class="fw-semibold text-decoration-none">
      ← Back to Orders
    </RouterLink>

    <div v-if="loading" class="empty-state mt-3">Loading order...</div>
    <div v-else-if="!order" class="empty-state text-danger mt-3">{{ error }}</div>

    <template v-else>
      <header class="page-header mt-2">
        <div>
          <h1>{{ order.customerName }}</h1>
          <p>{{ itemText }} · ${{ order.price }} · {{ order.fulfilmentMethod }}</p>
        </div>
      </header>

      <p v-if="error" class="text-danger">{{ error }}</p>

      <section class="sk-card mb-3">
        <h2 class="h6 mb-3">Status <small v-if="saving" class="text-muted">saving...</small></h2>
        <StageTracker :model-value="status" @update:model-value="changeStatus" />
      </section>

      <section class="sk-card mb-3">
        <h2 class="h6 mb-3">
          Payment
          <small v-if="savingPayment" class="text-muted">saving...</small>
          <small v-else-if="paymentSaved" class="text-muted">✓ saved</small>
        </h2>

        <div class="d-flex flex-wrap gap-2">
          <button
            v-for="opt in paymentOptions"
            :key="opt.value"
            type="button"
            class="btn btn-sm"
            :class="
              isDisabled(opt.value)
                ? 'is-locked'
                : paymentChoice === opt.value
                  ? 'btn-primary'
                  : 'btn-outline-primary'
            "
            :disabled="isDisabled(opt.value)"
            :aria-pressed="paymentChoice === opt.value"
            @click="choosePayment(opt.value)"
          >
            <span v-if="paymentChoice === opt.value">✓ </span>{{ opt.label }}
          </button>
        </div>

        <p v-if="order.depositAmount > 0" class="text-muted-sk small mt-3 mb-0">
          Deposit on record: ${{ Number(order.depositAmount).toFixed(2) }}
          <template v-if="order.paymentStatus === 'deposit'">
            · Balance left to pay: ${{ balance.toFixed(2) }}
          </template>
        </p>

        <div v-if="showDepositBox" class="mt-3">
          <label class="form-label" for="depositAmount">Deposit amount</label>
          <div class="d-flex gap-2" style="max-width: 280px">
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input
                id="depositAmount"
                v-model="depositInput"
                type="number"
                min="0"
                step="0.01"
                class="form-control"
              />
            </div>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="savingPayment"
              @click="savePayment"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <ShareMessage v-model:message="shown" />

      <button type="button" class="btn btn-primary mt-3" @click="copyMessage">
        {{ copied ? '✓ Copied!' : 'Copy message' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.btn.is-locked,
.btn.is-locked:disabled {
  background: #ecebe2;
  border: 1px solid var(--sk-border);
  color: var(--sk-muted);
  opacity: 1;
  cursor: not-allowed;
}
</style>