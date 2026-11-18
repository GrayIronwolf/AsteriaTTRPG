import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(fileURLToPath(import.meta.url));

// Separate pre-cutover build: the production root index.html and legacy
// react-dist build are deliberately unaffected until the final migration.
export default defineConfig({
  root: resolve(repositoryRoot, 'frontend'),
  base: './',
  publicDir: false,
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: [repositoryRoot] }
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true
  },
  build: {
    outDir: resolve(repositoryRoot, 'frontend-dist'),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    target: 'es2022'
  }
});
