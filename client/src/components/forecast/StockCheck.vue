<script setup>
// Stock check for ONE item on the New order page, shown under the product / qty row:
//   ✓ You can make 30, enough for this order
//   ⚠ You can only make 2 with your current Butter (300 g left, 150 g each). Buy 150 g more Butter before Fri, 6 Nov.
// It loads the materials itself. There's no buy button here: buying is done later, from the
// "What to buy" list on the Materials page. This only helps decide whether to take the order.
//
// Usage (inside the v-for over the order's items):
//   <StockCheck
//     :product="findProduct(item.product)"
//     :variant="findVariant(item)"     (the chosen variant object, or null for Regular)
//     :quantity="item.quantity"
//     due-text="Fri, 6 Nov"            (optional)
//   />
// It shows nothing until a product and quantity are chosen.
//
// Two OPTIONAL props, for an order with several items (leave them out and nothing changes):
//     :materials="materials"                   the page's own list from /api/materials. The page
//                                              can reload it after each save, so this check
//                                              doesn't keep showing stock from before the save.
//     :used-by-other-items="{ m1: 300 }"       what the order's OTHER items already need, per
//                                              material id. Taken off the stock before checking,
//                                              because two products can share a material
//                                              (cookies ×3 and cake ×2 can each fit alone,
//                                              but not together).
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { checkOrderLine } from '../../utils/forecast.js';
import { fullRecipe } from '../../utils/capacity.js';

const props = defineProps({
  product: Object,
  variant: { type: Object, default: null },
  quantity: Number,
  dueText: { type: String, default: '' },
  materials: { type: Array, default: null },               // null = load them here
  usedByOtherItems: { type: Object, default: () => ({}) }, // { <materialId>: amount }
});

// =====================================================
// DATA
// =====================================================
const materials = ref([]);
const loaded = ref(false);

async function loadMaterials() {
  if (props.materials !== null) return; // the page gives us its own list
  try {
    let response = await axios.get('/api/materials');
    materials.value = response.data;
    loaded.value = true;
  } catch (error) {
    // No check shown if materials can't be loaded; the order can still be saved
  }
}

onMounted(loadMaterials);

// =====================================================
// THE CHECK
// =====================================================
// The page's list if it gave one, otherwise the one loaded above
const allMaterials = computed(() => (props.materials !== null ? props.materials : materials.value));
const ready = computed(() => props.materials !== null || loaded.value);

// The same materials, minus what the order's other items need
const leftForThisItem = computed(() =>
  allMaterials.value.map((m) => ({
    ...m,
    quantity: m.quantity - (props.usedByOtherItems[String(m.id)] || 0),
  }))
);

const check = computed(() => {
  if (!ready.value || !props.product || !props.quantity || props.quantity < 1) return null;
  return checkOrderLine(props.product, props.variant, props.quantity, leftForThisItem.value);
});

// True when this item would fit on its own, and it's the OTHER items that use the stock up
const shortBecauseOfOthers = computed(() => {
  if (!check.value || check.value.enough) return false;
  let alone = checkOrderLine(props.product, props.variant, props.quantity, allMaterials.value);
  return alone !== null && alone.enough;
});

// =====================================================
// HOW MUCH MORE TO BUY  ("Buy 1 kg more Butter and 300 g more Sugar")
// =====================================================
// Every countable material this item is short of, the bottleneck first.
//   buy = (this item's quantity × amount per unit) − what's left after the other items
// That's how much more the WHOLE order needs of that material, so if two items share
// Butter, both notes show the same amount (don't add them up).
// Level materials (Low / Medium / High) have no number, so they're left out.
const toBuy = computed(() => {
  if (!check.value || check.value.enough) return [];
  let list = [];
  for (let line of fullRecipe(props.product, props.variant || null)) {
    let m = leftForThisItem.value.find((x) => String(x.id) === String(line.material));
    if (!m || m.trackingMode === 'level') continue;
    let buy = line.amountPerUnit * props.quantity - m.quantity;
    buy = Math.round(buy * 1e6) / 1e6; // clear floating-point dust (1000.0000001 would round up to 1.1 kg)
    if (buy > 0) list.push({ name: m.name, text: formatBuyAmount(buy, m.unit) });
  }
  list.sort((a, b) => (a.name === check.value.limitedBy ? -1 : b.name === check.value.limitedBy ? 1 : 0));
  return list;
});

// "1 kg more Butter", "1 kg more Butter and 300 g more Sugar", "A, B and C"
const toBuyText = computed(() => {
  let parts = toBuy.value.map((b) => b.text + ' more ' + b.name);
  if (parts.length <= 1) return parts.join('');
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
});

// Like formatAmount (utils/forecast.js), but always rounds UP, so the seller never
// buys too little: 1040 g → "1.1 kg" (formatAmount would say "1 kg").
function formatBuyAmount(amount, unit) {
  let big = null;
  let bigUnit = '';
  if ((unit === 'g' || unit === 'ml') && amount >= 1000) {
    big = amount / 1000;
    bigUnit = unit === 'g' ? 'kg' : 'L';
  } else if (unit === 'cm' && amount >= 100) {
    big = amount / 100;
    bigUnit = 'm';
  }
  if (big !== null) {
    // 10 and above: whole number. Below 10: one decimal. Both rounded up.
    let shown = big >= 10 ? Math.ceil(big) : Math.ceil(big * 10) / 10;
    return shown + ' ' + bigUnit;
  }
  return Math.ceil(amount) + ' ' + unit;
}

// "(2 kg left, 150 g each)". When the other items have used it all up, "none left"
// reads better than "-500 g left".
const leftText = computed(() => {
  if (!check.value || !check.value.left) return '';
  let row = check.value.restockRow;
  return row && row.quantity <= 0 ? 'none left' : check.value.left + ' left';
});
</script>

<template>
  <div v-if="check && check.enough" class="stock-check is-ok" role="status">
    ✓ <strong>You can make {{ check.canMake }}</strong>, enough for this order
  </div>

  <div v-else-if="check" class="stock-check is-short" role="status">
    ⚠ <strong>You can only make {{ check.canMake }}</strong>{{ shortBecauseOfOthers ? ' after your other items' : '' }}
    with your current {{ check.limitedBy }}<template v-if="leftText"> ({{ leftText }}, {{ check.perUnit }} each)</template>.
    <!-- Nothing countable to list (e.g. a deleted material): fall back to the old wording -->
    Buy {{ toBuy.length ? toBuyText : 'more ' + check.limitedBy }}<template v-if="dueText"> before {{ dueText }}</template>. You can still save the order.
  </div>
</template>

<style scoped>
.stock-check {
  margin: 0.4rem 0 0.9rem;
  padding: 0.45rem 0.7rem;
  font-size: 0.84rem;
  border-radius: var(--sk-radius-sm);
}
.stock-check strong { color: inherit; }
.is-ok { color: var(--sk-ok); background: var(--sk-ok-soft); }
.is-short { color: var(--sk-warn); background: var(--sk-warn-soft); }
</style>