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
  <div class="card h-100" :class="{ 'border-danger': material.isLow }">
    <div class="card-body">

      <!-- Top: name and badge (same for every card) -->
      <div class="d-flex justify-content-between align-items-start">
        <h5 class="card-title">{{ material.name }}</h5>
        <span v-if="material.isLow" class="badge bg-danger">Low stock</span>
        <span v-else class="badge bg-success">In stock</span>
      </div>

      <!-- Middle: the parent decides what goes here -->
      <slot></slot>

      <!-- Bottom: buttons. $emit('event name', argument) -->
      <button class="btn btn-sm btn-primary me-2" @click="$emit('restock', material)">
        Mark as restocked
      </button>
      <button class="btn btn-sm btn-outline-secondary" @click="$emit('edit', material)">
        Edit
      </button>

    </div>
  </div>
</template>