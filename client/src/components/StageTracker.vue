<script setup>
// The In progress → Ready → Completed tracker on Order Detail.
// Orders only move FORWARD: earlier steps can't be clicked.
// Clicking a later step asks "Are you sure?" first, then emits the new stage.
// Pass :disabled="true" to lock it (e.g. cancelled orders).
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: 'in-progress' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

const pending = ref(null); // the step clicked but not confirmed yet


const stages = [
  { value: 'in-progress', label: 'In progress' },
  { value: 'ready', label: 'Ready' },
  { value: 'completed', label: 'Completed' },
];


const currentIndex = computed(() => stages.findIndex((s) => s.value === props.modelValue));

// The current step and the ones before it can't be clicked (no going back)
function isLocked(index) {
  return props.disabled || index <= currentIndex.value;
}

function pick(stage, index) {
  if (isLocked(index)) return;
  pending.value = stage;
}

function confirm() {
  emit('update:modelValue', pending.value.value);
  pending.value = null;
}

// If the order changes (saved, or cancelled), close the question
watch(
  () => [props.modelValue, props.disabled],
  () => {
    pending.value = null;
  }
);

function stateOf(index) {
  const current = currentIndex.value;
  const last = stages.length - 1;


  if (index < current) return 'is-done';
  if (index === current && current === last) return 'is-done'; // final step = finished
  if (index === current) return 'is-active';
  return '';
}
</script>


<template>
  <div>
  <div class="stage-tracker" role="group" aria-label="Order stage">
    <button
      v-for="(stage, i) in stages"
      :key="stage.value"
      type="button"
      class="step"
      :class="[stateOf(i), { 'is-locked': disabled, 'is-past': !disabled && isLocked(i) }]"
      :aria-pressed="modelValue === stage.value"
      :data-testid="`stage-${stage.value}`"
      :disabled="isLocked(i)"
      @click="pick(stage, i)"
    >
      <span class="dot">
        <template v-if="stateOf(i) === 'is-done'">✓</template>
        <template v-else>{{ i + 1 }}</template>
      </span>
      <span class="label">{{ stage.label }}</span>
    </button>
  </div>

  <!-- "Are you sure?" before moving forward -->
  <div v-if="pending" class="stage-confirm" data-testid="stage-confirm" role="alertdialog" aria-live="polite">
    <p class="mb-1 fw-semibold">Mark this order as {{ pending.label }}?</p>
    <p class="small text-muted mb-2">
      <template v-if="pending.value === 'completed'">
        This can't be undone. Completed orders can't be cancelled or refunded.
      </template>
      <template v-else>
        Orders can't go back to an earlier step. If the customer gave an email, they'll be notified.
      </template>
    </p>
    <div class="d-flex gap-2">
      <button type="button" class="btn btn-primary btn-sm" @click="confirm">
        Yes, mark as {{ pending.label }}
      </button>
      <button type="button" class="btn btn-light btn-sm" @click="pending = null">Not yet</button>
    </div>
  </div>
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
  left: calc(-50% + 23px);
  right: calc(50% + 23px);
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

/* steps already passed: can't go back, but they don't look faded */
.step.is-past {
  cursor: default;
}
.step.is-past:hover .dot {
  border-color: var(--sk-brand);
}

/* "Are you sure?" box */
.stage-confirm {
  margin-top: 1rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--sk-radius-sm);
  background: var(--sk-brand-soft);
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