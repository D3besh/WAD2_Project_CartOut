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
  } catch (err) {
    error.value = err.response.data.message || 'Could not load order.';
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
    error.value = err.response.data.message || 'Could not update status.';
  } finally {
    saving.value = false;
  }
}

onMounted(loadOrder);
</script>

<template>
  <div style="max-width: 720px">
    <RouterLink to="/orders" class="fw-semibold text-decoration-none">
      <i class="bi bi-arrow-left" aria-hidden="true"></i> Order log
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

      <ShareMessage v-model:message="shown" />
    </template>
  </div>
</template>