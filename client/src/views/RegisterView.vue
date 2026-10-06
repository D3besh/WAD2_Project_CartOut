<!-- <script setup>
// TODO: shop name, email and password form. On success, go to Home.
</script>

<template>
  <section data-testid="page-register">
    <h1>Create your shop</h1>
    <!-- TODO: build this page -->
  <!-- </section>
</template> --> 


<script setup>

import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import '../assets/auth.css';

const router = useRouter();

const form = reactive({
  username: '',
  email: '',
  shopName: '',
  password: '',
  confirm: '',
});

const errors = reactive({});
const serverError = ref('');
const loading = ref(false);

const emailRegex = /^\S+@\S+\.\S+$/;

function validate() {
  Object.keys(errors).forEach((k) => delete errors[k]);

  const username = form.username.trim();

  if (username.length < 3 || username.length > 20) {
    errors.username = 'Username must be 3 to 20 characters.';
  }

  if (!emailRegex.test(form.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!form.shopName.trim()) {
    errors.shopName = 'Enter your shop name.';
  }

  if (form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }

  if (form.confirm !== form.password) {
    errors.confirm = 'Passwords do not match.';
  }

  return Object.keys(errors).length === 0;
}

async function onSubmit() {
  serverError.value = '';

  if (!validate()) return;

  loading.value = true;

  try {
    const response = await axios.post('/api/auth/register', {
      username: form.username.trim(),
      email: form.email.trim(),
      shopName: form.shopName.trim(),
      password: form.password
    });

    router.push('/login');

  } catch (error) {
    serverError.value =
      error.response?.data?.message ||
      'Could not create your account.';
  } finally {
    loading.value = false;
  }
}

</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="onSubmit" novalidate>
      <h1>Create your account</h1>
      <p class="sub">Set up your shop in a minute.</p>

      <p v-if="serverError" class="form-error" role="alert">{{ serverError }}</p>

      <div class="field" :class="{ invalid: errors.username }">
        <label for="username">Username</label>
        <input id="username" v-model="form.username" type="text" autocomplete="username" />
        <p v-if="errors.username" class="msg">{{ errors.username }}</p>
      </div>

      <div class="field" :class="{ invalid: errors.email }">
        <label for="email">Email</label>
        <input id="email" v-model="form.email" type="email" autocomplete="email" />
        <p v-if="errors.email" class="msg">{{ errors.email }}</p>
      </div>

      <div class="field" :class="{ invalid: errors.shopName }">
        <label for="shopName">Shop name</label>
        <input id="shopName" v-model="form.shopName" type="text" autocomplete="organization" />
        <p v-if="errors.shopName" class="msg">{{ errors.shopName }}</p>
      </div>

      <div class="field" :class="{ invalid: errors.password }">
        <label for="password">Password</label>
        <input id="password" v-model="form.password" type="password" autocomplete="new-password" />
        <p v-if="errors.password" class="msg">{{ errors.password }}</p>
      </div>

      <div class="field" :class="{ invalid: errors.confirm }">
        <label for="confirm">Confirm password</label>
        <input id="confirm" v-model="form.confirm" type="password" autocomplete="new-password" />
        <p v-if="errors.confirm" class="msg">{{ errors.confirm }}</p>
      </div>

      <button class="btn" type="submit" :disabled="loading">
        {{ loading ? 'Creating account...' : 'Create account' }}
      </button>

      <p class="switch">
        Already registered? <router-link to="/login">Log in</router-link>
      </p>
    </form>
  </main>
</template>