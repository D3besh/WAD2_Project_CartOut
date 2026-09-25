<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppNav from './components/AppNav.vue';

const route = useRoute();
// Login and register pages hide the navigation
const showNav = computed(() => !route.meta.public);
</script>

<template>
  <div class="app-shell" :class="{ 'has-nav': showNav }">
    <!-- Sidebar on desktop, bottom bar on mobile (see AppNav.vue) -->
    <AppNav v-if="showNav" />
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
