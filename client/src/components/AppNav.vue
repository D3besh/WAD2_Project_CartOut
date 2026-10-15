<script setup>
// Main navigation: a bottom tab bar on mobile, a sidebar on desktop.
// Same links in both, so users learn one set of names.
const links = [
  { to: '/', label: 'Home' },
  { to: '/orders', label: 'Order log' },
  { to: '/materials', label: 'Materials' },
  { to: '/products', label: 'Products' },
];
</script>

<template>
  <nav class="app-nav" aria-label="Main">
    <RouterLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="app-nav__link"
      :data-testid="`nav-${link.label.toLowerCase().replace(' ', '-')}`"
    >
      <!-- TODO: add icons -->
      {{ link.label }}
    </RouterLink>
  </nav>
</template>

<style scoped>
.app-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--nav-height);
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #fff;
  border-top: 1px solid #ddd;
  z-index: 10;
}

.app-nav__link {
  text-decoration: none;
  padding: 0.5rem;
}

.app-nav__link.router-link-exact-active {
  font-weight: 700;
}

@media (min-width: 768px) {
  .app-nav {
    top: 0;
    right: auto;
    width: var(--sidebar-width);
    height: 100vh;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    gap: 0.25rem;
    padding: 1.5rem 1rem;
    border-top: none;
    border-right: 1px solid #ddd;
  }
}
</style>
