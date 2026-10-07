<script setup>
// One product card.
//
// The parent (ProductsView) gives the card:
//   - product → a PROP: the product object (name, price, ...)
//   - the middle part of the card → a SLOT: here the parent shows
//     "can make" for each variant
//
// When Edit is clicked, the card tells the parent with $emit('edit', product).
defineProps({
  product: Object,
});

defineEmits(['edit']);
</script>

<template>
  <div class="card h-100">
    <div class="card-body">

      <!-- Top: name and price -->
      <div class="d-flex justify-content-between align-items-start">
        <h5 class="card-title">{{ product.name }}</h5>
        <span class="fw-bold">${{ product.price.toFixed(2) }}</span>
      </div>

      <p v-if="product.makingTimeMins" class="text-muted small mb-2">
        ⏱ {{ product.makingTimeMins }} min to make
      </p>

      <!-- Middle: the parent decides what goes here -->
      <slot></slot>

      <button class="btn btn-sm btn-outline-secondary" @click="$emit('edit', product)">Edit</button>
    </div>
  </div>
</template>