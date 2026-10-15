import http from 'node:http'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000', // 127.0.0.1 avoids localhost resolving to IPv6
        changeOrigin: true,
        agent: new http.Agent({ keepAlive: false }), // new connection per request
      },
    },
  },
})
