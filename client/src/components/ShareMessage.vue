<script setup>
// Shows the message for the order's current stage, with a "Copy message"
// button so the seller can paste it into WhatsApp, Instagram, etc.
// Useful for customers who didn't give an email.
import { ref } from 'vue';

const props = defineProps({
  message: { type: String, default: '' },
});

const copied = ref(false);
const copyError = ref('');

async function copyMessage() {
  copyError.value = '';
  try {
    await navigator.clipboard.writeText(props.message);
    copied.value = true;
    // Change the button back after 2 seconds
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    copyError.value = 'Could not copy. Select the message and copy it yourself.';
  }
}
</script>

<template>
  <section class="sk-card mb-3" data-testid="share-message">
    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
      <h2 class="h6 mb-0">Message to customer</h2>
      <button type="button" class="btn btn-primary btn-sm" @click="copyMessage">
        {{ copied ? 'Copied!' : 'Copy message' }}
      </button>
    </div>

    <p class="message-box mb-0">{{ message }}</p>

    <p v-if="copyError" class="small text-danger mt-2 mb-0">{{ copyError }}</p>
  </section>
</template>

<style scoped>
.message-box {
  background: var(--sk-brand-soft);
  border-radius: var(--sk-radius-sm);
  padding: 0.75rem 1rem;
  white-space: pre-wrap; /* keep line breaks in the message */
}
</style>