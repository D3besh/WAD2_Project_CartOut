<script setup>
// "Needs your attention" card for the Home page: coloured rows, each with an optional button.
// It loads its own data and works out the forecast rows itself:
//   ⚠️ Short 3 Banana bread tomorrow        [Restock]       → opens the Restock pop-up
//   ✅ Enough stock for tomorrow             [Check]         → goes to Products
//   🛒 3 materials to buy this week          [Restock all]   → opens the Restock pop-up
//   🔥 Friday is your busiest day
//
// Usage:
//   <AttentionList :extra-items="overdueRows" @act="onMyRow" @restocked="refreshKey++" />
//
// extra-items (optional) = your own rows, shown first, e.g. overdue orders:
//   [{ key: 'overdue', tone: 'red', icon: '⏰', title: '1 order is overdue',
//      text: 'Shar · due yesterday, 2:53 pm', actionLabel: 'View', primary: false }]
//   tone: 'red' | 'amber' | 'purple' | 'green'. Leave actionLabel out for no button.
// @act       → sends the key of YOUR row whose button was clicked (e.g. 'overdue')
// @restocked → after the Restock pop-up saves, with the names restocked, e.g. ['Flour']
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import RestockModal from './RestockModal.vue';
import { forecastAttentionItems, restockRowFor, restockPlanFor } from '../../utils/forecast.js';

const props = defineProps({
  extraItems: { type: Array, default: () => [] },
});

const emit = defineEmits(['act', 'restocked']);
const router = useRouter();

// =====================================================
// DATA
// =====================================================
const forecast = ref(null);
const products = ref([]);
const materials = ref([]);
const loaded = ref(false);

async function loadData() {
  try {
    let forecastResponse = await axios.get('/api/materials/forecast');
    let productsResponse = await axios.get('/api/products');
    let materialsResponse = await axios.get('/api/materials');
    forecast.value = forecastResponse.data;
    products.value = productsResponse.data;
    materials.value = materialsResponse.data;
  } catch (error) {
    // The forecast rows just won't show; the page's own rows still do
  }
  loaded.value = true;
}

onMounted(loadData);

// =====================================================
// ROWS: the page's own rows first, then the forecast's
// =====================================================
const rows = computed(() => [
  ...props.extraItems,
  ...forecastAttentionItems(forecast.value, products.value, materials.value),
]);

// =====================================================
// BUTTONS
// =====================================================
const restockRows = ref(null); // the Restock pop-up's rows (null = closed)

function onButton(key) {
  if (key.startsWith('short:')) {
    let row = restockRowFor(forecast.value, key.slice('short:'.length));
    if (row) restockRows.value = [row];
  } else if (key === 'restock-week') {
    restockRows.value = restockPlanFor(forecast.value, 7);
  } else if (key === 'all-good') {
    router.push('/products');
  } else {
    emit('act', key); // one of the page's own rows
  }
}

async function afterRestock(names) {
  await loadData(); // the rows change once stock has gone up
  emit('restocked', names);
}
</script>

<template>
  <section class="attention">
    <h2 class="attention__title">🔔 Needs your attention</h2>
    <p class="attention__hint">Tap one to sort it out</p>

    <p v-if="!loaded" class="attention__hint">Loading…</p>
    <p v-else-if="rows.length === 0" class="attention__hint">Nothing needs you right now.</p>

    <div v-for="item in rows" :key="item.key" class="attention__row" :class="'is-' + item.tone">
      <span class="attention__icon" aria-hidden="true">{{ item.icon }}</span>
      <span class="attention__text">
        <strong>{{ item.title }}</strong>
        <span>{{ item.text }}</span>
      </span>
      <button
        v-if="item.actionLabel"
        type="button"
        class="btn btn-sm"
        :class="item.primary ? 'btn-primary' : 'btn-light'"
        @click="onButton(item.key)"
      >
        {{ item.actionLabel }}
      </button>
    </div>

    <RestockModal v-if="restockRows" :rows="restockRows" @close="restockRows = null" @saved="afterRestock" />
  </section>
</template>

<style scoped>
.attention {
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius);
  padding: 1rem 1.1rem;
}
.attention__title { font-size: 1.05rem; font-weight: 800; margin: 0; }
.attention__hint { font-size: 0.8rem; color: var(--sk-muted); margin: 0.1rem 0 0.3rem; }

.attention__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
}
.attention__icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  background: var(--sk-surface);
  border-radius: 8px;
}
.attention__text { flex: 1; min-width: 0; font-size: 0.86rem; }
.attention__text strong { display: block; font-size: 0.92rem; }
.attention__row .btn { flex-shrink: 0; white-space: nowrap; }

/* Colours mean the same as everywhere else in the app */
.is-red { background: var(--sk-danger-soft); }
.is-amber { background: var(--sk-warn-soft); }
.is-purple { background: var(--sk-brand-soft); }
.is-green { background: var(--sk-ok-soft); }
.is-green strong { color: var(--sk-ok); }
</style>