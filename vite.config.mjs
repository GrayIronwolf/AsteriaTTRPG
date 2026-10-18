import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  appType: 'spa',
  // The legacy page loads this bundle from /react-dist/, not the site root.
  // Resolve lazy chunk/CSS preloads against their importing module's URL.
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    outDir: 'react-dist',
    // Keep the previous stable chunks for clients with the old cached entry.
    // Versioned chunks stay available while cached clients finish their sessions.
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(process.cwd(), 'src/main.jsx'),
      output: {
        entryFileNames: 'asteria-react.js',
        chunkFileNames: 'asteria-react-[name]-[hash].js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'asteria-react.css' : 'assets/[name]-[hash][extname]'
      }
    }
  }
});
