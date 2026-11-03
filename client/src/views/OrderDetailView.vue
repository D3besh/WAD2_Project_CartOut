<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import StageTracker from '../components/StageTracker.vue';
import PaymentTracker from '../components/PaymentTracker.vue';
import DisputeCard from '../components/DisputeCard.vue';
import ShareMessage from '../components/ShareMessage.vue';
import { formatDue, formatMoney } from '../utils/format';

const route = useRoute();
const order = ref(null);
const status = ref('in-progress');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const message = ref(''); // customer message for "Copy message", built by the server

const isCancelled = computed(() => order.value?.status === 'cancelled');

// Payment can't be edited after a cancellation or refund (the server blocks it too)
const paymentLocked = computed(() => {
  if (!order.value) return false;
  return (
    order.value.status === 'cancelled' ||
    order.value.refundAmount > 0 ||
    order.value.forfeitedAmount > 0
  );
});

// Extra steps on the payment tracker, only if they really happened.
// A refund always comes before a cancellation, so the order is Refunded → Cancelled.
const paymentOutcomes = computed(() => {
  const list = [];
  if (!order.value) return list;
  if (order.value.refundAmount > 0) list.push('refunded');
  if (order.value.status === 'cancelled') list.push('cancelled');
  return list;
});

// ---- Display helpers for the page layout ----
const STATUS = {
  'in-progress': { label: 'In progress', css: 'status--brand' },
  ready: { label: 'Ready', css: 'status--warn' },
  completed: { label: 'Completed', css: 'status--ok' },
  cancelled: { label: 'Cancelled', css: 'status--danger' },
};

const PLATFORM = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  telegram: 'Telegram',
  tiktok: 'TikTok',
  other: 'Other',
};

const statusBadge = computed(() => STATUS[order.value?.status] ?? STATUS['in-progress']);
const platformLabel = computed(() => PLATFORM[order.value?.platform] ?? '');
const methodLabel = computed(() =>
  order.value?.fulfilmentMethod === 'delivery' ? 'Delivery' : 'Self-collect'
);

// One line per item, e.g. { name: 'Matcha Cookies', variant: 'Regular', quantity: 2, total: 6 }
const itemLines = computed(() => {
  const lines = [];
  if (!order.value) return lines;

  for (const item of order.value.items) {
    let name = 'Item';
    if (item.product) {
      name = item.product.name;
    }

    let total = null;
    if (item.unitPrice != null) {
      total = item.unitPrice * item.quantity;
    }

    lines.push({ name, variant: item.variant, quantity: item.quantity, total });
  }

  return lines;
});

// Money received so far, and what the customer still owes
const paidSoFar = computed(() => {
  if (!order.value) return 0;
  if (order.value.paymentStatus === 'paid') return order.value.price;
  if (order.value.paymentStatus === 'deposit') return order.value.depositAmount || 0;
  return 0;
});
const balanceDue = computed(() => (order.value ? order.value.price - paidSoFar.value : 0));

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

// Gets the customer message for the order's current stage from the server,
// so "Copy message" uses exactly the same text as the emails.
async function fetchMessage() {
  try {
    const response = await axios.get(`/api/orders/${route.params.id}/message`);
    message.value = response.data.text;
  } catch (err) {
    message.value = ''; // the rest of the page still works without it
  }
}

async function loadOrder() {
  loading.value = true;
  error.value = '';

  try {
    const response = await axios.get(`/api/orders/${route.params.id}`);
    order.value = response.data;
    status.value = response.data.status;
    fetchMessage();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not load order.';
  } finally {
    loading.value = false;
  }
}

async function changeStatus(newStatus) {
  const previous = status.value;
  status.value = newStatus;
  saving.value = true;
  error.value = '';

  try {
    const response = await axios.patch(`/api/orders/${route.params.id}/status`, {
      status: newStatus,
    });

    order.value = response.data.order;
    fetchMessage(); // message for the new stage
  } catch (err) {
    status.value = previous; // undo if saving failed
    error.value = err.response?.data?.message || 'Could not update status.';
  } finally {
    saving.value = false;
  }
}

async function updatePayment(payload) {
  saving.value = true;
  error.value = '';

  try {
    const response = await axios.patch(`/api/orders/${route.params.id}/payment`, payload);
    order.value = response.data.order;
    fetchMessage(); // payment lines in the message changed
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not update payment.';
  } finally {
    saving.value = false;
  }
}

async function cancelOrder(payload) {
  saving.value = true;
  error.value = '';

  try {
    const response = await axios.post(`/api/orders/${route.params.id}/cancel`, payload);
    order.value = response.data.order;
    status.value = response.data.order.status;
    fetchMessage();
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not cancel order.';
  } finally {
    saving.value = false;
  }
}

async function refundOrder(payload) {
  saving.value = true;
  error.value = '';

  try {
    const response = await axios.post(`/api/orders/${route.params.id}/refund`, payload);
    order.value = response.data.order;
    fetchMessage(); // now shows the refund message
  } catch (err) {
    error.value = err.response?.data?.message || 'Could not refund order.';
  } finally {
    saving.value = false;
  }
}

onMounted(loadOrder);
</script>

<template>
  <div>
    <RouterLink to="/orders" class="fw-semibold text-decoration-none">
      <i class="bi bi-arrow-left" aria-hidden="true"></i> ← Back to Order log
    </RouterLink>

    <div v-if="loading" class="empty-state mt-3">Loading order...</div>
    <div v-else-if="!order" class="empty-state text-danger mt-3">{{ error }}</div>

    <template v-else>
      <!-- Key facts strip -->
      <header class="sk-card d-flex flex-wrap align-items-center gap-3 mt-2 mb-3">
        <div>
          <h1 class="h3 mb-0">{{ order.customerName }}</h1>
          <p class="small text-muted mb-0">
            <span v-if="order.orderNo">{{ order.orderNo }}</span>
            <span v-if="order.orderNo && platformLabel"> · </span>
            <span v-if="platformLabel">via {{ platformLabel }}</span>
          </p>
        </div>

        <span class="status" :class="statusBadge.css">{{ statusBadge.label }}</span>

        <!-- Phone: facts drop to their own line. md and up: pushed to the right -->
        <div class="d-flex flex-wrap gap-4 ms-md-auto">
          <div class="fact">
            <small>Due</small>
            <strong>{{ formatDue(order.dueAt) }}</strong>
          </div>
          <div class="fact">
            <small>Method</small>
            <strong>{{ methodLabel }}</strong>
          </div>
          <div class="fact">
            <small>Total</small>
            <strong class="fs-5">{{ formatMoney(order.price) }}</strong>
          </div>
        </div>
      </header>

      <p v-if="error" class="text-danger">{{ error }}</p>

      <!--
        Bootstrap grid:
          phone (< md)  : every card full width, one column
          md (≥ 768px)  : details (5/12) + trackers & cancellation (7/12), messages underneath in 2 columns
          xl (≥ 1200px) : 3 columns → details (3/12), trackers & cancellation (5/12), messages (4/12)
      -->
      <div class="row g-3">
        <!-- LEFT: order details -->
        <div class="col-12 col-md-5 col-xl-3">
          <section class="sk-card h-100 d-flex flex-column">
            <h2 class="h6 mb-3">Order details</h2>

            <ul class="list-unstyled mb-0">
              <li
                v-for="(line, i) in itemLines"
                :key="i"
                class="d-flex justify-content-between gap-2 py-2 border-bottom"
              >
                <div>
                  <strong>{{ line.quantity }}× {{ line.name }}</strong>
                  <small v-if="line.variant" class="d-block text-muted">{{ line.variant }}</small>
                </div>
                <strong v-if="line.total != null">{{ formatMoney(line.total) }}</strong>
              </li>
            </ul>

            <div class="d-flex justify-content-between fw-bold fs-6 pt-2">
              <span>Total</span>
              <span>{{ formatMoney(order.price) }}</span>
            </div>

            <dl class="row small mt-3 mb-3">
              <template v-if="order.customerContact">
                <dt class="col-4 text-muted">Contact</dt>
                <dd class="col-8">{{ order.customerContact }}</dd>
              </template>
              <template v-if="order.customerEmail">
                <dt class="col-4 text-muted">Email</dt>
                <dd class="col-8 text-break">{{ order.customerEmail }}</dd>
              </template>
              <template v-if="order.fulfilmentMethod === 'delivery' && order.deliveryAddress">
                <dt class="col-4 text-muted">Address</dt>
                <dd class="col-8">{{ order.deliveryAddress }}</dd>
              </template>
              <template v-if="platformLabel">
                <dt class="col-4 text-muted">Platform</dt>
                <dd class="col-8">{{ platformLabel }}</dd>
              </template>
            </dl>

            <p v-if="order.customerEmail" class="email-note small mt-auto mb-0">
              <i class="bi bi-envelope" aria-hidden="true"></i>
              Email updates are sent automatically to {{ order.customerEmail }}.
            </p>
          </section>
        </div>

        <!-- MIDDLE: trackers + cancellation -->
        <div class="col-12 col-md-7 col-xl-5 d-flex flex-column gap-3">
          <section class="sk-card">
            <h2 class="h6 mb-3">Order progress <small v-if="saving" class="text-muted">saving...</small></h2>
            <StageTracker
              :model-value="status"
              :disabled="isCancelled"
              @update:model-value="changeStatus"
            />
            <p v-if="isCancelled" class="text-danger small mt-3 mb-0">This order was cancelled.</p>
          </section>

          <section class="sk-card">
            <h2 class="h6 mb-3">Payment <small v-if="saving" class="text-muted">saving...</small></h2>
            <PaymentTracker
              :payment-status="order.paymentStatus"
              :deposit-amount="order.depositAmount || 0"
              :price="order.price"
              :outcomes="paymentOutcomes"
              :disabled="paymentLocked"
              :saving="saving"
              @update="updatePayment"
            />
            <div class="row g-2 mt-2">
              <div class="col-6">
                <div class="money-box">
                  <small>Paid so far</small>
                  <strong>{{ formatMoney(paidSoFar) }}</strong>
                </div>
              </div>
              <div class="col-6">
                <div class="money-box">
                  <small>Balance due</small>
                  <strong :class="{ 'text-warning-sk': balanceDue > 0 }">{{ formatMoney(balanceDue) }}</strong>
                </div>
              </div>
            </div>
          </section>

          <DisputeCard
            :order="order"
            :saving="saving"
            class="flex-grow-1 no-bottom-margin"
            @cancel="cancelOrder"
            @refund="refundOrder"
          />
        </div>

        <!-- RIGHT: message to customer + original message
             phone: stacked · md/lg: side by side · xl: stacked
             Both cards stretch so the column ends level with the others. -->
        <div class="col-12 col-xl-4 d-flex flex-column flex-md-row flex-xl-column gap-3">
          <ShareMessage :message="message" class="w-100 flex-grow-1" />

          <section v-if="order.rawMessage" class="sk-card w-100 flex-grow-1 d-flex flex-column raw-card">
            <h2 class="h6 mb-3">Original customer message</h2>
            <p class="raw-message flex-grow-1 mb-0">{{ order.rawMessage }}</p>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Only colours and small details here. All the layout is Bootstrap classes. */
/* DisputeCard has mb-3 built in; the column's gap-3 does the spacing here instead */
.no-bottom-margin {
  margin-bottom: 0 !important;
}

.status--brand {
  background: var(--sk-brand-soft);
  color: var(--sk-brand);
}

.fact small {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--sk-muted);
}

.email-note {
  padding: 0.65rem 0.8rem;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-brand-soft);
  color: var(--sk-muted);
}

.money-box {
  background: var(--sk-bg);
  border-radius: var(--sk-radius-sm);
  padding: 0.55rem 0.75rem;
}

.money-box small {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--sk-muted);
}

.text-warning-sk {
  color: var(--sk-warn);
}

/* The card fills the leftover space in the column, but a long message
   never makes the column taller: it scrolls inside the grey box instead. */
.raw-card {
  min-height: 0;
}

.raw-message {
  flex-basis: 0;
  min-height: 5rem;
  overflow-y: auto;
  white-space: pre-wrap;
  background: var(--sk-bg);
  border-radius: var(--sk-radius-sm);
  padding: 0.75rem;
  font-size: 0.9rem;
  color: var(--sk-muted);
}
</style>