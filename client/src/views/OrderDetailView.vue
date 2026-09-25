<script setup>
// Order details, status update and customer message (prototype view 6).
// The route passes the order id as a prop.
defineProps({
  id: { type: String, required: true },
});

// TODO:
//   - load the order with getOrder(id)
//   - show customer, items, fulfilment, due date and payment status
//   - StageTracker to update the status (updateOrderStatus)
//   - ShareMessage with the generated message after a status change
</script>

<template>
  <section data-testid="page-order-detail">
    <RouterLink to="/orders">Back to order log</RouterLink>
    <h1>Order details</h1>
    <!-- TODO: build this page -->
  </section>
</template>
