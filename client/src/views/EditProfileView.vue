<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
const loading = ref(!user.value)
const loadError = ref('')

// each section has its own state, so saving one never affects the others
const shopForm = reactive({ value: '', saving: false, message: '', error: '' })
const emailForm = reactive({ value: '', saving: false, message: '', error: '' })
const pwForm = reactive({
  current: '', next: '', confirm: '',
  saving: false, message: '', error: '',
})

function saveLocal(u) {
  user.value = u
  localStorage.setItem('user', JSON.stringify(u))
}

function fillForms(u) {
  shopForm.value = u.shopName || ''
  emailForm.value = u.email || ''
}

function clearMessages(form) {
  form.message = ''
  form.error = ''
}

function errorText(err, fallback) {
  if (err.response) return err.response.data?.message || fallback
  return 'Could not reach the server. Check your connection.'
}

async function loadProfile() {
  if (user.value) fillForms(user.value) // cached copy shows instantly
  try {
    const { data } = await axios.get('/api/auth/me')
    saveLocal(data)
    fillForms(data)
  } catch (err) {
    if (err.response?.status === 401) {
      localStorage.removeItem('user')
      return router.replace('/login')
    }
    if (!user.value) loadError.value = errorText(err, 'Could not load profile.')
  } finally {
    loading.value = false
  }
}

async function updateShopName() {
  clearMessages(shopForm)
  shopForm.saving = true
  try {
    const { data } = await axios.patch('/api/auth/me/shop-name', { shopName: shopForm.value })
    saveLocal(data)
    shopForm.message = 'Shop name updated!'
  } catch (err) {
    shopForm.error = errorText(err, 'Could not update shop name.')
  } finally {
    shopForm.saving = false
  }
}

async function updateEmail() {
  clearMessages(emailForm)
  emailForm.saving = true
  try {
    const { data } = await axios.patch('/api/auth/me/email', { email: emailForm.value })
    saveLocal(data)
    emailForm.message = 'Email updated!'
  } catch (err) {
    emailForm.error = errorText(err, 'Could not update email.')
  } finally {
    emailForm.saving = false
  }
}

async function updatePassword() {
  clearMessages(pwForm)
  if (pwForm.next !== pwForm.confirm) {
    pwForm.error = 'New passwords do not match.'
    return
  }
  pwForm.saving = true
  try {
    await axios.patch('/api/auth/me/password', {
      currentPassword: pwForm.current,
      newPassword: pwForm.next,
    })
    pwForm.message = 'Password updated!'
    pwForm.current = pwForm.next = pwForm.confirm = ''
  } catch (err) {
    pwForm.error = errorText(err, 'Could not update password.')
  } finally {
    pwForm.saving = false
  }
}

const delForm = reactive({ open: false, password: '', saving: false, error: '' })

function openDelete() {
  delForm.password = ''
  delForm.error = ''
  delForm.open = true
}

function closeDelete() {
  if (delForm.saving) return
  delForm.open = false
}

async function deleteAccount() {
  delForm.error = ''
  delForm.saving = true
  try {
    await axios.delete('/api/auth/me', { data: { password: delForm.password } })
    localStorage.removeItem('user')
    router.replace('/account-deleted')
  } catch (err) {
    delForm.error = errorText(err, 'Could not delete account.')
  } finally {
    delForm.saving = false
  }
}

onMounted(loadProfile)

</script>

<template>
  <RouterLink to="/profile" class="pv-back">← Back to profile</RouterLink>

  <div class="pv-page">
    <p v-if="loading">Loading...</p>

    <template v-else-if="user">
      <div class="pv-header">
        <div class="pv-avatar">{{ user.username?.[0]?.toUpperCase() }}</div>
        <div>
          <h1>{{ user.shopName || user.username }}</h1>
          <p class="pv-muted">@{{ user.username }}</p>
          <p v-if="user.createdAt" class="pv-muted">
            Member since {{ new Date(user.createdAt).toLocaleDateString() }}
          </p>
        </div>
      </div>

      <!-- Shop name -->
      <section class="pv-card">
        <h2>Shop name</h2>
        <form @submit.prevent="updateShopName">
          <input v-model="shopForm.value" type="text" required />
          <button type="submit" class="pv-btn" :disabled="shopForm.saving">
            {{ shopForm.saving ? 'Saving...' : 'Update shop name' }}
          </button>
        </form>
        <p v-if="shopForm.message" class="pv-success">{{ shopForm.message }}</p>
        <p v-if="shopForm.error" class="pv-error">{{ shopForm.error }}</p>
      </section>

      <!-- Email -->
      <section class="pv-card">
        <h2>Email</h2>
        <form @submit.prevent="updateEmail">
          <input v-model="emailForm.value" type="email" required />
          <button type="submit" class="pv-btn" :disabled="emailForm.saving">
            {{ emailForm.saving ? 'Saving...' : 'Update email' }}
          </button>
        </form>
        <p v-if="emailForm.message" class="pv-success">{{ emailForm.message }}</p>
        <p v-if="emailForm.error" class="pv-error">{{ emailForm.error }}</p>
      </section>

      <!-- Password -->
      <section class="pv-card">
        <h2>Password</h2>
        <form @submit.prevent="updatePassword">
          <label>
            Current password
            <input v-model="pwForm.current" type="password" autocomplete="current-password" required />
          </label>
          <label>
            New password
            <input v-model="pwForm.next" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <label>
            Confirm new password
            <input v-model="pwForm.confirm" type="password" autocomplete="new-password" minlength="8" required />
          </label>
          <button type="submit" class="pv-btn" :disabled="pwForm.saving">
            {{ pwForm.saving ? 'Saving...' : 'Change password' }}
          </button>
        </form>
        <p v-if="pwForm.message" class="pv-success">{{ pwForm.message }}</p>
        <p v-if="pwForm.error" class="pv-error">{{ pwForm.error }}</p>
      </section>
    </template>

    <p v-else class="pv-error">{{ loadError }}</p>

    <section class="pv-card pv-danger">
      <h2>Delete account</h2>
      <p class="pv-muted">
        This permanently deletes your account, products, materials, recipes and orders.
        It can't be undone.
      </p>
      <button type="button" class="pv-btn pv-btn--danger" @click="openDelete">
        Delete account
      </button>
    </section>

    <Teleport to="body">
      <div v-if="delForm.open" class="pv-overlay" @click.self="closeDelete">
        <form class="pv-dialog" @submit.prevent="deleteAccount">
          <h2>Delete your account?</h2>
          <p>Enter your password to confirm.</p>

          <input v-model="delForm.password" type="password" autocomplete="current-password" placeholder="Password"
            required />

          <p v-if="delForm.error" class="pv-error">{{ delForm.error }}</p>

          <div class="pv-actions">
            <button type="button" class="pv-btn pv-btn--ghost" :disabled="delForm.saving" @click="closeDelete">
              Cancel
            </button>
            <button type="submit" class="pv-btn pv-btn--danger" :disabled="delForm.saving">
              {{ delForm.saving ? 'Deleting...' : 'Delete forever' }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>

  </div>
</template>

<style scoped>
.pv-page {
  max-width: 480px;
  margin: 0 auto;
}

.pv-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.pv-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #4f46e5;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

.pv-header h1 {
  margin: 0;
  font-size: 1.4rem;
  overflow-wrap: anywhere;
}

.pv-muted {
  margin: 0;
  color: #6b7280;
  font-size: 0.9rem;
}

.pv-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: #fff;
}

.pv-card h2 {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}

.pv-card label {
  display: block;
  margin-bottom: 0.75rem;
  font-weight: 500;
}

.pv-card input {
  display: block;
  width: 100%;
  padding: 0.5rem;
  margin: 0.25rem 0 0.75rem;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font: inherit;
}

.pv-card label input {
  margin-bottom: 0;
}

.pv-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  background: #4f46e5;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.pv-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pv-success {
  color: #16a34a;
  margin: 0.5rem 0 0;
}

.pv-error {
  color: #dc2626;
  margin: 0.5rem 0 0;
}

.pv-danger { border-color: #fecaca; }
.pv-btn--danger { background: #dc2626; }
.pv-btn--ghost { background: #fff; color: #111827; border: 1px solid #d1d5db; }

.pv-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}
.pv-dialog {
  width: 100%; max-width: 360px;
  background: #fff; color: #111827;
  border-radius: 12px; padding: 1.25rem;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
}
.pv-dialog h2 { margin: 0 0 0.5rem; font-size: 1.15rem; }
.pv-dialog p { margin: 0 0 0.75rem; color: #4b5563; }
.pv-dialog input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 0.5rem; margin-bottom: 0.75rem;
  border: 1px solid #d1d5db; border-radius: 6px; font: inherit;
}
.pv-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }

</style>