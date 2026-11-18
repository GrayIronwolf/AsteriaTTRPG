import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const location = 'frontend/src/';
const globalStyles = ['tokens.css', 'reset.css', 'typography.css'];

function collectCss(folder) {
  return readdirSync(resolve(root, folder), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? collectCss(folder + '/' + entry.name)
      : extname(entry.name) === '.css' ? [folder + '/' + entry.name] : []);
}
function removeComments(content) {
  return content.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('Phase 1.3 replaces the old preview stylesheet, without stacking another layer', () => {
  assert.equal(existsSync(resolve(root, location + 'styles/foundation.css')), false);
  const main = read(location + 'main.jsx');
  for (const name of globalStyles) {
    assert.match(main, new RegExp("import './styles/" + name.replace('.', '\\.') + "'"));
  }
  assert.doesNotMatch(main, /foundation\.css|css\/styles\.css|asteria-page-template\.css/);
  assert.match(main, /createRoot\(host\)\.render/);
});

test('global stylesheet files have strictly divided responsibilities', () => {
  const files = collectCss('frontend/src');
  assert.equal(files.length, 21, 'Expected three global files and eighteen scoped CSS Modules');
  assert.equal(files.filter(path => path.endsWith('.module.css')).length, 18);
  assert.deepEqual(
    files.filter(path => !path.endsWith('.module.css')).map(path => path.split('/').pop()).sort(),
    [...globalStyles].sort()
  );
  for (const path of files) {
    const content = removeComments(read(path));
    assert.doesNotMatch(content, /!important\b/, path);
    assert.doesNotMatch(content, /@import\b/, path);
    assert.doesNotMatch(content, /(?:^|[\n\s])(?:\.site-|\.asteria-|\.crystal-button)/, path);
    if (path.endsWith('.module.css')) {
      assert.doesNotMatch(content, /:global\(|@layer|(?<![\w.:-])(?:body|html|:root)\s*[{,]/, path);
      assert.doesNotMatch(content, /#[0-9a-f]{3,8}\b/i, 'Brand colors must be defined in tokens.css: ' + path);
    }
  }
});

test('one authoritative token source covers brand, layout, status, typography, controls and appearance', () => {
  const tokens = read(location + 'styles/tokens.css');
  assert.match(tokens, /:root\s*\{/);
  const values = [
    '--ast-color-page', '--ast-color-header', '--ast-color-panel',
    '--ast-color-panel-slate', '--ast-color-outline', '--ast-color-focus',
    '--ast-color-hero-text', '--ast-color-text-muted', '--ast-color-gold',
    '--ast-button-bezel-top', '--ast-button-inset-top',
    '--ast-font-display', '--ast-font-body', '--ast-space-4',
    '--ast-page-max', '--ast-page-gutter', '--ast-target-min',
    '--ast-radius-panel', '--ast-z-menu'
  ];
  for (const v of values) assert.ok(tokens.includes(v + ':'), 'Missing semantic token ' + v);
  for (const mode of ['dark-gray', 'light-gray', 'dark-blue', 'forest']) {
    assert.ok(tokens.includes('data-asteria-background="' + mode + '"'));
  }
  assert.match(tokens, /--ast-color-header:\s*#162839/i);
  assert.match(tokens, /--ast-color-panel:\s*#060d15/i);
  assert.match(tokens, /--ast-target-min:\s*44px/);
});

test('component boundaries and reusable Asteria UI controls are wired to the pages', () => {
  const shell = read(location + 'components/SiteShell.jsx');
  const home = read(location + 'pages/HomePage.jsx');
  const route = read(location + 'pages/RoutePreviewPage.jsx');
  const buttons = read(location + 'components/ui/CrystalButton.jsx');
  const buttonCss = read(location + 'components/ui/CrystalButton.module.css');
  assert.match(shell, /from '.\/SiteShell\.module\.css'/);
  assert.match(shell, /from '.\/ui\/CrystalButton\.jsx'/);
  assert.match(shell, /<CrystalButton/);
  assert.match(shell, /data-testid="site-primary-navigation"/);
  assert.match(shell, /data-testid="site-mobile-menu"/);
  assert.match(home, /from '.\/HomePage\.module\.css'/);
  assert.match(home, /<PageLayout/);
  assert.match(home, /<HomeCarousel \/>/);
  assert.match(home, /<ForgeCards \/>/);
  assert.doesNotMatch(home, /<SurfacePanel/);
  assert.match(home, /<Heading id="site-home-title" hero>/);
  assert.match(route, /<PageLayout/);
  assert.match(route, /<CrystalButton variant="primary" size="wide" href="#home"/);
  assert.match(route, /<SurfacePanel/);
  assert.match(buttons, /if \(href != null\)/);
  assert.match(buttons, /aria-current=\{active \? 'page'/);
  assert.match(buttonCss, /clip-path:\s*polygon\(/);
  assert.match(buttonCss, /var\(--ast-button-inset-top\)/);
});

test('design boundaries keep current production build, dashboard styles and Firebase untouched', () => {
  const html = read('index.html');
  const main = read('frontend/src/main.jsx');
  const app = read('frontend/src/app/App.jsx');
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/site-foundation.yml');
  assert.match(html, /id="asteriaReactRoot"/);
  assert.match(html, /src="js\/app\.js\?/);
  assert.doesNotMatch(html, /frontend\/src|site-design|site:design-browser/);
  assert.doesNotMatch(main + app, /from ['"].*(?:legacyBridge|src\/styles|css\/styles\.css|firebase)/);
  assert.match(read('vite.site.config.mjs'), /outDir: resolve\(repositoryRoot, 'frontend-dist'\)/);
  assert.match(pkg.scripts['site:check'], /site-design-phase1-3\.test\.mjs/);
  assert.match(pkg.scripts['site:design-browser'], /site-design-browser\.cjs/);
  assert.match(workflow, /npm run site:design-browser/);
});
