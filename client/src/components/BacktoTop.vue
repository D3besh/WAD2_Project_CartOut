
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const showButton = ref(false);

function checkScroll() {
  showButton.value = window.scrollY > 300;
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

onMounted(() => {
  window.addEventListener('scroll', checkScroll, { passive: true });
  checkScroll();
});

onUnmounted(() => {
  window.removeEventListener('scroll', checkScroll);
});
</script>

<template>
  <button
    v-if="showButton"
    type="button"
    class="btn btn-primary back-to-top"
    aria-label="Back to top"
    title="Back to top"
    @click="scrollToTop"
  >
    ↑
  </button>
</template>

<style scoped>
.back-to-top {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1050;

  width: 44px;
  height: 44px;
  padding: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  border-radius: 50%;
  font-size: 1.4rem;
  font-weight: 700;

  box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);
}

@media (max-width: 575.98px) {
  .back-to-top {
    bottom: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
  }
}
</style>
