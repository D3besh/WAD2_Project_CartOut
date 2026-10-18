<script setup>
// One material card.
//
// The parent (MaterialsView) gives the card:
//   - material  → a PROP: the material object (name, isLow, ...)
//   - the middle part of the card → a SLOT: whatever the parent puts between
//     <MaterialCard> and </MaterialCard>
//
// When a button is clicked, the card tells the parent using $emit,
// and sends the material along as the argument.
defineProps({
  material: Object,
});

defineEmits(['restock', 'edit']);
</script>

<template>
  <article class="sk-card sk-card--hover inv-card" :class="{ 'is-low': material.isLow }">

    <!-- Top: name and status pill (same for every card) -->
    <div class="inv-card__head">
      <h2 class="inv-card__title">{{ material.name }}</h2>
      <span v-if="material.isLow" class="status status--danger">Low stock</span>
      <span v-else class="status status--ok">In stock</span>
    </div>

    <!-- Middle: the parent decides what goes here -->
    <div class="inv-card__body">
      <slot></slot>
    </div>

    <!-- Bottom: buttons. $emit('event name', argument) -->
    <div class="inv-card__actions">
      <button type="button" class="btn btn-light btn-sm" @click="$emit('edit', material)">
        Edit
      </button>
      <button type="button" class="btn btn-primary btn-sm" @click="$emit('restock', material)">
        Restock
      </button>
    </div>

  </article>
</template>