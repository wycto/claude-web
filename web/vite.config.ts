import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Dev backend runs on 8788 (see root `npm run dev`), separate from the
// production server so the stable instance isn't disturbed.
const target = process.env.CLAUDE_WEB_BACKEND || 'http://localhost:8788';

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, // expose on LAN so other home computers can view the dev build
    port: 11602,
    strictPort: true,
    proxy: {
      '/api': { target, changeOrigin: true },
      '/ws': { target, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
