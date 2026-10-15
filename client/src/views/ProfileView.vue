<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()

const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
const loading = ref(!user.value)
const error = ref('')


async function loadProfile() {
  try {
    const { data } = await axios.get('/api/auth/me')
    user.value = data
    localStorage.setItem('user', JSON.stringify(data))
  } catch (err) {
    if (err.response?.status === 401) {
      localStorage.removeItem('user')
      return router.replace('/login')
    }
    if (!user.value) {
      error.value = err.response
        ? err.response.data?.message || 'Could not load profile.'
        : 'Could not reach the server. Check your connection.'
    }
  } finally {
    loading.value = false
  }
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'long' }) : '-'
}

onMounted(loadProfile)

</script>

<template>
  <div class="vp-page">
    <p v-if="loading">Loading...</p>

    <template v-else-if="user">
      <div class="vp-header">
        <div class="vp-avatar">{{ user.username?.[0]?.toUpperCase() }}</div>
        <div>
          <h1>{{ user.shopName || user.username }}</h1>
          <p class="vp-muted">@{{ user.username }}</p>
        </div>
      </div>

      <section class="vp-card">
        <h2>Account details</h2>
        <dl>
          <div class="vp-row">
            <dt>Shop name</dt>
            <dd>{{ user.shopName || '-' }}</dd>
          </div>
          <div class="vp-row">
            <dt>Username</dt>
            <dd>{{ user.username }}</dd>
          </div>
          <div class="vp-row">
            <dt>Email</dt>
            <dd>{{ user.email || '-' }}</dd>
          </div>
          <div class="vp-row">
            <dt>Member since</dt>
            <dd>{{ formatDate(user.createdAt) }}</dd>
          </div>
        </dl>
      </section>

      <RouterLink to="/profile/edit" class="vp-btn">Edit profile</RouterLink>&nbsp;

    </template>

    <p v-else class="vp-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.vp-page { max-width: 480px; margin: 0 auto; }

.vp-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
.vp-avatar {
  width: 72px; height: 72px; border-radius: 50%;
  background: #4f46e5; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 2rem; font-weight: 600;
  flex-shrink: 0;
}
.vp-header h1 { margin: 0; font-size: 1.5rem; overflow-wrap: anywhere; }
.vp-muted { margin: 0; color: #6b7280; }

.vp-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: #fff;
}
.vp-card h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
.vp-card dl { margin: 0; }

.vp-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0;
  border-top: 1px solid #f3f4f6;
}
.vp-row:first-child { border-top: none; }
.vp-row dt { color: #6b7280; }
.vp-row dd { margin: 0; text-align: right; overflow-wrap: anywhere; }


.vp-btn {
  display: inline-block;
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  background: #4f46e5;
  color: #fff;
  text-decoration: none;

  /* Reset default browser styles */
  border: none;
  font: inherit;
  cursor: pointer;
  box-sizing: border-box;
}

.vp-error { color: #dc2626; }
</style>