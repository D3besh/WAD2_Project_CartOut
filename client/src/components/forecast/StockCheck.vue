<script setup>
// Stock check for ONE item on the New order page, shown under the product / qty row:
//   ✓ You can make 30, enough for this order
//   ⚠ You can only make 2 with your current Butter (300 g left, 150 g each). Buy more before Fri, 6 Nov.
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
</script>

<template>
  <div v-if="check && check.enough" class="stock-check is-ok" role="status">
    ✓ <strong>You can make {{ check.canMake }}</strong>, enough for this order
  </div>

  <div v-else-if="check" class="stock-check is-short" role="status">
    ⚠ <strong>You can only make {{ check.canMake }}</strong>{{ shortBecauseOfOthers ? ' after your other items' : '' }}
    with your current {{ check.limitedBy }}<template v-if="check.left"> ({{ check.left }} left, {{ check.perUnit }} each)</template>.
    Buy more {{ check.limitedBy }}<template v-if="dueText"> before {{ dueText }}</template>. You can still save the order.
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