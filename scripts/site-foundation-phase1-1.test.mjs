import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('Phase 1.1 is a standalone HTML + React entry, not a legacy overlay', () => {
  const html = read('frontend/index.html');
  const oldHtml = read('index.html');
  const main = read('frontend/src/main.jsx');

  assert.match(html, /<div id="asteria-site-root"><\/div>/);
  assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/);
  assert.equal((html.match(/<script\b/g) || []).length, 1);
  assert.equal((html.match(/<link\b[^>]*stylesheet/g) || []).length, 0);
  assert.doesNotMatch(html, /react-dist|js\/app\.js|css\/styles\.css|asteria-page-template/);
  assert.match(main, /createRoot\(host\)\.render/);
  assert.match(main, /<React\.StrictMode>/);
  assert.match(main, /import \{ App \} from '\.\/app\/App\.jsx'/);

  // The unconverted, deployed entry remains untouched by this phase.
  assert.match(oldHtml, /<script[^>]+src="js\/app\.js\?/);
  assert.match(oldHtml, /id="asteriaReactRoot"/);
  assert.doesNotMatch(oldHtml, /src="\/src\/main\.jsx"/);
});

test('React shell has real, accessible Home navigation and only explicitly previewed destinations', () => {
  const shell = read('frontend/src/components/SiteShell.jsx');
  const home = read('frontend/src/pages/HomePage.jsx');
  assert.match(shell, /<header/);
  assert.match(shell, /<nav[^>]*aria-label="Primary navigation"/);
  assert.match(shell, /href="#home"/);
  assert.match(shell, /href="#site-main"/);
  assert.match(shell, /<main/);
  assert.match(home, /<Heading id="site-home-title" hero>Asteria<\/Heading>/);
  assert.match(home, /Phase 1\.3 design-system preview/);
  assert.ok(existsSync(resolve(root, 'assets/header/asteria-wordmark.png')));
  assert.ok(existsSync(resolve(root, 'assets/home/asteria-home-spider.webp')));
});

test('No legacy DOM event owners or global CSS patches are imported', () => {
  const files = [
    'frontend/src/main.jsx',
    'frontend/src/app/App.jsx',
    'frontend/src/components/SiteShell.jsx',
    'frontend/src/pages/HomePage.jsx',
    'frontend/src/styles/tokens.css',
    'frontend/src/styles/reset.css',
    'frontend/src/styles/typography.css'
  ];
  for(const name of files) {
    const content = read(name).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(content, /window\.(?:setView|AsteriaRouter|AsteriaReactMigration)/, name);
    assert.doesNotMatch(content, /\b(?:js\/app\.js|css\/styles\.css|asteria-page-template\.css)\b(?![^\n]*comment)/, name);
  }
  const css = ['tokens.css', 'reset.css', 'typography.css']
    .map(name => read('frontend/src/styles/' + name)).join('\n');
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /!important/);
  assert.doesNotMatch(css, /@import\s+url|@import\s+['"]/);
});

test('Preview build is isolated and has explicit CI checks', () => {
  const vite = read('vite.site.config.mjs');
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/site-foundation.yml');
  assert.match(vite, /root: resolve\(repositoryRoot, 'frontend'\)/);
  assert.match(vite, /outDir: resolve\(repositoryRoot, 'frontend-dist'\)/);
  assert.match(vite, /emptyOutDir: true/);
  assert.match(vite, /manifest: true/);
  assert.match(read('.gitignore'), /frontend-dist\//);
  assert.match(pkg.scripts['site:build'], /vite build --config vite\.site\.config\.mjs/);
  assert.match(pkg.scripts['site:check'], /site-foundation-phase1-1\.test\.mjs/);
  assert.match(workflow, /npm run site:build/);
  assert.match(workflow, /npm run site:browser/);
  assert.match(workflow, /npm run site:verify-dist/);
});
