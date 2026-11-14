import { defineConfig } from 'vite';
export default defineConfig({
  root: 'web',
  publicDir: '../data',
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
});
