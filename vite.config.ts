import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  define: { __MCP_APP__: false },
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
