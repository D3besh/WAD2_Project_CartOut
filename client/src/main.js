import { createApp } from 'vue';
import 'bootstrap/dist/css/bootstrap.min.css';
import './assets/main.css';
import App from './App.vue';
import router from './router';
import './assets/home.css';

createApp(App).use(router).mount('#app');
