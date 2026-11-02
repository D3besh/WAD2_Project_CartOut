<script setup>
// "Restock" pop-up: restock ONE material or SEVERAL at once.
// Amounts start at the suggestion (e.g. 9 kg) and can be changed, typed in kg or g,
// or unticked to skip. Saving sends each one to PATCH /api/materials/:id/restock.
//
// Usage:
//   <RestockModal v-if="restockRows" :rows="restockRows" @close="restockRows = null" @saved="afterRestock" />
//   rows = from WhatToBuyPanel's @restock, restockPlanFor(), or [restockRowFor(forecast, materialId)]
//   @saved sends the names restocked, e.g. ['Flour', 'Vanilla'] (good for a success banner)
import { ref, computed } from 'vue';
import axios from 'axios';
import { unitChoices, bestUnitChoice, formatAmount } from '../../utils/forecast.js';

const props = defineProps({
  rows: Array, // [{ id, name, unit, quantity, buyAmount, ... }]
});

const emit = defineEmits(['close', 'saved']);

// One editable line per material. The amount is shown in an easy unit (9 kg, not 9000 g).
const lines = ref(
  props.rows.map((r) => {
    let choice = bestUnitChoice(r.buyAmount, r.unit);
    return {
      id: r.id,
      name: r.name,
      unit: r.unit,
      quantity: r.quantity,
      choices: unitChoices(r.unit),
      unitLabel: choice.label,
      amount: Math.round((r.buyAmount / choice.times) * 10) / 10, // e.g. 9000 g → 9 (kg)
      include: true,
    };
  }),
);

const saving = ref(false);
const error = ref('');

// The typed amount, turned back into the material's own unit (9 kg → 9000 g)
function baseAmount(line) {
  let choice = line.choices.find((c) => c.label === line.unitLabel);
  return Math.round(line.amount * choice.times);
}

// "6.1 kg now → 15.1 kg after"
function afterText(line) {
  return formatAmount(line.quantity, line.unit) + ' now → ' + formatAmount(line.quantity + baseAmount(line), line.unit) + ' after';
}

const chosen = computed(() => lines.value.filter((l) => l.include && l.amount > 0));
const isSingle = computed(() => props.rows.length === 1);

async function save() {
  if (chosen.value.length === 0) {
    error.value = 'Tick at least one material and enter how much you bought.';
    return;
  }
  saving.value = true;
  error.value = '';
  let done = [];
  try {
    for (let line of chosen.value) {
      await axios.patch('/api/materials/' + line.id + '/restock', { amount: baseAmount(line) });
      done.push(line.name);
    }
    emit('saved', done);
    emit('close');
  } catch (err) {
    let reason = (err.response && err.response.data && err.response.data.message) || err.message;
    // Some may already be saved, so say which
    error.value = (done.length > 0 ? 'Saved ' + done.join(', ') + ', but ' : '') + "couldn't restock the rest: " + reason;
    if (done.length > 0) emit('saved', done);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="modal d-block restock-modal" role="dialog" aria-modal="true" aria-labelledby="restock-title">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 id="restock-title" class="modal-title">{{ isSingle ? 'Restock ' + rows[0].name : 'Restock all' }}</h5>
          <button type="button" class="btn-close" aria-label="Close" @click="$emit('close')"></button>
        </div>

        <div class="modal-body">
          <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
          <p class="restock-modal__intro">
            The amount is filled in with our suggestion. Change it to what you actually bought<template v-if="!isSingle">, or untick one to skip it</template>.
          </p>

          <div v-for="line in lines" :key="line.id" class="restock-modal__line" :class="{ 'is-skipped': !line.include }">
            <input
              v-if="!isSingle"
              :id="'restock-include-' + line.id"
              v-model="line.include"
              type="checkbox"
              class="form-check-input"
            />
            <label :for="'restock-include-' + line.id" class="restock-modal__name">
              <strong>{{ line.name }}</strong><template v-if="!line.include"> (skipped)</template>
              <span>{{ line.include ? afterText(line) : formatAmount(line.quantity, line.unit) + ' now' }}</span>
            </label>
            <div class="input-group">
              <input
                v-model.number="line.amount"
                type="number"
                min="0"
                step="any"
                class="form-control"
                :disabled="!line.include"
                :aria-label="'How much ' + line.name + ' did you buy?'"
              />
              <select
                v-if="line.choices.length > 1"
                v-model="line.unitLabel"
                class="form-select restock-modal__unit"
                :disabled="!line.include"
                :aria-label="'Unit for ' + line.name"
              >
                <option v-for="c in line.choices" :key="c.label" :value="c.label">{{ c.label }}</option>
              </select>
              <span v-else class="input-group-text">{{ line.unitLabel }}</span>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-light" @click="$emit('close')">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="saving || chosen.length === 0" @click="save">
            {{ saving ? 'Saving…' : isSingle ? 'Mark as restocked' : 'Restock ' + chosen.length + ' material(s)' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.restock-modal { background: rgb(15 14 71 / 0.45); overflow-y: auto; }
.restock-modal .modal-content { border: none; border-radius: var(--sk-radius); box-shadow: var(--sk-shadow-lift); }
.restock-modal .modal-title { font-weight: 800; }
.restock-modal__intro { font-size: 0.86rem; color: var(--sk-muted); margin-bottom: 0.5rem; }

.restock-modal__line {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 170px;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-top: 1px solid var(--sk-border);
}
.restock-modal__line:first-of-type { border-top: none; }
.restock-modal__name { margin: 0; }
.restock-modal__name span { display: block; font-size: 0.78rem; color: var(--sk-muted); }
.restock-modal__unit { max-width: 72px; }
.is-skipped .restock-modal__name strong { color: var(--sk-muted); }

@media (max-width: 575.98px) {
  .restock-modal__line { grid-template-columns: auto minmax(0, 1fr); }
  .restock-modal__line .input-group { grid-column: 1 / -1; }
}
</style>