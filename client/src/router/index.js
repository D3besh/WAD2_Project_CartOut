import { createRouter, createWebHistory } from 'vue-router';

import LoginView from '../views/LoginView.vue';
import RegisterView from '../views/RegisterView.vue';
import HomeView from '../views/HomeView.vue';
import LogOrderView from '../views/LogOrderView.vue';
import OrderLogView from '../views/OrderLogView.vue';
import OrderDetailView from '../views/OrderDetailView.vue';
import MaterialsView from '../views/MaterialsView.vue';
import ProductsView from '../views/ProductsView.vue';
import NotFoundView from '../views/NotFoundView.vue';

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/register', name: 'register', component: RegisterView, meta: { public: true } },
  { path: '/', name: 'home', component: HomeView },
  { path: '/orders/new', name: 'log-order', component: LogOrderView },
  { path: '/orders', name: 'order-log', component: OrderLogView },
  { path: '/orders/:id', name: 'order-detail', component: OrderDetailView, props: true },
  { path: '/materials', name: 'materials', component: MaterialsView },
  { path: '/products', name: 'products', component: ProductsView },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView, meta: { public: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// TODO: redirect logged-out users to /login.
// Call GET /api/auth/me (see services/auth.js); if it returns 401 and the
// route isn't public, return { name: 'login' }.
router.beforeEach(async (/* to */) => {
  return true;
});

export default router;
