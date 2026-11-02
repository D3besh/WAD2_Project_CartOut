<script setup>
// Page buttons under a list: "Showing 1–12 of 15 materials   ‹ Prev  1  2  Next ›"
// Works with v-model, so the page number stays in the parent page:
//
//   const page = ref(1);
//   const PER_PAGE = 12;
//   const shown = computed(() => list.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE));
//
//   <Pager v-model="page" :total="list.length" :per-page="PER_PAGE" item-name="materials" />
//
// (v-model on a component = a "modelValue" prop + an "update:modelValue" event.)
import { computed } from 'vue';

const props = defineProps({
  modelValue: Number,                       // the current page, starting at 1
  total: Number,                            // how many items in the whole list
  perPage: { type: Number, default: 12 },
  itemName: { type: String, default: 'items' },
});

const emit = defineEmits(['update:modelValue']);

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.perPage)));

// "1–12" of the total
const firstShown = computed(() => (props.total === 0 ? 0 : (props.modelValue - 1) * props.perPage + 1));
const lastShown = computed(() => Math.min(props.total, props.modelValue * props.perPage));

function goTo(page) {
  if (page >= 1 && page <= pageCount.value) {
    emit('update:modelValue', page);
  }
}
</script>

<template>
  <nav v-if="total > 0" class="pager" aria-label="Pages">
    <span class="pager__count">Showing {{ firstShown }}–{{ lastShown }} of {{ total }} {{ itemName }}</span>

    <div v-if="pageCount > 1" class="pager__buttons">
      <button type="button" :disabled="modelValue === 1" @click="goTo(modelValue - 1)">‹ Prev</button>
      <button
        v-for="n in pageCount"
        :key="n"
        type="button"
        :class="{ 'is-current': n === modelValue }"
        :aria-current="n === modelValue ? 'page' : null"
        @click="goTo(n)"
      >
        {{ n }}
      </button>
      <button type="button" :disabled="modelValue === pageCount" @click="goTo(modelValue + 1)">Next ›</button>
    </div>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
}
.pager__count { font-size: 0.85rem; color: var(--sk-muted); }
.pager__buttons { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.pager__buttons button {
  min-width: 34px;
  height: 34px;
  padding: 0 0.6rem;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--sk-text);
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius-btn);
  cursor: pointer;
}
.pager__buttons button:hover:not(:disabled) { border-color: var(--sk-brand-muted); }
.pager__buttons button:disabled { color: #c3c2d6; cursor: default; }
.pager__buttons button.is-current { color: #ffffff; background: var(--sk-brand-deep); border-color: var(--sk-brand-deep); }
</style>