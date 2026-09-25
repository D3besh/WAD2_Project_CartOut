import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // During development, send /api requests to the Express server
    proxy: { '/api': 'http://localhost:3000' },
  },
});
