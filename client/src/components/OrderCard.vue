<script setup>
// Compact order summary used in the Order Log and on Home.
import { computed } from 'vue';
import { formatDue, formatMoney } from '../utils/format';

const props = defineProps({
  order: { type: Object, required: true },
});

const PAYMENT = {
  paid: { label: 'Paid', css: 'status--ok' },
  deposit: { label: 'Deposit', css: 'status--warn' },
  unpaid: { label: 'Unpaid', css: 'status--danger' },
};

// "2× Matcha Latte (Oat milk), 1× Matcha Cookies"
const itemSummary = computed(() => {
  const parts = [];

  for (const item of props.order.items) {
    let name = 'Item';
    if (item.product) {
      name = item.product.name;
    }

    let text = item.quantity + '× ' + name;
    if (item.variant) {
      text += ' (' + item.variant + ')';
    }

    parts.push(text);
  }

  return parts.join(', ');
});

const isOverdue = computed(
  () => props.order.status !== 'completed' && new Date(props.order.dueAt) < new Date()
);
const payment = computed(() => PAYMENT[props.order.paymentStatus] ?? PAYMENT.unpaid);
const fulfilmentLabel = computed(() =>
  props.order.fulfilmentMethod === 'delivery' ? 'Delivery' : 'Pickup'
);
</script>

<template>
  <RouterLink
    :to="`/orders/${order._id ?? order.id}`"
    class="order-card sk-card sk-card--hover"
    :class="{ 'is-done': order.status === 'completed' }"
    data-testid="order-card"
  >
    <span class="status order-card__badge" :class="payment.css">{{ payment.label }}</span>

    <div class="order-card__head">
      <strong class="order-card__name">{{ order.customerName }}</strong>
      <span class="order-card__method">{{ fulfilmentLabel }}</span>
    </div>

    <p class="order-card__items">{{ itemSummary }}</p>

    <div class="order-card__bottom">
      <span class="order-card__due" :class="{ 'is-overdue': isOverdue }">
        {{ isOverdue ? 'Overdue · ' : 'Due ' }}{{ formatDue(order.dueAt) }}
      </span>
      <span class="order-card__price">{{ formatMoney(order.price) }}</span>
    </div>
  </RouterLink>
</template>

<style scoped>
.order-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  color: var(--sk-text);
  text-decoration: none;
}

.order-card:hover {
  color: var(--sk-text);
}

/* payment badge, top-right corner */
.order-card__badge {
  position: absolute;
  top: 0.85rem;
  right: 0.9rem;
}

.order-card__head {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding-right: 5rem; /* keep the name clear of the badge */
}

.order-card__name {
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-card__method {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--sk-brand);
}

.order-card__items {
  margin: 0;
  font-size: 0.9rem;
  color: var(--sk-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.order-card__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 0.65rem;
  border-top: 1px solid var(--sk-border);
}

.order-card__due {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--sk-muted);
}

.order-card__due.is-overdue {
  color: var(--sk-danger);
}

.order-card__price {
  font-weight: 800;
  color: var(--sk-text);
}

/* finished orders fade back a little */
.order-card.is-done {
  opacity: 0.7;
}
</style>