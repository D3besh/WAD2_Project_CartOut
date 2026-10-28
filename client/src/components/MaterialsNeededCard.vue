<script setup>
// Shows the total materials needed for the orders ticked on the Order Log,
// plus what has to be made.
//
// Uses the same rules as server/services/inventory.js:
//   one unit needs the product's recipe + the chosen variant's extras,
//   then multiply by the quantity ordered and add up across all orders.
//
// Example: 2 × Matcha Latte (Oat milk) + 1 × Matcha Latte (Regular)
//   Matcha Latte recipe:  4 g matcha, 1 bottle
//   Oat milk extras:      280 ml oat milk
//   Total:                12 g matcha, 3 bottles, 560 ml oat milk
import { computed } from 'vue';
import { formatQty, capitalise } from '../utils/format';

const props = defineProps({
  orders: { type: Array, required: true },    // the selected orders (items.product populated)
  materials: { type: Array, required: true }, // from /api/materials
});


// Finds the variant an order item used, or null for "Regular"
function findVariant(product, item) {
  if (!product.variants) return null;
  if (item.variantId) {
    return product.variants.find((v) => v._id === item.variantId) || null;
  }
  if (item.variant) {
    return product.variants.find((v) => v.name === item.variant) || null;
  }
  return null;
}


// What needs to be made, e.g. [{ name: 'Matcha Latte (Oat milk)', quantity: 3 }]
const itemsToMake = computed(() => {
  const list = [];

  for (const order of props.orders) {
    for (const item of order.items) {
      let name = item.product ? item.product.name : 'Deleted product';
      if (item.variant) name += ' (' + item.variant + ')';

      const existing = list.find((x) => x.name === name);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        list.push({ name: name, quantity: item.quantity });
      }
    }
  }

  return list;
});


// Total amount of each material, e.g. [{ materialId, amount: 560 }]
const totals = computed(() => {
  const list = [];

  for (const order of props.orders) {
    for (const item of order.items) {
      const product = item.product;
      if (!product) continue; // product was deleted, nothing to count

      // main recipe + the variant's extras
      let lines = product.recipe || [];
      const variant = findVariant(product, item);
      if (variant) lines = lines.concat(variant.extras);

      for (const line of lines) {
        const amount = line.amountPerUnit * item.quantity;
        const existing = list.find((t) => t.materialId === line.material);
        if (existing) {
          existing.amount += amount;
        } else {
          list.push({ materialId: line.material, amount: amount });
        }
      }
    }
  }

  return list;
});


// Adds each material's name, unit and stock to the totals, sorted by name
const rows = computed(() => {
  const result = [];

  for (const t of totals.value) {
    const material = props.materials.find((m) => m.id === t.materialId);

    if (!material) {
      result.push({ id: t.materialId, name: 'Unknown material', need: String(t.amount), stock: '-', short: false });
      continue;
    }

    let stock;
    let short = false;
    let low = material.isLow;
    if (material.trackingMode === 'level') {
      stock = 'Level: ' + capitalise(material.level);
    } else {
      stock = formatQty(material.quantity, material.unit);
      short = material.quantity < 0; // see the note under the table
    }

    result.push({
      id: t.materialId,
      name: material.name,
      need: formatQty(t.amount, material.unit),
      stock: stock,
      short: short,
      shortBy: short ? formatQty(-material.quantity, material.unit) : '',
      low: low && !short,
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
});
</script>


<template>
  <section class="sk-card mb-3" data-testid="materials-needed">
    <h2 class="h6 mb-1">Materials needed</h2>
    <p class="small text-muted mb-3">
      For the {{ orders.length }} selected {{ orders.length === 1 ? 'order' : 'orders' }}.
    </p>

    <p v-if="orders.length === 0" class="small text-muted mb-0">
      Tick some orders to see what they need.
    </p>

    <template v-else>
      <!-- What to make -->
      <h3 class="small fw-bold text-uppercase text-muted mb-2">To make</h3>
      <ul class="make-list mb-3">
        <li v-for="item in itemsToMake" :key="item.name">
          <strong>{{ item.quantity }}×</strong> {{ item.name }}
        </li>
      </ul>

      <!-- Materials -->
      <h3 class="small fw-bold text-uppercase text-muted mb-2">Materials</h3>
      <p v-if="rows.length === 0" class="small text-muted mb-0">
        These products have no recipe yet. Add one on the Products page.
      </p>

      <div v-else class="table-responsive">
        <table class="table table-sm align-middle mb-2">
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col" class="text-end">Needed</th>
              <th scope="col" class="text-end">In stock</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id">
              <td>{{ row.name }}</td>
              <td class="text-end fw-semibold">{{ row.need }}</td>
              <td class="text-end" :class="{ 'text-danger fw-semibold': row.short }">
                {{ row.stock }}
                <span v-if="row.short" class="d-block small">Short by {{ row.shortBy }}</span>
                <span v-else-if="row.low" class="d-block small text-warning-emphasis">Running low</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="small text-muted mb-0">
        Materials are taken out of stock when an order is logged, so "In stock" is what's left
        after these orders. A shortfall means you need to buy more.
      </p>
    </template>
  </section>
</template>


<style scoped>
.make-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.make-list li {
  background: var(--sk-brand-soft);
  border-radius: 999px;
  padding: 0.2rem 0.7rem;
  font-size: 0.85rem;
}
</style>