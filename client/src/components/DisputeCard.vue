<script setup>
// Cancel / refund card for Order Detail.
//   - order → PROP
//   - 'cancel' and 'refund' → EMITS, the parent calls the API
import { computed, ref } from 'vue';
import { formatMoney } from '../utils/format';

const props = defineProps({
  order: { type: Object, required: true },
  saving: Boolean,
});
const emit = defineEmits(['cancel', 'refund']);

const mode = ref(''); // '' | 'cancel' | 'refund'
const reason = ref('');
const amount = ref('');
const materialsUsed = ref(false);
const forfeitDeposit = ref(false);
const localError = ref('');

const isReady = computed(() => props.order.status === 'ready');
const isCancelled = computed(() => props.order.status === 'cancelled');
const hasDeposit = computed(() => props.order.paymentStatus === 'deposit');

const paid = computed(() => {
  if (props.order.paymentStatus === 'paid') return props.order.price;
  if (props.order.paymentStatus === 'deposit') return props.order.depositAmount;
  return 0;
});

const refundable = computed(
  () => paid.value - (props.order.refundAmount || 0) - (props.order.forfeitedAmount || 0)
);

const canCancel = computed(() => !isCancelled.value && props.order.status !== 'completed');
const canRefund = computed(() => refundable.value > 0);

function open(which) {
  mode.value = which;
  reason.value = '';
  localError.value = '';
  amount.value = which === 'refund' ? refundable.value : '';
  // Ready orders are already made, so materials are used and deposit is kept.
  materialsUsed.value = isReady.value;
  forfeitDeposit.value = isReady.value;
}

function submit() {
  localError.value = '';
  if (!reason.value.trim()) {
    localError.value = 'Please give a reason.';
    return;
  }

  if (mode.value === 'cancel') {
    emit('cancel', {
      reason: reason.value,
      materialsUsed: materialsUsed.value,
      forfeitDeposit: forfeitDeposit.value,
    });
  } else {
    const n = Number(amount.value);
    if (!(n > 0) || n > refundable.value) {
      localError.value = `Enter an amount up to ${formatMoney(refundable.value)}.`;
      return;
    }
    emit('refund', { amount: n, reason: reason.value });
  }
  mode.value = '';
}
</script>

<template>
  <section class="sk-card mb-3" data-testid="dispute-card">
    <h2 class="h6 mb-3">Cancellation and refund</h2>

    <!-- What already happened -->
    <p v-if="isCancelled" class="text-danger mb-2">
      <i class="bi bi-x-circle-fill" aria-hidden="true"></i>
      Cancelled: {{ order.cancelReason }}
    </p>
    <p v-if="isCancelled" class="text-muted small mb-2">
      {{ order.materialsWasted
        ? 'Materials were used (not returned to stock).'
        : 'Materials were returned to stock.' }}
    </p>
    <p v-if="order.forfeitedAmount > 0" class="mb-2">
      Deposit kept: {{ formatMoney(order.forfeitedAmount) }}
    </p>
    <p v-if="order.refundAmount > 0" class="text-warning mb-2">
      <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
      Refunded {{ formatMoney(order.refundAmount) }}: {{ order.refundReason }}
    </p>
    <p class="text-muted small mb-3">
      Paid so far: {{ formatMoney(paid) }} · Can still refund: {{ formatMoney(refundable) }}
    </p>

    <!-- Buttons -->
    <div v-if="!mode" class="d-flex gap-2">
      <button
        class="btn btn-sm btn-outline-danger"
        :disabled="!canCancel || saving"
        @click="open('cancel')"
      >
        Cancel order
      </button>
      <button
        class="btn btn-sm btn-outline-secondary"
        :disabled="!canRefund || saving"
        @click="open('refund')"
      >
        Refund
      </button>
    </div>

    <!-- Small form -->
    <form v-else @submit.prevent="submit">
      <div v-if="mode === 'refund'" class="mb-2">
        <label class="form-label small" for="refund-amount">Refund amount ($)</label>
        <input
          id="refund-amount"
          v-model="amount"
          type="number"
          step="0.01"
          min="0"
          class="form-control"
        />
      </div>

      <div v-if="mode === 'cancel'" class="mb-2">
        <div class="form-check">
          <input
            id="mat-used"
            v-model="materialsUsed"
            type="checkbox"
            class="form-check-input"
            :disabled="isReady"
          />
          <label class="form-check-label small" for="mat-used">
            Materials already used / prepared (do NOT return to inventory)
          </label>
        </div>
        <div v-if="hasDeposit" class="form-check">
          <input
            id="forfeit"
            v-model="forfeitDeposit"
            type="checkbox"
            class="form-check-input"
            :disabled="isReady"
          />
          <label class="form-check-label small" for="forfeit">
            Keep the deposit ({{ formatMoney(order.depositAmount) }}) to cover costs
          </label>
        </div>
        <p v-if="isReady" class="text-muted small mb-1">
          This order is ready, so the materials are used and the deposit is kept.
        </p>
        <p class="small mb-0" :class="materialsUsed ? 'text-danger' : 'text-success'">
          {{ materialsUsed
            ? 'Materials will NOT be returned to inventory.'
            : 'Materials will be added back to inventory automatically.' }}
        </p>
      </div>

      <div class="mb-2">
        <label class="form-label small" for="dispute-reason">Reason</label>
        <textarea id="dispute-reason" v-model="reason" rows="2" class="form-control"></textarea>
      </div>

      <p v-if="localError" class="text-danger small">{{ localError }}</p>

      <button type="submit" class="btn btn-sm btn-danger me-2">
        Confirm {{ mode === 'cancel' ? 'cancellation' : 'refund' }}
      </button>
      <button type="button" class="btn btn-sm btn-link" @click="mode = ''">Back</button>
    </form>
  </section>
</template>