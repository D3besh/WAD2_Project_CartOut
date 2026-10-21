<script setup>
// The In progress → Ready → Completed tracker.
// Used as a filter in the Order Log and as a status control in Order Detail.
// Pass :disabled="true" to lock it (e.g. cancelled orders).
const props = defineProps({
  modelValue: { type: String, default: 'in-progress' },
  disabled: { type: Boolean, default: false },
});
defineEmits(['update:modelValue']);


const stages = [
  { value: 'in-progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
];


function stateOf(index) {
  const current = stages.findIndex((s) => s.value === props.modelValue);
  const last = stages.length - 1;


  if (index < current) return 'is-done';
  if (index === current && current === last) return 'is-done'; // final step = finished
  if (index === current) return 'is-active';
  return '';
}
</script>


<template>
  <div class="stage-tracker" role="group" aria-label="Order stage">
    <button
      v-for="(stage, i) in stages"
      :key="stage.value"
      type="button"
      class="step"
      :class="[stateOf(i), { 'is-locked': disabled }]"
      :aria-pressed="modelValue === stage.value"
      :data-testid="`stage-${stage.value}`"
      :disabled="disabled"
      @click="$emit('update:modelValue', stage.value)"
    >
      <span class="dot">
        <template v-if="stateOf(i) === 'is-done'">✓</template>
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span class="label">{{ stage.label }}</span>
    </button>
  </div>
</template>


<style scoped>
.stage-tracker {
  display: flex;
  width: 100%;
}


.step {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--sk-muted);
  font-family: inherit;
}


/* connecting line, drawn from the previous dot to this one */
.step:not(:first-child)::before {
  content: '';
  position: absolute;
  top: 18px;
  right: 50%;
  width: 100%;
  height: 3px;
  background: var(--sk-border);
  z-index: 0;
  transition: background 0.25s ease;
}
.step.is-done::before,
.step.is-active::before {
  background: var(--sk-brand);
}


.dot {
  position: relative;
  z-index: 1;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  background: var(--sk-surface);
  border: 2px solid var(--sk-border);
  color: var(--sk-muted);
  transition: all 0.25s ease;
}


.step:hover .dot {
  border-color: var(--sk-brand);
}


.step.is-done .dot {
  background: var(--sk-brand);
  border-color: var(--sk-brand);
  color: #fff;
}


.step.is-active .dot {
  border-color: var(--sk-brand);
  color: var(--sk-brand);
  box-shadow: 0 0 0 4px var(--sk-brand-soft);
}


.label {
  font-size: 0.85rem;
  font-weight: 600;
}
.step.is-active .label,
.step.is-done .label {
  color: var(--sk-text);
}


.step:focus-visible .dot {
  outline: 2px solid var(--sk-brand);
  outline-offset: 3px;
}

/* locked (e.g. cancelled order): can't be clicked */
.step.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}
.step.is-locked:hover .dot {
  border-color: var(--sk-border);
}
</style>