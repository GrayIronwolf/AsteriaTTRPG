import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  appType: 'spa',
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    outDir: 'react-dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(process.cwd(), 'src/main.jsx'),
      output: {
        entryFileNames: 'asteria-react.js',
        chunkFileNames: 'asteria-react-[name].js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'asteria-react.css' : 'assets/[name]-[hash][extname]'
      }
    }
  }
});
