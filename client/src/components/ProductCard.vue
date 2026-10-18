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
  <article class="sk-card sk-card--hover inv-card">

    <!-- Top: name and price -->
    <div class="inv-card__head">
      <h2 class="inv-card__title">{{ product.name }}</h2>
      <span class="inv-card__price">${{ product.price.toFixed(2) }}</span>
    </div>

    <p v-if="product.makingTimeMins" class="inv-meta">
      ⏱ {{ product.makingTimeMins }} min to make
    </p>

    <!-- Middle: the parent decides what goes here -->
    <div class="inv-card__body">
      <slot></slot>
    </div>

    <div class="inv-card__actions">
      <button type="button" class="btn btn-light btn-sm" @click="$emit('edit', product)">Edit</button>
    </div>

  </article>
</template>