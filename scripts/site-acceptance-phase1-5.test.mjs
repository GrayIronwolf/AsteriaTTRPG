import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRIMARY_LINKS, parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { ROUTE_FEATURES, canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { previewServices } from '../frontend/src/services/appServices.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

function recursivelyList(dir) {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? recursivelyList(dir + '/' + entry.name) : [dir + '/' + entry.name]);
}

test('Phase 1 acceptance preserves production entry/build/Firebase isolation', () => {
  const production = read('index.html');
  const next = read('frontend/index.html');
  const siteVite = read('vite.site.config.mjs');
  const oldVite = read('vite.config.mjs');
  const firebase = JSON.parse(read('firebase.json'));

  assert.match(production, /id="home"/);
  assert.match(production, /id="asteriaReactRoot"/);
  assert.match(production, /src="js\/app\.js\?/);
  assert.match(production, /src="src\/dev-entry\.js\?/);
  assert.doesNotMatch(production, /frontend\/src\/main\.jsx|frontend-dist|site:acceptance/);
  assert.match(next, /id="asteria-site-root"/);
  assert.equal((next.match(/<script\b/g) || []).length, 1);
  assert.doesNotMatch(next, /react-dist|js\/app\.js|css\/styles\.css/);

  assert.match(siteVite, /root: resolve\(repositoryRoot, 'frontend'\)/);
  assert.match(siteVite, /outDir: resolve\(repositoryRoot, 'frontend-dist'\)/);
  assert.match(siteVite, /emptyOutDir: true/);
  assert.match(oldVite, /react-dist/);
  assert.doesNotMatch(oldVite, /frontend-dist/);

  assert.equal(firebase.functions[0].codebase, 'asteria');
  assert.equal(firebase.functions[0].runtime, 'nodejs22');
  assert.equal(firebase.firestore.rules, 'firestore.rules');
  assert.equal(firebase.storage.rules, 'storage.rules');
  assert.equal(firebase.hosting, undefined, 'Phase 1 may not change hosting during preview');
});

test('all phase-1 navigation targets resolve without granting unconverted access', () => {
  const previewRoutes = new Set(Object.keys(ROUTE_FEATURES));
  assert.equal(PRIMARY_LINKS.length, 8);
  for (const link of PRIMARY_LINKS) {
    const route = parseSiteRoute({ hash: link.href });
    assert.ok(previewRoutes.has(route.id), link.href);
    assert.equal(route.navId, link.id, link.href);
  }
  for (const id of previewRoutes) {
    assert.equal(canActivateRoute(id, previewServices), id === 'home', id);
  }
  const privateLocations = [
    ['#/join/123456789012', 'invitation'],
    ['#secure-campaign-invite=redacted', 'invitation'],
    ['#/react/gm/private-campaign', 'gm-dashboard'],
    ['#/react/character/campaign/secret-character', 'character-dashboard'],
    ['#/react/owned-character/private-character', 'character-dashboard'],
    ['#/account/profile', 'profile'],
    ['#/account/friends', 'friends']
  ];
  for (const [hash, expected] of privateLocations) {
    const route = parseSiteRoute({ hash });
    assert.equal(route.id, expected);
    assert.notEqual(route.id, 'home');
    assert.equal(canActivateRoute(route.id, previewServices), false);
  }
  assert.equal(parseSiteRoute({ hash: '#/missing-page' }).id, 'not-found');
});

test('the new app is standalone and has no imports of legacy handlers/styles/Firebase singleton', () => {
  const sourceFiles = recursivelyList('frontend/src')
    .filter(p => /\.(?:mjs|js|jsx|css)$/.test(p));
  const src = sourceFiles.map(read).join('\n');
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(stripped, /import\s+['"][^'"]*(?:\/js\/|css\/styles\.css|asteria-page-template\.css)/);
  assert.doesNotMatch(stripped, /window\.(?:setView|AsteriaFirebase|AsteriaState)\b/);
  assert.doesNotMatch(stripped, /https?:\/\/(?:[^"'\s]*firebase|[^"'\s]*googleapis)/i);
  assert.doesNotMatch(stripped, /!\s*important/);
  assert.doesNotMatch(stripped, /@import\b/);
  assert.match(read('frontend/src/router/useSiteRoute.js'), /useSyncExternalStore/);
  assert.match(read('frontend/src/router/locationStore.mjs'), /createDisposableScope/);
  assert.match(read('frontend/src/main.jsx'), /<AppServicesProvider>/);
  const preview = read('frontend/src/pages/RoutePreviewPage.jsx');
  assert.doesNotMatch(preview, /\broute\.(?:params|hash|query)\b/);
  assert.doesNotMatch(preview, /<form\b|<input\b/);
});

test('the Phase 1.5 CI gate executes every phase plus integrated screenshots', () => {
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/site-foundation.yml');
  const script = pkg.scripts;
  for (const phase of [
    'site-foundation-phase1-1.test.mjs',
    'site-routing-phase1-2.test.mjs',
    'site-design-phase1-3.test.mjs',
    'site-js-phase1-4.test.mjs',
    'site-acceptance-phase1-5.test.mjs'
  ]) assert.ok(script['site:check'].includes(phase), phase);
  for (const command of [
    'site:browser', 'site:routing-browser', 'site:design-browser',
    'site:js-browser', 'site:acceptance'
  ]) assert.ok(workflow.includes('npm run ' + command), command);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /npm run site:verify-dist/);
  assert.match(workflow, /npx eslint frontend\/src/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(read('.gitignore'), /phase-1-5-evidence\//);
});
