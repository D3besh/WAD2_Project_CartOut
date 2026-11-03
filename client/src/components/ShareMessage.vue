<script setup>
// Shows the message for the order's current stage, with a "Copy message"
// button so the seller can paste it into WhatsApp, Instagram, etc.
// Useful for customers who didn't give an email.
//
// The seller can edit the text before copying (v-model on the textarea).
// Edits are only for copying: they are not saved and do not change the emails.
// The box fills the card height and cannot be resized by dragging.
import { computed, ref, watch } from 'vue';

const props = defineProps({
  message: { type: String, default: '' },
});

const draft = ref(''); // the text in the box, bound with v-model
const copied = ref(false);
const copyError = ref('');

// When the automated message changes (e.g. the order moves to Ready),
// put the new message in the box.
watch(
  () => props.message,
  (newMessage) => {
    draft.value = newMessage;
  },
  { immediate: true }
);

const isEdited = computed(() => draft.value !== props.message);

function resetMessage() {
  draft.value = props.message;
}

async function copyMessage() {
  copyError.value = '';
  try {
    await navigator.clipboard.writeText(draft.value);
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
  <section class="sk-card d-flex flex-column" data-testid="share-message">
    <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
      <h2 class="h6 mb-0">Message to customer</h2>
      <button
        v-if="isEdited"
        type="button"
        class="btn btn-link btn-sm p-0"
        @click="resetMessage"
      >
        Reset
      </button>
    </div>

    <label for="customer-message" class="visually-hidden">Message to customer</label>
    <textarea
      id="customer-message"
      v-model="draft"
      class="form-control message-box flex-grow-1"
      data-testid="share-message-input"
    ></textarea>

    <p class="small text-muted mt-1 mb-2">
      {{ isEdited ? 'Edited. Only used when you copy, not saved.' : 'You can edit this before copying.' }}
    </p>

    <button
      type="button"
      class="btn btn-primary btn-sm w-100"
      :disabled="!draft.trim()"
      @click="copyMessage"
    >
      {{ copied ? 'Copied!' : 'Copy message' }}
    </button>

    <p v-if="copyError" class="small text-danger mt-2 mb-0">{{ copyError }}</p>
  </section>
</template>

<style scoped>
.message-box {
  background: var(--sk-brand-soft);
  border-color: transparent;
  border-radius: var(--sk-radius-sm);
  padding: 0.75rem 1rem;
  line-height: 1.5;
  resize: none;      /* fixed size: it fills the card instead of being dragged */
  flex-basis: 0;     /* height comes from the card, not from the text length */
  min-height: 10rem; /* long messages scroll inside the box */
}

.message-box:focus {
  background: var(--sk-surface);
}
</style>