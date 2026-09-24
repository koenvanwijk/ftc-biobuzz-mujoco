import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: process.env.VITE_BASE || '/',
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@mujoco/mujoco'],
  },
  assetsInclude: ['**/*.wasm', '**/*.blk'],
  build: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  worker: {
    format: 'es',
  },
});
