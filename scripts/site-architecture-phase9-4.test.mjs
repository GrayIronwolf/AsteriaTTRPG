/**
 * Phase 9.4: prove the standalone React/Vite dependency graph is resolvable
 * while protecting the currently deployed legacy entry and cached bundles.
 * Audit only; do not modify production HTML, CSS, JS or Firebase configuration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PRIMARY_LINKS, parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { ROUTE_FEATURES } from '../frontend/src/app/featureRegistry.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const exists = path => existsSync(resolve(root, path));
const posix = path => path.replaceAll('\\', '/');
const fileList = path => readdirSync(resolve(root, path), { withFileTypes: true })
  .flatMap(entry => entry.isDirectory()
    ? fileList(join(path, entry.name))
    : [posix(join(path, entry.name))]);
const sourceFiles = fileList('frontend/src');
const codeFiles = sourceFiles.filter(path => /\.(?:js|jsx|mjs)$/.test(path));
const styleFiles = sourceFiles.filter(path => path.endsWith('.css'));
const globalStyles = [
  'frontend/src/styles/tokens.css',
  'frontend/src/styles/reset.css',
  'frontend/src/styles/typography.css'
];
const deprecated = new Set([
  'css/asteria-page-template.css', 'js/asteria-page-template.js',
  'react-dist/asteria-react.js.map',
  'react-dist/asteria-react-GMDashboard.js.map',
  'react-dist/asteria-react-CharacterDashboard.js.map',
  'react-dist/asteria-react-questRewardModel.js.map'
]);

function sourceImports(source) {
  // Match string-literal ESM imports, reexports and dynamic imports.
  // Vite's import.meta.glob declarations are audited separately below.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const values = new Set();
  for (const pattern of [
    /\bfrom\s*(['"])([^'"\r\n]+)\1/g,
    /\bimport\s*(['"])([^'"\r\n]+)\1/g,
    /\bimport\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g
  ]) {
    for (const match of code.matchAll(pattern)) values.add(match[2]);
  }
  return [...values];
}

function resolveImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null;
  const path = specifier.split(/[?#]/)[0];
  const target = resolve(root, dirname(importer), path);
  assert.ok(target.startsWith(root + sep), importer + ' escapes the repository: ' + specifier);
  const candidates = [
    target, target + '.js', target + '.jsx', target + '.mjs',
    target + '.json', target + '.css',
    join(target, 'index.js'), join(target, 'index.jsx'), join(target, 'index.mjs')
  ];
  const found = candidates.find(path => existsSync(path) && statSync(path).isFile());
  assert.ok(found, importer + ' imports missing file ' + specifier);
  return posix(relative(root, found));
}

function scanGraph() {
  // Starting at the React entry also follows the shared, pure rules in src/.
  // Those rules are not duplicated, and must not reintroduce an old controller.
  const queue = ['frontend/src/main.jsx'];
  const visited = new Set();
  const edges = [];
  const globals = new Set();
  const forbidden = new Set([
    'src/main.jsx', 'src/dev-entry.js', 'src/app/legacyBridge.js',
    'src/app/asteriaRoutes.mjs', 'js/app.js', 'js/auth-bridge.js'
  ]);

  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of sourceImports(read(file))) {
      const dependency = resolveImport(file, specifier);
      if (!dependency) continue;
      edges.push({ from: file, to: dependency });
      assert.ok(!deprecated.has(dependency), 'Retired asset imported: ' + dependency);
      assert.ok(!forbidden.has(dependency), 'React imports old runtime/controller: ' + file + ' -> ' + dependency);
      assert.ok(!dependency.startsWith('css/'),
        'React imports the legacy global CSS cascade: ' + file + ' -> ' + dependency);
      if (dependency.startsWith('js/')) {
        // A single historical canonical pricing rule is shared by the pure
        // liveWorkspaceModel; its UMD global side-effect is a Phase 10 blocker,
        // not a second pricing implementation. Forbid every other legacy JS.
        assert.equal(file, 'src/systems/items/marketPricing.mjs',
          'Unexpected transitive legacy script import: ' + file);
        assert.equal(dependency, 'js/asteria-market-pricing.js');
        globals.add(dependency);
      }
      if (/\.(?:js|jsx|mjs)$/.test(dependency)) queue.push(dependency);
    }
  }

  const directImported = new Set();
  const allImports = [];
  for (const file of codeFiles) {
    for (const specifier of sourceImports(read(file))) {
      const dependency = resolveImport(file, specifier);
      if (!dependency) continue;
      allImports.push({ from: file, to: dependency });
      directImported.add(dependency);
      assert.ok(!dependency.startsWith('js/') && !dependency.startsWith('css/') &&
        !dependency.startsWith('react-dist/'),
        'New frontend directly imports legacy runtime: ' + file + ' -> ' + dependency);
    }
  }
  const unreachable = codeFiles.filter(path => !visited.has(path)).sort();
  return {
    scannedReactSourceFiles: codeFiles.length,
    reachableCodeFiles: visited.size,
    resolvedReachableImports: edges.length,
    resolvedDirectFrontendImports: allImports.length,
    sharedCanonicalModules: [...globals].sort(),
    unreachableReactModules: unreachable,
    reachableEdges: edges,
    directlyImportedCss: [...directImported].filter(path => path.endsWith('.css')).sort()
  };
}

function legacyLinks(html, name, kind) {
  const tag = kind === 'css' ? 'link' : 'script';
  const prop = kind === 'css' ? 'href' : 'src';
  const tags = html.match(new RegExp('<' + tag + '\\b[^>]*>', 'gi')) || [];
  const values = tags.filter(value => kind !== 'css' || /\brel=["']stylesheet["']/i.test(value))
    .map(value => value.match(new RegExp('\\b' + prop + '=["\\x27]([^"\\x27]+)["\\x27]', 'i'))?.[1])
    .filter(Boolean).map(url => url.split(/[?#]/)[0]);
  assert.equal(new Set(values).size, values.length, name + ' contains duplicate ' + kind + ' links');
  for (const path of values) {
    assert.ok(!/^(?:https?:|\/\/)/i.test(path), name + ' has an external ' + kind + ': ' + path);
    assert.ok(exists(path.replace(/^\/+/, '')), name + ' references missing ' + kind + ': ' + path);
  }
  return values;
}

test('the React dependency graph is resolvable, isolated and inventories transitive shared rules', () => {
  const graph = scanGraph();
  assert.ok(graph.scannedReactSourceFiles >= 90, 'Unexpected loss of migrated React source files');
  assert.ok(graph.resolvedDirectFrontendImports >= 85, 'Unexpected loss of React import dependencies');
  assert.ok(graph.reachableCodeFiles > 50, 'React entry no longer reaches the migrated application');
  assert.deepEqual(graph.sharedCanonicalModules, ['js/asteria-market-pricing.js'],
    'A change to the shared historical pricing edge requires an explicit review');
  // Non-runtime, opt-in tools and tests may exist. The report lists orphan
  // modules for Phase 10 review rather than deleting them based on a scan.
  const report = {
    phase: '9.4',
    generatedAt: new Date().toISOString(),
    auditOnly: true,
    productionEntryUnchanged: true,
    cutoverAllowed: false,
    entryPoints: ['index.html', 'frontend/index.html'],
    ...graph
  };
  const folder = resolve(process.env.RUNNER_TEMP || tmpdir(), 'asteria-phase-9-4-architecture-evidence');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'dependency-ownership-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Phase 9.4 graph: ' + graph.scannedReactSourceFiles +
    ' source modules; ' + graph.resolvedDirectFrontendImports + ' direct imports; ' +
    graph.unreachableReactModules.length + ' modules for manual cutover review.');
});

test('one route registry owns all navigation and protected route classifications', () => {
  const navIds = new Set();
  for (const link of PRIMARY_LINKS) {
    assert.ok(!navIds.has(link.id), 'Duplicate top-level destination: ' + link.id);
    navIds.add(link.id);
    const route = parseSiteRoute({ hash: link.href });
    assert.ok(route.id !== 'not-found', 'Unresolved top-level bookmark ' + link.href);
    assert.ok(ROUTE_FEATURES[route.id], 'Route missing feature registry: ' + route.id);
  }
  for (const hash of [
    '#/react/gm/campaign-a', '#/react/character/campaign-a/character-b',
    '#/react/owned-character/character-b', '#/react/presentation/campaign-a',
    '#/join/123456789012', '#/compendium/race/undien',
    '#loginPage', '#campaigns', '#asteriaFriendsPage'
  ]) {
    const route = parseSiteRoute({ hash });
    assert.ok(route.id !== 'not-found', 'Deep link or legacy alias lost: ' + hash);
    assert.ok(ROUTE_FEATURES[route.id], 'Missing protected/public feature policy: ' + route.id);
  }
  assert.equal(parseSiteRoute({ hash: '#/unknown-phase-9-4' }).id, 'not-found');
  assert.equal(parseSiteRoute({ hash: '' }).id, 'home');
  assert.match(read('frontend/src/app/App.jsx'), /<SiteShell route=\{route\}/);
  assert.match(read('frontend/src/router/useSiteRoute.js'), /getBrowserLocationStore/);
  assert.match(read('frontend/src/router/locationStore.mjs'),
    /listenerScope\.listen\(source, 'hashchange', changed\)/);
  assert.doesNotMatch(read('frontend/src/main.jsx'), /window\.addEventListener\(/);
});

test('new frontend styles have one global owner and resolved scoped CSS module imports', () => {
  const globals = styleFiles.filter(path => !path.endsWith('.module.css')).sort();
  assert.deepEqual(globals, [...globalStyles].sort());
  const main = read('frontend/src/main.jsx');
  for (const path of globalStyles) {
    assert.ok(main.includes("import './styles/" + path.split('/').at(-1) + "'"), path);
  }
  const importedStyles = new Set();
  for (const file of codeFiles) {
    for (const specifier of sourceImports(read(file))) {
      const result = resolveImport(file, specifier);
      if (result?.endsWith('.css')) importedStyles.add(result);
    }
  }
  for (const path of styleFiles) {
    const text = read(path).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(text, /!important\b|@import\b/, path);
    if (path.endsWith('.module.css')) assert.doesNotMatch(text, /:global\s*\(/, path);
    assert.ok(importedStyles.has(path), 'Unused CSS file requires explicit ownership review: ' + path);
  }
});

test('both HTML entries and all live assets remain uniquely owned before Phase 10', () => {
  const legacy = read('index.html');
  const preview = read('frontend/index.html');
  const css = legacyLinks(legacy, 'production', 'css');
  const scripts = legacyLinks(legacy, 'production', 'js');
  assert.ok(css.length >= 30 && scripts.length >= 40, 'Legacy runtime unexpectedly removed');
  assert.ok(css.includes('css/styles.css') && scripts.includes('js/app.js'));
  assert.ok(scripts.includes('src/dev-entry.js'));
  assert.equal(css.at(-1), 'css/asteria-solid-navy-surfaces.css');
  const previewScripts = legacyLinks(preview, 'React preview', 'js');
  assert.deepEqual(previewScripts, ['/src/main.jsx']);
  assert.equal(legacyLinks(preview, 'React preview', 'css').length, 0);
  assert.doesNotMatch(preview, /react-dist|js\/app\.js|css\/styles\.css/);
  assert.doesNotMatch(legacy, /src="\/src\/main\.jsx"/);
  for (const path of deprecated) assert.equal(exists(path), false, 'Retired file restored: ' + path);
  for (const path of [
    'src/dev-entry.js', 'src/app/legacyBridge.js', 'js/auth-bridge.js',
    'react-dist/asteria-react-content-v2.js',
    'react-dist/asteria-react-royal-relic-v2.css',
    'scripts/fixtures/talent-preview.html', 'tools/weapon-crafting.html'
  ]) assert.ok(exists(path), 'Pre-cutover compatibility dependency missing: ' + path);
  assert.match(read('vite.site.config.mjs'), /frontend-dist/);
  assert.match(read('vite.config.mjs'), /emptyOutDir:\s*false/);
});

test('public-only glob assets and the central feature/SDK boundaries keep explicit ownership', () => {
  const globs = [];
  for (const file of codeFiles) {
    const src = read(file);
    for (const match of src.matchAll(/import\.meta\.glob\(\s*['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      globs.push({ file, spec });
      assert.ok(spec.startsWith('./'), 'Public asset glob must be local: ' + file);
      const artworkRegistry = file === 'frontend/src/compendium/publicArtworkLoader.mjs' &&
        spec === './public-entry-index/artwork/*.png';
      assert.ok(artworkRegistry || spec.endsWith('/*.json'), 'Unexpected public asset glob: ' + file);
      const dir = resolve(root, dirname(file), dirname(spec));
      assert.ok(existsSync(dir), 'Generated public asset folder missing (run site generators): ' + dir);
      const names = readdirSync(dir);
      if (artworkRegistry) {
        assert.ok(names.length > 0 && names.every(name => /^[a-f0-9]{64}\.png$/.test(name)),
          'Public artwork glob must contain only generated digest filenames');
      } else {
        assert.ok(names.some(name => name.endsWith('.json')), 'Public asset glob has no generated JSON files: ' + file);
      }
    }
  }
  assert.ok(globs.length >= 4, 'Public Compendium/Forge import boundary removed');
  const sdk = read('frontend/src/firebase/firebaseRuntime.mjs');
  const services = read('frontend/src/services/appServices.mjs');
  assert.match(sdk, /const firebaseRuntimeOwner=createFirebaseRuntimeOwner\(\)/);
  assert.match(services, /export const previewServices = createAppServices\(\)/);
  const entry = read('frontend/src/main.jsx');
  assert.doesNotMatch(entry, /initializeApp\(|connectAuthEmulator\(|setView\(/);
});
