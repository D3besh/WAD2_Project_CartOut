<script setup>
// "What to buy" panel for the Materials page.
// Materials to restock within the chosen range, how much to buy, and a Restock button each.
//
// It loads its own data and opens the Restock pop-up itself, so a page only needs:
//   <WhatToBuyPanel @restocked="reloadAll" />
// @restocked → after the pop-up saves, with the names restocked, e.g. ['Flour', 'Vanilla'].
//              Use it to reload the page's own material cards.
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import InfoTip from '../InfoTip.vue';
import RestockModal from './RestockModal.vue';
import { BUY_RANGES, restockPlanFor, restockStatusText, formatAmount, formatDay } from '../../utils/forecast.js';

const emit = defineEmits(['restocked']);

// =====================================================
// DATA
// =====================================================
const forecast = ref(null); // null = still loading
const errorMessage = ref('');

async function loadForecast() {
  try {
    let response = await axios.get('/api/materials/forecast');
    forecast.value = response.data;
  } catch (error) {
    errorMessage.value = "Couldn't load what to buy.";
  }
}

onMounted(loadForecast);

// =====================================================
// THE LIST
// =====================================================
const range = ref(7); // days: 7, 14 or 30

const rows = computed(() => restockPlanFor(forecast.value, range.value));

// How many more would show up if they chose "1 month" (for the "+ 2 more later" hint)
const laterCount = computed(() => {
  if (range.value === 30) return 0;
  return restockPlanFor(forecast.value, 30).length - rows.value.length;
});

// =====================================================
// RESTOCK POP-UP
// =====================================================
const restockRows = ref(null); // null = closed, otherwise the rows to restock

async function afterRestock(names) {
  await loadForecast(); // the list changes once stock has gone up
  emit('restocked', names);
}

// Pill colour: red = now, orange = within 3 days, amber = this week, purple = later
function pillClass(r) {
  if (r.alreadyLow || r.actIn <= 0) return 'pill--now';
  if (r.actIn <= 3) return 'pill--soon';
  if (r.actIn <= 7) return 'pill--week';
  return 'pill--later';
}
</script>

<template>
  <aside class="buy">
    <InfoTip label="How What to buy works">
      When each material will run low, if sales stay as usual.<br />
      <strong>Buy</strong> = enough to last until the date shown, and keep you above your low-stock level.<br />
      Choose how far ahead you shop with <strong>Buy enough for</strong>.
    </InfoTip>

    <h2 class="buy__title">🛒 What to buy</h2>
    <p class="buy__hint">Based on your usual sales and orders already logged</p>

    <div class="buy__range">
      <span>Buy enough for</span>
      <div class="buy__seg" role="group" aria-label="Buy enough for">
        <button
          v-for="r in BUY_RANGES"
          :key="r.days"
          type="button"
          :class="{ 'is-on': range === r.days }"
          :aria-pressed="range === r.days"
          @click="range = r.days"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="buy__hint">{{ errorMessage }}</p>
    <p v-else-if="forecast === null" class="buy__hint">Loading…</p>
    <p v-else-if="rows.length === 0" class="buy__hint mt-2">Nothing to buy for now. 🎉</p>

    <div v-for="r in rows" :key="r.id" class="buy__row">
      <div class="buy__name">
        {{ r.name }}
        <span class="pill" :class="pillClass(r)">{{ restockStatusText(r) }}</span>
      </div>
      <div class="buy__meta">
        {{ formatAmount(r.quantity, r.unit) }} left · enough until {{ formatDay(r.enoughUntil) }}
      </div>
      <div class="buy__act">
        <strong>Buy ~{{ r.buyText }}</strong>
        <button type="button" class="btn btn-primary btn-sm" @click="restockRows = [r]">Restock</button>
      </div>
    </div>

    <button
      v-if="rows.length > 1"
      type="button"
      class="btn btn-primary w-100 mt-2"
      @click="restockRows = rows"
    >
      Restock all {{ rows.length }} at once
    </button>

    <p v-if="laterCount > 0" class="buy__later">
      + {{ laterCount }} more going low later this month ·
      <button type="button" class="buy__show" @click="range = 30">show</button>
    </p>

    <RestockModal v-if="restockRows" :rows="restockRows" @close="restockRows = null" @saved="afterRestock" />
  </aside>
</template>

<style scoped>
.buy {
  position: relative;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-top: 4px solid var(--sk-ok);
  border-radius: var(--sk-radius);
  padding: 1rem 1.1rem;
}
.buy__title { font-size: 1.05rem; font-weight: 800; margin: 0; padding-right: 2rem; }
.buy__hint { font-size: 0.8rem; color: var(--sk-muted); margin: 0.15rem 0 0.6rem; }

.buy__range { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.82rem; color: var(--sk-muted); margin-bottom: 0.3rem; }
.buy__seg { display: inline-flex; border: 1px solid var(--sk-border); border-radius: var(--sk-radius-btn); overflow: hidden; }
.buy__seg button { border: none; background: var(--sk-surface); color: var(--sk-muted); font-weight: 700; font-size: 0.8rem; padding: 0.28rem 0.65rem; }
.buy__seg button.is-on { background: var(--sk-brand-deep); color: #ffffff; }

.buy__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.15rem 0.75rem;
  padding: 0.65rem 0;
  border-top: 1px solid var(--sk-border);
}
.buy__name { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; font-weight: 800; }
.buy__meta { grid-column: 1; font-size: 0.76rem; color: var(--sk-muted); }
.buy__act { grid-column: 2; grid-row: 1 / 3; display: flex; flex-direction: column; align-items: flex-end; gap: 0.25rem; }
.buy__act strong { font-size: 0.95rem; white-space: nowrap; }

.pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.12rem 0.5rem; font-size: 0.68rem; font-weight: 800; border-radius: 999px; white-space: nowrap; }
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.pill--now { color: var(--sk-danger); background: var(--sk-danger-soft); }
.pill--soon { color: #b4530b; background: #ffe9d6; }
.pill--week { color: var(--sk-warn); background: var(--sk-warn-soft); }
.pill--later { color: var(--sk-brand); background: var(--sk-brand-soft); }

.buy__later { text-align: center; font-size: 0.78rem; color: var(--sk-muted); margin: 0.5rem 0 0; }
.buy__show { border: none; background: none; padding: 0; color: var(--sk-brand); font-weight: 700; text-decoration: underline; }
</style>