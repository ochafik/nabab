import { defineConfig } from 'vite';
import { resolve } from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  define: { __MCP_APP__: true },
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
    outDir: resolve(__dirname, 'dist/mcp'),
    emptyOutDir: true,
  },
});
