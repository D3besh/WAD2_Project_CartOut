<script setup>
// Expandable floating "+" button, fixed to the bottom-right of the page.
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const open = ref(false);
const root = ref(null);

// TODO: change these paths to your real "add" pages
const actions = [
  { label: 'Add Order', to: '/orders/new' },
  { label: 'Add Material', to: '/materials' },
  { label: 'Add Product', to: '/products' },
];

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

// close when clicking anywhere outside the button
function onClickOutside(e) {
  if (root.value && !root.value.contains(e.target)) close();
}

function onKey(e) {
  if (e.key === 'Escape') close();
}

// close after navigating to another page
watch(() => route.fullPath, close);

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="fab">
    <Transition name="fab-menu">
      <ul v-if="open" id="fab-menu" class="fab__menu">
        <li v-for="(action, i) in actions" :key="action.to" :style="{ '--i': actions.length - i }">
          <RouterLink :to="action.to" class="fab__item">
            <span class="fab__label">{{ action.label }}</span>
            <span class="fab__mini" aria-hidden="true"></span>
          </RouterLink>
        </li>
      </ul>
    </Transition>

    <button
      type="button"
      class="fab__main"
      :class="{ 'is-open': open }"
      :aria-expanded="open"
      aria-controls="fab-menu"
      :aria-label="open ? 'Close add menu' : 'Open add menu'"
      @click="toggle"
    >
      <span class="fab__plus" aria-hidden="true"></span>
    </button>
  </div>
</template>

<style scoped>
.fab {
  position: fixed;
  right: 1.25rem;
  /* sit above the mobile bottom nav */
  bottom: calc(var(--nav-height) + 1rem);
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.75rem;
}

@media (min-width: 768px) {
  .fab {
    right: 2rem;
    bottom: 2rem;
  }
}

/* main round button */
.fab__main {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  background: var(--sk-brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--sk-shadow-lift);
  transition: background 0.2s ease, transform 0.2s ease;
}
.fab__main:hover {
  background: var(--sk-brand-dark);
}
.fab__main:focus-visible {
  outline: 3px solid var(--sk-brand-soft);
  outline-offset: 2px;
}

/* the plus is drawn with two bars so it is perfectly centred */
.fab__plus {
  position: relative;
  display: block;
  width: 22px;
  height: 22px;
  transition: transform 0.25s ease;
}
.fab__plus::before,
.fab__plus::after,
.fab__mini::before,
.fab__mini::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  background: currentColor;
  border-radius: 2px;
  transform: translate(-50%, -50%);
}
.fab__plus::before { width: 100%; height: 3px; }
.fab__plus::after  { width: 3px; height: 100%; }

/* + turns into an x when open */
.fab__main.is-open .fab__plus {
  transform: rotate(45deg);
}

/* menu */
.fab__menu {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.fab__item {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  text-decoration: none;
  color: var(--sk-text);
}

.fab__label {
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  border-radius: 999px;
  padding: 0.35rem 0.85rem;
  font-size: 0.9rem;
  font-weight: 600;
  box-shadow: var(--sk-shadow);
  white-space: nowrap;
}

.fab__mini {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--sk-surface);
  border: 1px solid var(--sk-border);
  color: var(--sk-brand);
  box-shadow: var(--sk-shadow);
  transition: background 0.15s ease, color 0.15s ease;
}
.fab__mini::before { width: 16px; height: 3px; }
.fab__mini::after  { width: 3px; height: 16px; }

.fab__item:hover .fab__mini {
  background: var(--sk-brand);
  color: #fff;
}

/* pop-up animation, items appear one after another */
.fab-menu-enter-active li,
.fab-menu-leave-active li {
  transition: opacity 0.2s ease, transform 0.2s ease;
  transition-delay: calc(var(--i) * 0.03s);
}
.fab-menu-enter-from li,
.fab-menu-leave-to li {
  opacity: 0;
  transform: translateY(12px) scale(0.9);
}
</style>