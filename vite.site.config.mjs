import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const weaponReferencePath = 'tools/weapon-crafting.html';
const weaponReferenceSource = resolve(repositoryRoot, weaponReferencePath);

const standaloneWeaponReference = {
  name: 'asteria-standalone-weapon-reference',
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0] !== '/' + weaponReferencePath ||
          (request.method !== 'GET' && request.method !== 'HEAD')) return next();
      const source = readFileSync(weaponReferenceSource);
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': source.length
      });
      response.end(request.method === 'HEAD' ? undefined : source);
    });
  },
  generateBundle() {
    this.addWatchFile(weaponReferenceSource);
    this.emitFile({
      type: 'asset', fileName: weaponReferencePath, source: readFileSync(weaponReferenceSource)
    });
  }
};

// Separate pre-cutover build: the production root index.html and legacy
// react-dist build are deliberately unaffected until the final migration.
export default defineConfig({
  root: resolve(repositoryRoot, 'frontend'),
  base: './',
  publicDir: false,
  plugins: [standaloneWeaponReference],
  resolve: {
    dedupe: ['react', 'react-dom'],
    // For the isolated modern preview only: replace all imports of the
    // historical UMD adapter before it executes. Legacy build remains untouched.
    alias: [{find:/^.*marketPricing\.mjs$/,replacement:resolve(repositoryRoot,'src/systems/items/marketPricingCore.generated.mjs')}]
  },
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
