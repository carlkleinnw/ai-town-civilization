import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { runtimeService } from './scripts/runtime-service.mjs';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/ai-town',
  cacheDir: '.runtime/vite-cache',
  plugins: [react(), runtimeService(process.cwd())],
  server: {
    allowedHosts: ['ai-town-your-app-name.fly.dev', 'localhost', '127.0.0.1'],
    watch: {
      // Native Windows file locks can make watching build output fail with EBUSY.
      ignored: ['**/dist/**', '**/.convex/**', '**/.runtime/**'],
    },
  },
});
