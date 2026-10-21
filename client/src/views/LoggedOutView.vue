<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="logged-out">
    <div class="card">
      <div class="check">✓</div>
      <h1>You've been logged out</h1>
      <p>Thanks for stopping by. See you next time!</p>
      <button type="button" @click="router.push('/login')">Log in again</button>
    </div>
  </div>
</template>

<style scoped>
.logged-out {
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card { text-align: center; max-width: 360px; }
.check {
  width: 56px; height: 56px; margin: 0 auto 1rem;
  border-radius: 50%;
  background: #dcfce7; color: #16a34a;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.75rem;
}
h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
p { margin: 0 0 1.25rem; color: #6b7280; }
button {
  padding: 0.6rem 1.25rem; border: none; border-radius: 6px;
  background: #4f46e5; color: #fff; font: inherit; cursor: pointer;
}
</style>