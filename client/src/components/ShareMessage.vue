<script setup>
// Shows the generated customer message with Edit and Share.
//
// TODO (your team's interactivity):
//   - If navigator.share exists, open the native share sheet.
//   - Otherwise show a fallback: a "Copy message" button and links that
//     open WhatsApp and Telegram with the message pre-filled.
defineProps({
  message: { type: String, default: '' },
});
</script>

<template>
  <section class="share-message" data-testid="share-message">
    <p>{{ message }}</p>
  </section>
</template>
