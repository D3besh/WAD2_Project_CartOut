<!-- <script setup>
// TODO: email and password form. On success, go to Home.
// Show the error from the API if login fails.
</script>

<template>
  <section data-testid="page-login">
    <h1>Log in</h1>
    <!-- TODO: build this page -->
  <!-- </section>
</template> --> 


<script setup>

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import '../assets/auth.css';

const router = useRouter();

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const rememberMe = ref(false);

async function onSubmit() {
  error.value = '';

  if (!username.value.trim() || !password.value) {
    error.value = 'Enter your username and password.';
    return;
  }

  loading.value = true;

  try {
    const response = await axios.post('/api/auth/login', {
      username: username.value.trim(),
      password: password.value,
      rememberMe: rememberMe.value,
    });

    router.push('/');

  } catch (err) {
    error.value =
      err.response?.data?.message ||
      'Login failed. Try again.';
  } finally {
    loading.value = false;
  }
}

</script>



<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="onSubmit" novalidate>
      <h1>Log in</h1>
      <p class="sub">Welcome back. Enter your details to manage your shop.</p>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>

      <div class="field">
        <label for="username">Username</label>
        <input id="username" v-model="username" type="text" autocomplete="username" />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" />
      </div>

      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? 'Logging in...' : 'Log in' }}
      </button>

      <div class="field mt-2 text-center">
        <label>
          <input type="checkbox" v-model="rememberMe" />
          Keep me logged in on this device for 7 days
        </label>
      </div>

      <p class="switch">
        No account yet? <router-link to="/register">Create one</router-link>
      </p>
    </form>
  </main>
</template>