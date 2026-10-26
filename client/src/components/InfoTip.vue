<script setup>
// A small "i" button for the top-right corner of a card.
// Hover it (or tap / Tab to it) and an explanation pops up.
//
// Usage:
//   <InfoTip>How this card works, can include <strong>bold</strong> text</InfoTip>
//
// The card it sits in needs  position: relative  (the .fc-card class has it).
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