<script setup>
// Compact order summary used in the Order Log and on Home.
import { computed } from 'vue';
import { formatDue, formatMoney } from '../utils/format';

const props = defineProps({
  order: { type: Object, required: true },
});

const PLATFORM_ICON = {
  whatsapp: 'bi-whatsapp',
  instagram: 'bi-instagram',
  telegram: 'bi-telegram',
  tiktok: 'bi-tiktok',
};

const PAYMENT = {
  paid: { label: 'Paid', css: 'status--ok' },
  deposit: { label: 'Deposit', css: 'status--warn' },
  unpaid: { label: 'Unpaid', css: 'status--danger' },
};

// "2× Matcha Latte (Oat milk), 1× Matcha Cookies"
const itemSummary = computed(() =>
  (props.order.items ?? [])
    .map((i) => {
      const name = i.product?.name ?? i.productName ?? 'Item';
      return `${i.quantity}× ${name}${i.variant ? ` (${i.variant})` : ''}`;
    })
    .join(', ')
);

const isOverdue = computed(
  () => props.order.status !== 'completed' && new Date(props.order.dueAt) < new Date()
);
const payment = computed(() => PAYMENT[props.order.paymentStatus] ?? PAYMENT.unpaid);
</script>

<template>
  <RouterLink
    :to="`/orders/${order._id ?? order.id}`"
    class="order-card sk-card sk-card--hover"
    :class="{ 'is-done': order.status === 'completed' }"
    data-testid="order-card"
  >
    <div class="order-card__top">
      <span class="order-card__platform" :title="order.platform">
        <i :class="['bi', order.fulfilmentMethod === 'delivery' ? 'bi-truck' : 'bi-shop']" aria-hidden="true"></i>
      </span>
      <strong class="order-card__name">{{ order.customerName }}</strong>
      <span class="status" :class="payment.css">{{ payment.label }}</span>
    </div>

    <p class="order-card__items">{{ itemSummary }}</p>

    <div class="order-card__bottom">
      <span class="order-card__due" :class="{ 'is-overdue': isOverdue }">
        <i :class="['bi', isOverdue ? 'bi-exclamation-circle-fill' : 'bi-clock']" aria-hidden="true"></i>
        {{ isOverdue ? 'Overdue · ' : '' }}{{ formatDue(order.dueAt) }}
      </span>
      <span class="order-card__meta">
        <i :class="['bi', order.fulfilment === 'delivery' ? 'bi-truck' : 'bi-shop']" aria-hidden="true"></i>
        {{ formatMoney(order.price) }}
      </span>
    </div>
  </RouterLink>
</template>

