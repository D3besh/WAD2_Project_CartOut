import { createApp } from 'vue';
import 'bootstrap/dist/css/bootstrap.min.css';
import './assets/main.css';
import App from './App.vue';
import router from './router';
import './assets/home.css';


const savedMode =
  localStorage.getItem('cartoutMode') === 'dark'
    ? 'dark'
    : 'light'

document.documentElement.classList.remove(
  'light-mode',
  'dark-mode'
)

document.documentElement.classList.add(savedMode + '-mode')


createApp(App).use(router).mount('#app');
