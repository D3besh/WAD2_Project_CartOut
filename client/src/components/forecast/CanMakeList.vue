<script setup>
// "Can make now (lowest first)" card for the Home page.
// The most you can make of each product with the stock you have, lowest first.
//
// It loads its own data, so a page only needs:  <CanMakeList />   (or :limit="5")
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { fullRecipe, calculateCanMake } from '../../utils/capacity.js';

const props = defineProps({
  limit: { type: Number, default: 3 }, // how many products to list
});

const products = ref([]);
const materials = ref([]);
const loaded = ref(false);

async function loadData() {
  try {
    let productsResponse = await axios.get('/api/products');
    let materialsResponse = await axios.get('/api/materials');
    products.value = productsResponse.data;
    materials.value = materialsResponse.data;
  } catch (error) {
    // Leave the lists empty; the card then says there's nothing to show
  }
  loaded.value = true;
}

onMounted(loadData);

// One row per product (its regular recipe), lowest first.
// Products whose recipe can't be counted (no recipe, or only Low/Medium/High materials) are left out.
const rows = computed(() => {
  let list = [];
  for (let product of products.value) {
    let result = calculateCanMake(fullRecipe(product, null), materials.value);
    if (result.canMake === null) continue;
    list.push({ id: product.id || product._id, name: product.name, canMake: result.canMake, limitedBy: result.limitedBy });
  }
  list.sort((a, b) => a.canMake - b.canMake);
  return list.slice(0, props.limit);
});

function colourOf(canMake) {
  if (canMake === 0) return 'is-none';
  if (canMake < 5) return 'is-few';
  return '';
}
</script>

<template>
  <section class="can-make">
    <RouterLink to="/products" class="can-make__link">Products →</RouterLink>
    <h2 class="can-make__title">🧁 Can make now <span>(lowest first)</span></h2>
    <p class="can-make__hint">The most you can make of each, with the stock you have</p>

    <p v-if="!loaded" class="can-make__hint">Loading…</p>
    <p v-else-if="rows.length === 0" class="can-make__hint">Add recipes to your products to see this.</p>

    <div v-for="row in rows" :key="row.id" class="can-make__row">
      <span>
        {{ row.name }}
        <span class="can-make__why">· {{ row.canMake === 0 ? 'out of' : 'limited by' }} {{ row.limitedBy }}</span>
      </span>
      <strong :class="colourOf(row.canMake)">{{ row.canMake }}</strong>
    </div>
  </section>
</template>

<style scoped>
.can-make {
  position: relative;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius);
  padding: 1rem 1.1rem;
}
.can-make__link { position: absolute; top: 1rem; right: 1.1rem; font-weight: 700; font-size: 0.85rem; color: var(--sk-brand); text-decoration: none; }
.can-make__title { font-size: 1.05rem; font-weight: 800; margin: 0; padding-right: 6rem; }
.can-make__title span { font-size: 0.85rem; font-weight: 500; color: var(--sk-muted); }
.can-make__hint { font-size: 0.8rem; color: var(--sk-muted); margin: 0.1rem 0 0.5rem; }

.can-make__row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.45rem 0; border-top: 1px solid var(--sk-border); font-size: 0.9rem; }
.can-make__row:first-of-type { border-top: none; }
.can-make__why { color: var(--sk-muted); font-size: 0.84rem; }
.is-none { color: var(--sk-danger); }
.is-few { color: var(--sk-warn); }
</style>