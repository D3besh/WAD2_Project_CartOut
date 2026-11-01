<script setup>
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import StageTracker from '../components/StageTracker.vue';
import PaymentTracker from '../components/PaymentTracker.vue';
import DisputeCard from '../components/DisputeCard.vue';
import ShareMessage from '../components/ShareMessage.vue';

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
  <div style="max-width: 720px; margin: 0 auto;">
    <RouterLink to="/orders" class="fw-semibold text-decoration-none">
      <i class="bi bi-arrow-left" aria-hidden="true"></i> Order log
    </RouterLink>

    <div v-if="loading" class="empty-state mt-3">Loading order...</div>
    <div v-else-if="!order" class="empty-state text-danger mt-3">{{ error }}</div>

    <template v-else>
      <header class="page-header mt-2">
        <div>
          <h1>{{ order.customerName }}</h1>
          <p v-if="order.orderNo" class="small text-muted mb-1">{{ order.orderNo }}</p>
          <p>{{ itemText }} · ${{ order.price }} · {{ order.fulfilmentMethod }}</p>
        </div>
      </header>

      <p v-if="error" class="text-danger">{{ error }}</p>

      <section class="sk-card mb-3">
        <h2 class="h6 mb-3">Order progress <small v-if="saving" class="text-muted">saving...</small></h2>
        <StageTracker
          :model-value="status"
          :disabled="isCancelled"
          @update:model-value="changeStatus"
        />
        <p v-if="isCancelled" class="text-danger small mt-3 mb-0">This order was cancelled.</p>
      </section>

      <section class="sk-card mb-3">
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
      </section>

      <DisputeCard
        :order="order"
        :saving="saving"
        @cancel="cancelOrder"
        @refund="refundOrder"
      />

      <p v-if="order.customerEmail" class="small text-muted mb-3">
        <i class="bi bi-envelope" aria-hidden="true"></i>
        Email updates are sent automatically to {{ order.customerEmail }}.
      </p>

      <ShareMessage :message="message" />
    </template>
  </div>
</template>