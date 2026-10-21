<script setup>
// Financial tracker: Unpaid → Deposit → Paid. Clickable, auto-saves.
//   - Click Unpaid / Paid → saves straight away.
//   - Click Deposit → an amount box appears; saves ~0.7s after you stop typing
//     (or on Enter / clicking away).
// A 4th step appears only if the money was really refunded or the order cancelled.
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = defineProps({
  paymentStatus: { type: String, default: 'unpaid' },
  depositAmount: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  outcome: { type: String, default: '' }, // '' | 'refunded' | 'cancelled'
  disabled: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
});
const emit = defineEmits(['update']);

const stages = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'paid', label: 'Paid' },
];

const selected = ref(null); // step clicked but not saved yet (only used for Deposit)
const depositInput = ref('');
const localError = ref('');
const inputEl = ref(null);
let timer = null;

const shownStatus = computed(() => selected.value ?? props.paymentStatus);

const outcomeLabel = computed(() => {
  if (props.outcome === 'refunded') return 'Refunded';
  if (props.outcome === 'cancelled') return 'Cancelled';
  return '';
});

function stateOf(index) {
  const current = stages.findIndex((s) => s.value === shownStatus.value);
  const last = stages.length - 1;

  if (index < current) return 'is-done';
  if (index === current && current === last) return 'is-done'; // fully paid
  if (index === current) return 'is-active';
  return '';
}

// Reset the form whenever the saved order changes (or a save finishes / fails)
function resetFromOrder() {
  selected.value = null;
  localError.value = '';
  depositInput.value = props.depositAmount > 0 ? String(props.depositAmount) : '';
}
watch(() => [props.paymentStatus, props.depositAmount], resetFromOrder, { immediate: true });
watch(
  () => props.saving,
  (now, before) => {
    if (before && !now) resetFromOrder();
  }
);

async function pick(value) {
  if (props.disabled) return;
  clearTimeout(timer);
  localError.value = '';

  if (value === 'deposit') {
    selected.value = 'deposit';
    await nextTick();
    inputEl.value?.focus();
    return; // wait for the amount before saving
  }

  if (value === props.paymentStatus) {
    selected.value = null; // clicked the current step again, nothing to save
    return;
  }

  selected.value = null;
  emit('update', { paymentStatus: value, depositAmount: 0 });
}

function scheduleSave() {
  clearTimeout(timer);
  timer = setTimeout(saveDeposit, 700);
}

function saveDeposit() {
  clearTimeout(timer);
  if (props.disabled || depositInput.value === '') return;

  const n = Number(depositInput.value);
  if (!(n > 0) || n > props.price) {
    localError.value = `Enter a deposit between $0.01 and $${Number(props.price).toFixed(2)}.`;
    return;
  }
  localError.value = '';

  // nothing changed
  if (props.paymentStatus === 'deposit' && n === props.depositAmount) return;

  emit('update', { paymentStatus: 'deposit', depositAmount: n });
}

onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div>
    <div class="stage-tracker" role="group" aria-label="Payment stage">
      <button
        v-for="(stage, i) in stages"
        :key="stage.value"
        type="button"
        class="step"
        :class="[stateOf(i), { 'is-locked': disabled }]"
        :aria-pressed="shownStatus === stage.value"
        :data-testid="`pay-${stage.value}`"
        :disabled="disabled"
        @click="pick(stage.value)"
      >
        <span class="dot">
          <template v-if="stateOf(i) === 'is-done'">✓</template>
          <template v-else>{{ i + 1 }}</template>
        </span>
        <span class="label">{{ stage.label }}</span>
      </button>

      <div
        v-if="outcomeLabel"
        class="step step--outcome"
        :class="outcome === 'refunded' ? 'is-refunded' : 'is-cancelled'"
        :data-testid="`pay-${outcome}`"
      >
        <span class="dot">{{ outcome === 'refunded' ? '↩' : '✕' }}</span>
        <span class="label">{{ outcomeLabel }}</span>
      </div>
    </div>

    <!-- Deposit amount: shows when Deposit is selected -->
    <div v-if="shownStatus === 'deposit'" class="deposit-box">
      <label class="form-label" for="deposit-amount">Deposit amount ($)</label>
      <input
        id="deposit-amount"
        ref="inputEl"
        v-model="depositInput"
        type="number"
        step="0.01"
        min="0"
        class="form-control form-control-sm"
        data-testid="deposit-input"
        :disabled="disabled"
        @input="scheduleSave"
        @blur="saveDeposit"
        @keyup.enter="saveDeposit"
      />
      <small class="text-muted">
        Order total: ${{ Number(price).toFixed(2) }} · saves automatically
      </small>
      <p v-if="localError" class="text-danger small mb-0 mt-1">{{ localError }}</p>
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

/* locked (cancelled / refunded) */
.step.is-locked {
  cursor: not-allowed;
  opacity: 0.6;
}
.step.is-locked:hover .dot {
  border-color: var(--sk-border);
}

/* deposit amount box */
.deposit-box {
  max-width: 260px;
  margin: 1rem auto 0;
  text-align: center;
}
.deposit-box .form-label {
  font-size: 0.8rem;
  color: var(--sk-muted);
  margin-bottom: 0.25rem;
}

/* 4th step (display only) */
.step--outcome {
  cursor: default;
}
.step--outcome:hover .dot {
  border-color: inherit;
}
.step--outcome .label {
  color: var(--sk-text);
}
.step--outcome.is-refunded::before {
  background: var(--sk-warn, #f0ad4e);
}
.step--outcome.is-refunded .dot {
  background: var(--sk-warn, #f0ad4e);
  border-color: var(--sk-warn, #f0ad4e);
  color: #fff;
}
.step--outcome.is-cancelled::before {
  background: var(--sk-danger, #dc3545);
}
.step--outcome.is-cancelled .dot {
  background: var(--sk-danger, #dc3545);
  border-color: var(--sk-danger, #dc3545);
  color: #fff;
}
</style>