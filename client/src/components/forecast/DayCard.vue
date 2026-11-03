<script setup>
// One day in the "This week" strip (used by WeekStrip.vue).
// Dark solid bar = items already ordered. Striped bar = extra items expected (a guess).
import { computed } from 'vue';
import { formatTime } from '../../utils/forecast.js';

const props = defineProps({
  day: Object,          // { date, orders, extra, minutes, holiday } from buildWeekDays()
  label: String,        // "Today", "Tue", ...
  dateText: String,     // "Mon, 2 Nov"
  busiest: Boolean,     // the busiest day this week
  shortCount: Number,   // products we may be short of (only worked out for tomorrow)
  tallest: Number,      // the biggest day's items, so all bars share one scale
});

defineEmits(['select']);

// Bar heights in px: the biggest day this week = 46px
function barHeight(amount) {
  return Math.round((amount / Math.max(1, props.tallest)) * 46);
}

// "1 item" / "3 items"
const itemsText = computed(() => (props.day.orders === 1 ? '1 item' : props.day.orders + ' items'));
</script>

<template>
  <button type="button" class="day-card" :class="{ 'is-busiest': busiest }" @click="$emit('select', day.date)">
    <span class="day-card__name">{{ label }}</span>
    <span class="day-card__date">{{ dateText }}</span>

    <span class="day-card__bars" aria-hidden="true">
      <span class="day-card__expected" :style="{ height: barHeight(day.extra) + 'px' }"></span>
      <span class="day-card__ordered" :style="{ height: barHeight(day.orders) + 'px' }"></span>
    </span>

    <span class="day-card__nums">
      <strong>{{ itemsText }}</strong> ordered<br />+ ~{{ day.extra }} expected
    </span>
    <span class="day-card__time" :class="{ 'is-busy': busiest }">⏱ {{ formatTime(day.minutes) }}</span>

    <span v-if="busiest" class="day-card__tag day-card__tag--busy">Busiest</span>
    <span v-if="shortCount > 0" class="day-card__tag day-card__tag--short">⚠ {{ shortCount }} short</span>
    <span v-if="day.holiday" class="day-card__tag day-card__tag--holiday" title="Orders may be higher or lower than usual">
      Public holiday
    </span>
  </button>
</template>

<style scoped>
.day-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.6rem 0.65rem;
  font: inherit;
  text-align: left;
  color: inherit;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: 12px;
  cursor: pointer;
}
.day-card:hover { border-color: var(--sk-brand-muted); box-shadow: var(--sk-shadow); }
.day-card:focus-visible { outline: 3px solid rgb(80 80 129 / 0.35); outline-offset: 2px; }
.day-card.is-busiest { background: #fff7f6; }

.day-card__name { font-weight: 800; font-size: 0.9rem; }
.day-card__date { font-size: 0.72rem; color: var(--sk-muted); margin-top: -0.25rem; }

.day-card__bars { height: 46px; display: flex; flex-direction: column; justify-content: flex-end; }
.day-card__bars span { display: block; width: 100%; border-radius: 3px; }
/* Ordered = solid. Expected = striped + dashed edge, so it reads as "a guess" */
.day-card__ordered { background: var(--sk-brand); }
.day-card__expected {
  background: repeating-linear-gradient(135deg, #c9c8e6 0 5px, #eeeef8 5px 10px);
  border: 1.5px dashed var(--sk-brand-muted);
}

.day-card__nums { font-size: 0.74rem; color: var(--sk-muted); line-height: 1.3; }
.day-card__nums strong { color: var(--sk-text); }
.day-card__time { font-size: 0.82rem; font-weight: 800; }
.day-card__time.is-busy { color: var(--sk-danger); }

.day-card__tag { align-self: flex-start; font-size: 0.64rem; font-weight: 800; border-radius: 999px; padding: 0.05rem 0.45rem; }
.day-card__tag--busy { color: var(--sk-danger); background: var(--sk-danger-soft); }
.day-card__tag--short,
.day-card__tag--holiday { color: var(--sk-warn); background: var(--sk-warn-soft); }
</style>