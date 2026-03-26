import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist/viewer',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
