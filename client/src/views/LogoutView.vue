<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import '../assets/auth.css';

const router = useRouter();

const loading = ref(false);
const loggedOut = ref(false);
const error = ref('');

async function onLogout() {
  error.value = '';
  loading.value = true;
  try {
    await axios.post('/api/auth/logout');
    loggedOut.value = true;
  } catch (err) {
    if (err.response) {
      // the server answered with an error status
      error.value = err.response.data?.message || 'Could not log you out. Try again.';
    } else {
      // no response at all: server down or network problem
      error.value = 'Could not reach the server. Check your connection.';
    }
  } finally {
    loading.value = false;
  }
}

function onCancel() {
  router.back(); // or router.push('/dashboard')
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-card">
      <template v-if="!loggedOut">
        <h1>Log out</h1>
        <p class="sub">You will need to log in again to manage your shop.</p>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <button class="btn" type="button" :disabled="loading" @click="onLogout">
          {{ loading ? 'Logging out...' : 'Log out' }}
        </button>

        <p class="switch">
          <a href="#" @click.prevent="onCancel">Stay logged in</a>
        </p>
      </template>

      <template v-else>
        <h1>You're logged out</h1>
        <p class="sub">Your session has ended.</p>
        <router-link class="btn" to="/login" style="display: block; text-align: center; text-decoration: none">
          Log in again
        </router-link>
      </template>
    </section>
  </main>
</template>