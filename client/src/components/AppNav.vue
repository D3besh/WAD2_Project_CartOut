<script setup>
import { ref } from 'vue'
import ProfileButton from './ProfileButton.vue'
// Main navigation: a bottom tab bar on mobile, a sidebar on desktop.
// Same links in both, so users learn one set of names.
const links = [
  { to: '/', label: 'Home' },
  { to: '/orders', label: 'Order log' },
  { to: '/materials', label: 'Materials' },
  { to: '/products', label: 'Products' },
];

// Hamburger
const hamBurger = ref(false)

//close hamburger 
function closeHamburger() {
  hamBurger.value = false
}
</script>

<template>
  <nav
    class="app-nav navbar navbar-expand-lg"
    aria-label="Main navigation"
  >
    <div class="container">

      <!-- CartOut brand: shown at lg and above -->
      <RouterLink
        to="/"
        class="navbar-brand d-none d-lg-block me-lg-4"
        @click="closeHamburger"
      >
        CartOut
      </RouterLink>

      <!-- Hamburger: Bootstrap hides it at lg and above -->
      <button
        class="navbar-toggler order-0"
        type="button"
        aria-controls="navbarNav"
        :aria-expanded="hamBurger"
        aria-label="Toggle navigation"
        @click="hamBurger = !hamBurger"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <!-- One navigation menu for all screen sizes -->
      <div
        id="navbarNav"
        class="collapse navbar-collapse order-2 order-lg-1"
        :class="{ show: hamBurger }"
      >
        <ul class="navbar-nav me-auto mb-0">
          <li
            v-for="link in links"
            :key="link.to"
            class="nav-item"
          >
            <RouterLink
              :to="link.to"
              class="nav-link app-nav__link"
              :data-testid="`nav-${link.label.toLowerCase().replaceAll(' ', '-')}`"
              @click="closeHamburger"
            >
              {{ link.label }}
            </RouterLink>
          </li>
        </ul>
      </div>

      <!-- Profile on the right at all screen sizes -->
      <div class="ms-auto order-1 order-lg-2">
        <ProfileButton />
      </div>

    </div>
  </nav>
</template>

<style scoped>
.app-nav {
  width: 100%;
  background-color: var(--sk-surface);
  border-bottom: 1px solid var(--sk-border);
  position: relative;
  z-index: 20;
  padding: 0.75rem 0;
}

.navbar-brand {
  font-weight: 700;
  color: var(--sk-text);
}

.app-nav__link {
  border-radius: 8px;
  padding: 0.5rem 0.85rem;
  color: var(--sk-brand);
  text-decoration: none;
}

.app-nav__link:hover {
  background-color: var(--sk-brand-soft);
  color: var(--sk-brand-dark);
}

.app-nav__link.router-link-exact-active {
  background-color: var(--sk-brand-soft);
  color: var(--sk-brand-dark);
  font-weight: 700;
}

/* Ensure collapse occupies a full row below lg */
@media (max-width: 991.98px) {
  .navbar-collapse {
    flex-basis: 100%;
  }
}
</style>