import { createRouter, createWebHistory } from 'vue-router';

import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import HomeView from '../views/HomeView.vue';
import LogOrderView from '../views/LogOrderView.vue';
import OrderLogView from '../views/OrderLogView.vue';
import OrderDetailView from '../views/OrderDetailView.vue';
import MaterialsView from '../views/MaterialsView.vue';
import ProductsView from '../views/ProductsView.vue';
import ForecastView from '../views/ForecastView.vue';   
import NotFoundView from '../views/NotFoundView.vue';
import LoggedOutView from '../views/LoggedOutView.vue';
import ProfileView from '../views/ProfileView.vue';
import EditProfileView from '../views/EditProfileView.vue';
import DeletedProfileView from '../views/DeletedProfileView.vue';


const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/register', name: 'register', component: RegisterView, meta: { public: true } },
  { path: '/logged-out', name: 'logged-out', component: LoggedOutView, meta: { public: true } },
  { path: '/profile', name: 'profile', component: ProfileView },
  { path: '/profile/edit', name: 'profile-edit', component: EditProfileView },
  { path: '/account-deleted', name: 'account-deleted', component: DeletedProfileView, meta: { public: true } },
  { path: '/', name: 'home', component: HomeView },
  { path: '/orders/new', name: 'log-order', component: LogOrderView },
  { path: '/orders', name: 'order-log', component: OrderLogView },
  { path: '/orders/:id', name: 'order-detail', component: OrderDetailView, props: true },
  { path: '/materials', name: 'materials', component: MaterialsView },
  { path: '/products', name: 'products', component: ProductsView },
  { path: '/forecast', name: 'forecast', component: ForecastView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { public: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// TODO: redirect logged-out users to /login.
// Call GET /api/auth/me (see services/auth.js); if it returns 401 and the
// route isn't public, return { name: 'login' }.

import axios from 'axios';

router.beforeEach(async (to) => {
  if (to.meta.public) return true;

  try {
    await axios.get('/api/auth/me');   // 200: logged in
    return true;
  } catch (err) {
    if (err.response?.status === 401) return { name: 'login' };
    throw err;
  }
});

export default router;
