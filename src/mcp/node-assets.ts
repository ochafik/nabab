/**
 * Filesystem-backed assets for the Node entries (stdio / HTTP) and tests.
 */
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { findExample, exampleAssetPath } from './examples.js';
import type { McpAssets } from './networks.js';

export function createNodeAssets(): McpAssets {
  const dirname = typeof import.meta.dirname === 'string' ? import.meta.dirname : '.';
  const root = resolve(dirname, '../..');
  const read = async (p: string): Promise<string | null> => {
    try {
      return await readFile(p, 'utf-8');
    } catch {
      return null;
    }
  };
  /** Source locations mirror what scripts/copy-viewer-assets.mjs publishes. */
  const sourcePath = (assetPath: string): string =>
    assetPath.startsWith('/examples/') ? join(root, 'src', assetPath) : join(root, assetPath);
  return {
    async readExample(name) {
      const info = findExample(name);
      return info ? read(sourcePath(exampleAssetPath(info))) : null;
    },
    readMcpAppHtml: () => read(join(root, 'dist/mcp/index.html')),
    readFile: path => read(path),
  };
}
