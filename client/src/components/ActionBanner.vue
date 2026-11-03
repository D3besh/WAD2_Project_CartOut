<script setup>
// A message bar that tells the seller what just happened, e.g. "✓ Butter added".
// It sticks just under the navbar, so it's visible even when the page is scrolled down.
//
// Usage in a page:
//   const banner = ref(null);
//   banner.value = { type: 'success', text: 'Butter added' };
//   <ActionBanner :message="banner" @close="banner = null" />
//
// type:  'success' (green)  → it worked                  → hides itself after 4 s
//        'info'    (purple) → it worked, but note this    → hides itself after 6 s
//        'error'   (red)    → it didn't work              → stays until closed
import { watch } from 'vue';

const props = defineProps({
  message: Object, // { type, text } or null = nothing to show
});

const emit = defineEmits(['close']);

const ICONS = { success: '✓', info: 'ℹ️', error: '⚠️' };

// When a new message arrives, start a timer to hide it (errors stay until closed)
let timer = null;
watch(
  () => props.message,
  (message) => {
    clearTimeout(timer);
    if (message && message.type !== 'error') {
      let wait = message.type === 'info' ? 6000 : 4000;
      timer = setTimeout(() => emit('close'), wait);
    }
  },
);
</script>

<template>
  <Transition name="action-banner">
    <div
      v-if="message"
      class="action-banner"
      :class="'action-banner--' + message.type"
      :role="message.type === 'error' ? 'alert' : 'status'"
    >
      <span class="action-banner__icon" aria-hidden="true">{{ ICONS[message.type] }}</span>
      <span class="action-banner__text">{{ message.text }}</span>
      <button type="button" class="action-banner__close" aria-label="Close message" @click="emit('close')">✕</button>
    </div>
  </Transition>
</template>

<style scoped>
/* Sticks just under the navbar (the navbar is about 64px tall) */
.action-banner {
  position: sticky;
  top: 76px;
  z-index: 1010; /* above the page, below the navbar (1020) and pop-ups */
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  font-weight: 600;
  border: 1px solid transparent;
  border-radius: var(--sk-radius);
  box-shadow: var(--sk-shadow-lift);
}
.action-banner__text { flex: 1; }
.action-banner__close {
  flex-shrink: 0;
  padding: 0 0.25rem;
  font-size: 0.9rem;
  line-height: 1.4;
  color: inherit;
  background: none;
  border: none;
  opacity: 0.7;
  cursor: pointer;
}
.action-banner__close:hover { opacity: 1; }

/* Colours */
.action-banner--success { color: var(--sk-ok); background: var(--sk-ok-soft); border-color: rgb(31 122 109 / 0.25); }
.action-banner--info { color: var(--sk-brand-dark); background: var(--sk-brand-soft); border-color: rgb(80 80 129 / 0.25); }
.action-banner--error { color: var(--sk-danger); background: var(--sk-danger-soft); border-color: rgb(192 57 43 / 0.25); }

/* Fade + slide in and out */
.action-banner-enter-active,
.action-banner-leave-active { transition: opacity 0.2s, transform 0.2s; }
.action-banner-enter-from,
.action-banner-leave-to { opacity: 0; transform: translateY(-6px); }
</style>