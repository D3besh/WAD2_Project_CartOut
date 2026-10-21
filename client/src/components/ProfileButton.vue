<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()

const open = ref(false)
const root = ref(null)
const user = ref(null)

//light dark toggle
const isDarkMode = ref(
  localStorage.getItem('cartoutMode') === 'dark'
)

function toggleTheme() {
  isDarkMode.value = !isDarkMode.value

  const mode = isDarkMode.value ? 'dark' : 'light'

  document.documentElement.classList.remove(
    'light-mode',
    'dark-mode'
  )

  document.documentElement.classList.add(mode + '-mode')

  localStorage.setItem('cartoutMode', mode)
}


// logout confirm dialog state
const showConfirm = ref(false)
const loading = ref(false)
const error = ref('')

function readUser() {
  user.value = JSON.parse(localStorage.getItem('user') || 'null')
}

const initial = computed(() => user.value?.username?.[0]?.toUpperCase())

function toggle() {
  if (!open.value) readUser()
  open.value = !open.value
}

function close() {
  open.value = false
}

// "Log out" in the dropdown only opens the confirm dialog
function askLogout() {
  close()
  error.value = ''
  showConfirm.value = true
}

function cancelLogout() {
  if (loading.value) return
  showConfirm.value = false
}

async function confirmLogout() {
  error.value = ''
  loading.value = true
  try {
    await axios.post('/api/auth/logout')
    localStorage.removeItem('user')
    showConfirm.value = false
    router.replace('/logged-out')
  } catch (err) {
    if (err.response) {
      error.value = err.response.data?.message || 'Could not log you out. Try again.'
    } else {
      error.value = 'Could not reach the server. Check your connection.'
    }
  } finally {
    loading.value = false
  }
}

function onClickOutside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) close()
}

function onKeydown(e) {
  if (e.key !== 'Escape') return
  if (showConfirm.value) cancelLogout()
  else close()
}

watch(() => route.path, close)

onMounted(() => {
  readUser()
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="profile-menu">
    <button class="profile-button" type="button" aria-label="Profile menu" aria-haspopup="true" :aria-expanded="open"
      @click="toggle">
      <template v-if="initial">{{ initial }}</template>
      <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
      </svg>
    </button>

    <Transition name="pop">
      <div v-if="open" class="dropdown" role="menu">
        <div class="dropdown-header">
          <strong>{{ user?.shopName || user?.username }}</strong>
          <span class="muted">@{{ user?.username }}</span>
          <span v-if="user?.email" class="muted">{{ user.email }}</span>
        </div>

        <RouterLink to="/profile" class="item" role="menuitem">View profile</RouterLink>
        <RouterLink to="/profile/edit" class="item" role="menuitem">Edit profile</RouterLink>
        <div class="theme-setting d-flex align-items-center justify-content-between">
          <div>
            <div>App theme</div>
            <small class="muted">
              {{ isDarkMode ? 'Dark mode' : 'Light mode' }}
            </small>
          </div>

          <div class="form-check form-switch mb-0">
            <input
              id="profile-theme-switch"
              class="form-check-input"
              type="checkbox"
              role="switch"
              aria-label="Dark mode"
              :checked="isDarkMode"
              @change="toggleTheme"
            />
          </div>
        </div>
        <button type="button" class="item" role="menuitem" @click="askLogout">Log out</button>
      </div>
    </Transition>
  </div>

  <!-- Confirm dialog: teleported to <body> so it covers the whole screen -->
  <Teleport to="body">
    <Transition name="logout-fade">
      <div v-if="showConfirm" class="logout-overlay" @click.self="cancelLogout">
        <div class="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title">
          <h2 id="logout-title">Log out?</h2>
          <p>You'll need to log in again to manage your shop.</p>

          <p v-if="error" class="logout-error">{{ error }}</p>

          <div class="logout-actions">
            <button type="button" class="logout-btn" :disabled="loading" @click="cancelLogout">
              Cancel
            </button>
            <button type="button" class="logout-btn logout-btn--danger" :disabled="loading" @click="confirmLogout">
              {{ loading ? 'Logging out...' : 'Log out' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.profile-menu {
  position: relative;
}

.profile-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #4f46e5;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  cursor: pointer;
}

.dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 230px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #e5e7eb;
  overflow-wrap: anywhere;
}

.muted {
  color: #6b7280;
  font-size: 0.85rem;
}

.item {
  display: block;
  width: 100%;
  padding: 0.65rem 1rem;
  border: none;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.item:hover {
  background: #f3f4f6;
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---------- confirm dialog ---------- */
/* ---------- confirm dialog ---------- */
.logout-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.logout-dialog {
  display: block;
  position: relative;
  opacity: 1;
  visibility: visible;
  width: 100%;
  max-width: 360px;
  background: #fff;
  color: #111827;
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
}

.logout-dialog h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
  color: #111827;
}

.logout-dialog p {
  margin: 0 0 1rem;
  color: #4b5563;
}

.logout-dialog .logout-error {
  color: #dc2626;
}

.logout-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.logout-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #111827;
  font: inherit;
  cursor: pointer;
}

.logout-btn--danger {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}

.logout-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.logout-fade-enter-active,
.logout-fade-leave-active {
  transition: opacity 0.15s;
}

.logout-fade-enter-from,
.logout-fade-leave-to {
  opacity: 0;
}

.theme-setting {
  padding: 0.65rem 1rem;
  border-top: 1px solid var(--sk-border);
  border-bottom: 1px solid var(--sk-border);
}
</style>