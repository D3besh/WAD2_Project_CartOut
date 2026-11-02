<script setup>
// Stock check for ONE item on the New order page, shown under the product / qty row:
//   ✓ You can make 30, enough for this order
//   ⚠ You can only make 2 with your current Butter (300 g left, 150 g each).  [Restock Butter]
// It loads the materials itself, and the Restock button opens the Restock pop-up
// pre-filled with how much more this order needs.
//
// Usage (inside the v-for over the order's items):
//   <StockCheck
//     :product="findProduct(item.product)"
//     :variant="findVariant(item)"     (the chosen variant object, or null for Regular)
//     :quantity="item.quantity"
//     due-text="Fri, 6 Nov"            (optional)
//   />
// It shows nothing until a product and quantity are chosen.
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import RestockModal from './RestockModal.vue';
import { checkOrderLine } from '../../utils/forecast.js';

const props = defineProps({
  product: Object,
  variant: { type: Object, default: null },
  quantity: Number,
  dueText: { type: String, default: '' },
});

// =====================================================
// DATA
// =====================================================
const materials = ref([]);
const loaded = ref(false);

async function loadMaterials() {
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
const check = computed(() => {
  if (!loaded.value || !props.product || !props.quantity || props.quantity < 1) return null;
  return checkOrderLine(props.product, props.variant, props.quantity, materials.value);
});

// The Restock pop-up's rows (null = closed)
const restockRows = ref(null);

function openRestock() {
  restockRows.value = [check.value.restockRow];
}
</script>

<template>
  <div v-if="check && check.enough" class="stock-check is-ok" role="status">
    ✓ <strong>You can make {{ check.canMake }}</strong>, enough for this order
  </div>

  <div v-else-if="check" class="stock-check is-short" role="status">
    <span>
      ⚠ <strong>You can only make {{ check.canMake }}</strong>
      with your current {{ check.limitedBy }}<template v-if="check.left"> ({{ check.left }} left, {{ check.perUnit }} each)</template>.
      <template v-if="dueText"> Due {{ dueText }}, so you can restock before then.</template>
    </span>
    <button v-if="check.restockRow" type="button" class="btn btn-primary btn-sm" @click="openRestock">
      Restock {{ check.limitedBy }}
    </button>
  </div>

  <!-- After restocking, load the materials again so the check updates -->
  <RestockModal v-if="restockRows" :rows="restockRows" @close="restockRows = null" @saved="loadMaterials" />
</template>

<style scoped>
.stock-check {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0.4rem 0 0.9rem;
  padding: 0.45rem 0.7rem;
  font-size: 0.84rem;
  border-radius: var(--sk-radius-sm);
}
.stock-check strong { color: inherit; }
.stock-check .btn { flex-shrink: 0; white-space: nowrap; }
.is-ok { color: var(--sk-ok); background: var(--sk-ok-soft); }
.is-short { color: var(--sk-warn); background: var(--sk-warn-soft); }
</style>