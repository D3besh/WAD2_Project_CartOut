<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppNav from './components/AppNav.vue';
import ProfileButton from './components/ProfileButton.vue';

const route = useRoute();
const showNav = computed(() => !route.meta.public);
</script>

<template>
  <div class="app-shell" :class="{ 'has-nav': showNav }">
    <AppNav v-if="showNav" />
    <header v-if="showNav" class="app-header">
      <ProfileButton />
    </header>
    <main class="app-main" :class="{ 'app-main--bare': !showNav }">
      <RouterView />
    </main>
  </div>
</template>
