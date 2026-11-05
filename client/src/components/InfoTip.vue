<script setup>
// A small "i" button for the top-right corner of a card.
// Hover it (or tap / Tab to it) and an explanation pops up.
//
// Usage:
//   <InfoTip>How this card works, can include <strong>bold</strong> text</InfoTip>
//
// The card it sits in needs  position: relative.
// Its styles live in this file, so it works on any page (they used to be in forecast.css).
defineProps({
  label: { type: String, default: 'How this works' }, // read out by screen readers
});

// A unique id so the button can point at its own bubble (aria-describedby)
const bubbleId = 'tip-' + Math.random().toString(36).slice(2, 8);
</script>

<template>
  <span class="info-tip">
    <button type="button" class="info-tip__btn" :aria-label="label" :aria-describedby="bubbleId">i</button>
    <span :id="bubbleId" class="info-tip__bubble" role="tooltip">
      <slot></slot>
    </span>
  </span>
</template>

<style scoped>
.info-tip { position: absolute; top: 0.85rem; right: 0.9rem; z-index: 5; }
.info-tip__btn {
  width: 24px;
  height: 24px;
  padding: 0;
  display: grid;
  place-items: center;
  font: italic 800 0.8rem Georgia, serif;
  color: var(--sk-brand);
  background: var(--sk-surface);
  border: 1.5px solid var(--sk-brand-muted);
  border-radius: 50%;
  cursor: help;
}
.info-tip__bubble {
  display: none;
  position: absolute;
  top: calc(100% + 10px);
  right: -6px;
  width: min(320px, 80vw);
  padding: 0.75rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  color: #f1f0fa;
  background: #1f1e3a;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.25);
}
.info-tip__bubble :slotted(strong) { color: #ffffff; } /* :slotted = styles the text passed in from the page */
/* the little arrow pointing at the "i" */
.info-tip__bubble::before {
  content: "";
  position: absolute;
  top: -6px;
  right: 12px;
  width: 12px;
  height: 12px;
  background: #1f1e3a;
  transform: rotate(45deg);
}
/* Show on hover, and when the button is focused (keyboard, or tapping on a phone) */
.info-tip:hover .info-tip__bubble,
.info-tip:focus-within .info-tip__bubble { display: block; }
.info-tip:hover .info-tip__btn,
.info-tip:focus-within .info-tip__btn { color: #ffffff; background: var(--sk-brand); border-color: var(--sk-brand); }
</style>