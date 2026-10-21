<script setup>
// Lets the seller mark an order as Unpaid / Deposit / Paid.
//   - order → PROP
//   - 'update' → EMIT with { paymentStatus, depositAmount }
import { ref, watch } from 'vue';
import { formatMoney } from '../utils/format';

const props = defineProps({
  order: { type: Object, required: true },
  saving: Boolean,
});
const emit = defineEmits(['update']);

const options = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'paid', label: 'Paid' },
];

const choice = ref(props.order.paymentStatus);
const deposit = ref(props.order.depositAmount || '');
const localError = ref('');

// Keep the form in sync when the order reloads
watch(
  () => props.order,
  (o) => {
    choice.value = o.paymentStatus;
    deposit.value = o.depositAmount || '';
  }
);

function save() {
  localError.value = '';
  if (choice.value === 'deposit') {
    const n = Number(deposit.value);
    if (!(n > 0) || n > props.order.price) {
      localError.value = `Enter a deposit between $0.01 and ${formatMoney(props.order.price)}.`;
      return;
    }
  }
  emit('update', {
    paymentStatus: choice.value,
    depositAmount: choice.value === 'deposit' ? Number(deposit.value) : 0,
  });
}
</script>

<template>
  <section class="sk-card mb-3" data-testid="payment-card">
    <h2 class="h6 mb-3">Payment</h2>

    <div class="btn-group mb-3" role="group" aria-label="Payment status">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        class="btn btn-sm"
        :class="choice === o.value ? 'btn-primary' : 'btn-outline-secondary'"
        :disabled="order.status === 'cancelled'"
        @click="choice = o.value"
      >
        {{ o.label }}
      </button>
    </div>

    <div v-if="choice === 'deposit'" class="mb-2">
      <label class="form-label small" for="deposit-amount">Deposit amount ($)</label>
      <input
        id="deposit-amount"
        v-model="deposit"
        type="number"
        step="0.01"
        min="0"
        class="form-control"
      />
    </div>

    <p class="text-muted small mb-2">Order total: {{ formatMoney(order.price) }}</p>
    <p v-if="localError" class="text-danger small">{{ localError }}</p>

    <button
      class="btn btn-sm btn-primary"
      :disabled="saving || order.status === 'cancelled'"
      @click="save"
    >
      Save payment
    </button>
  </section>
</template>