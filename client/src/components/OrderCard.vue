<script setup>
// Compact order summary used in the Order Log and on Home.
defineProps({
  order: { type: Object, required: true },
});
</script>

<template>
  <RouterLink :to="`/orders/${order._id}`" class="order-card" data-testid="order-card">
    <!-- TODO: design this card (customer, items, payment status, due date) -->
    <strong>{{ order.customerName }}</strong>
  </RouterLink>
</template>
