<script setup>
// The In progress → Ready → Completed tracker.
// Used as a filter in the Order Log and as a status control in Order Detail.
defineProps({
  modelValue: { type: String, default: 'in-progress' },
});
defineEmits(['update:modelValue']);

const stages = [
  { value: 'in-progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
];
</script>

<template>
  <div class="stage-tracker" role="group" aria-label="Order stage">
    <button
      v-for="stage in stages"
      :key="stage.value"
      type="button"
      :aria-pressed="modelValue === stage.value"
      :data-testid="`stage-${stage.value}`"
      @click="$emit('update:modelValue', stage.value)"
    >
      {{ stage.label }}
    </button>
    <!-- TODO: style as connected dots, filled for the current stage -->
  </div>
</template>
