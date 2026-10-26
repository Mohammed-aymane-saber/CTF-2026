import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend CTFd en développement local (docker compose de CTF/)
const CTFD = 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  server: {
    proxy: {
      // /api-auth/login -> /login ; /api-auth/logout -> /logout
      // (même mapping que Nginx en production)
      '/api-auth': {
        target: CTFD,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-auth/, ''),
      },
      // Regex : seulement /api/..., sinon cette clé intercepterait aussi /api-auth
      '^/api/': { target: CTFD, changeOrigin: true },
      '/files': { target: CTFD, changeOrigin: true },
      '/themes': { target: CTFD, changeOrigin: true },
      '/events': { target: CTFD, changeOrigin: true },
    },
  },
});