<script setup>
// "This week" card for the Home page: one DayCard per day, today first.
// Clicking a day opens the Order log for that day: /orders?date=2026-11-06
// It loads its own data, so a page only needs:  <WeekStrip />
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import DayCard from './DayCard.vue';
import InfoTip from '../InfoTip.vue';
import { buildWeekDays, busiestOf, tomorrowShortages, formatDay } from '../../utils/forecast.js';

const router = useRouter();

// =====================================================
// DATA
// =====================================================
const forecast = ref(null);   // null = still loading
const products = ref([]);     // for "time to make"
const materials = ref([]);    // for tomorrow's "short" check
const errorMessage = ref('');

async function loadData() {
  try {
    let forecastResponse = await axios.get('/api/materials/forecast');
    let productsResponse = await axios.get('/api/products');
    let materialsResponse = await axios.get('/api/materials');
    forecast.value = forecastResponse.data;
    products.value = productsResponse.data;
    materials.value = materialsResponse.data;
  } catch (error) {
    errorMessage.value = "Couldn't load this week's forecast.";
  }
}

onMounted(loadData);

// =====================================================
// THE 7 DAYS
// =====================================================
const days = computed(() => buildWeekDays(forecast.value, products.value));
const busiest = computed(() => busiestOf(days.value));
const tallest = computed(() => Math.max(1, ...days.value.map((d) => d.orders + d.extra)));

// How many products we may be short of tomorrow (stock can only be checked for tomorrow)
const tomorrowShort = computed(() => tomorrowShortages(forecast.value, products.value, materials.value).length);

// "Today", "Tue", "Wed", ...
function labelFor(day) {
  if (day.index === 0) return 'Today';
  return formatDay(day.date).slice(0, 3);
}

// "Mon, 2 Nov" for today, just "3 Nov" for the rest
function dateTextFor(day) {
  let text = formatDay(day.date);
  return day.index === 0 ? text : text.slice(5);
}

function openDay(date) {
  router.push({ path: '/orders', query: { date: date } });
}
</script>

<template>
  <section class="week-strip">
    <InfoTip label="How the week cards work">
      <strong>Dark</strong> = items ordered, due that day.<br />
      <strong>Striped</strong> = extra items you usually get on that day of the week.<br />
      <strong>⏱</strong> = estimated time to make all items.<br />
      Click a day to see its orders.
    </InfoTip>

    <h2 class="week-strip__title">📅 This week</h2>
    <p class="week-strip__hint">Click a day to see its orders in the Order log</p>

    <p v-if="errorMessage" class="week-strip__hint">{{ errorMessage }}</p>
    <p v-else-if="forecast === null" class="week-strip__hint">Loading…</p>

    <div v-else class="week-strip__days">
      <DayCard
        v-for="day in days"
        :key="day.date"
        :day="day"
        :label="labelFor(day)"
        :date-text="dateTextFor(day)"
        :busiest="busiest !== null && busiest.date === day.date"
        :short-count="day.index === 1 ? tomorrowShort : 0"
        :tallest="tallest"
        @select="openDay"
      />
    </div>

    <p class="week-strip__key">
      <span class="key key--ordered"></span>Items ordered
      <span class="key key--expected"></span>Expected (forecast)
    </p>
  </section>
</template>

<style scoped>
.week-strip {
  position: relative; /* for the "i" in the corner */
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: var(--sk-radius);
  padding: 1rem 1.1rem;
}
.week-strip__title { font-size: 1.05rem; font-weight: 800; margin: 0; padding-right: 2rem; }
.week-strip__hint { font-size: 0.8rem; color: var(--sk-muted); margin: 0.1rem 0 0.7rem; }

/* 7 cards side by side; scrolls sideways on small screens */
.week-strip__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(96px, 1fr));
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.2rem;
}

.week-strip__key { font-size: 0.78rem; color: var(--sk-muted); margin: 0.6rem 0 0; }
.key { display: inline-block; width: 14px; height: 10px; border-radius: 3px; margin: 0 0.35rem 0 0; vertical-align: -1px; }
.key--expected { margin-left: 1rem; background: repeating-linear-gradient(135deg, #c9c8e6 0 4px, #eeeef8 4px 8px); border: 1px dashed var(--sk-brand-muted); }
.key--ordered { background: var(--sk-brand); }
</style>