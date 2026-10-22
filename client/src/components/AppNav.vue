<script setup>
import { ref } from 'vue'
import ProfileButton from './ProfileButton.vue'
// Main navigation: a bar across the top of every page.
// On small screens the links fold into a hamburger menu.
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
/* Navy bar across the top */
.app-nav {
  width: 100%;
  background-color: var(--sk-brand-deep);
  position: sticky;
  top: 0;
  z-index: 1020;
  padding: 0.75rem 0;
}

.navbar-brand {
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #ffffff;
}
.navbar-brand:hover {
  color: #ffffff;
}

/* Links: soft lavender, white when hovered or on that page */
.app-nav__link {
  border-radius: var(--sk-radius-btn);
  padding: 0.5rem 0.95rem;
  color: #b9b8d6;
  font-weight: 600;
  text-decoration: none;
}

.app-nav__link:hover {
  background-color: rgb(255 255 255 / 0.08);
  color: #ffffff;
}

.app-nav__link.router-link-exact-active {
  background-color: var(--sk-brand-dark);
  color: #ffffff;
}

.app-nav__link:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}

/* Hamburger button: white lines on the dark bar */
.navbar-toggler {
  border-color: rgb(255 255 255 / 0.3);
}
.navbar-toggler:focus {
  box-shadow: 0 0 0 0.2rem rgb(255 255 255 / 0.25);
}
.navbar-toggler-icon {
  background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3e%3cpath stroke='rgba%28255, 255, 255, 0.85%29' stroke-linecap='round' stroke-miterlimit='10' stroke-width='2' d='M4 7h22M4 15h22M4 23h22'/%3e%3c/svg%3e");
}

@media (max-width: 991.98px) {
  .navbar-collapse {
    flex-basis: 100%;
  }
  /* A little space between the bar and the opened menu */
  .navbar-nav {
    padding-top: 0.5rem;
    gap: 0.15rem;
  }
}
</style>