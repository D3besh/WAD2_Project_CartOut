<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="ad-page">
    <div class="ad-card">
      <div class="ad-icon">✓</div>
      <h1>Your account has been deleted</h1>
      <p>Your profile and all your shop data have been permanently removed.</p>
      <div class="ad-actions">
        <button type="button" class="ad-btn" @click="router.push('/register')">
          Create a new account
        </button>
        <button type="button" class="ad-btn ad-btn--ghost" @click="router.push('/login')">
          Back to login
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ad-page {
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ad-card { text-align: center; max-width: 380px; }
.ad-icon {
  width: 56px; height: 56px; margin: 0 auto 1rem;
  border-radius: 50%;
  background: #dcfce7; color: #16a34a;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.75rem;
}
.ad-card h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
.ad-card p { margin: 0 0 1.25rem; color: #6b7280; }
.ad-actions { display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; }
.ad-btn {
  padding: 0.6rem 1.25rem;
  border: 1px solid #4f46e5;
  border-radius: 6px;
  background: #4f46e5;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.ad-btn--ghost { background: #fff; color: #4f46e5; }
</style>