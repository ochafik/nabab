import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'src/mcp',
  plugins: [viteSingleFile()],
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'src/mcp/mcp-app.html'),
    },
    outDir: resolve(__dirname, 'dist/mcp'),
    emptyOutDir: true,
  },
});
