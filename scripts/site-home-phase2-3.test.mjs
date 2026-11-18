import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { previewServices } from '../frontend/src/services/appServices.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('Phase 2.3 retains the exact four approved Home slide images and 15-second cadence', () => {
  const content = read('frontend/src/home/homeContent.mjs');
  const slideNames = [
    'asteria-home-spider.webp', 'asteria-home-logo.webp',
    'asteria-home-dragon.webp', 'asteria-home-varkhyn.webp'
  ];
  for (const path of slideNames) {
    assert.ok(existsSync(resolve(root, 'assets/home/' + path)), path);
    assert.match(content, new RegExp(path.replace('.', '\\.')));
  }
  for (const keyword of ['id: \'spider\'', 'id: \'logo\'', 'id: \'dragon\'', 'id: \'varkhyn\'']) {
    assert.ok(content.includes(keyword), keyword);
  }
  assert.match(content, /HOME_CAROUSEL_INTERVAL_MS = 15000/);
  assert.match(content, /wrapSlideIndex/);
  assert.doesNotMatch(content, /AsteriaFirebase|window\.setView|localStorage/);
});

test('Home carousel owns autoplay, visible-slide semantics, pause/resume and cleanup', () => {
  const code = read('frontend/src/components/home/HomeCarousel.jsx');
  const css = read('frontend/src/components/home/HomeCarousel.module.css');
  assert.match(code, /HOME_SLIDES\.map/);
  assert.match(code, /data-testid="site-home-carousel"/);
  assert.match(code, /data-testid=\{index === 0 \? 'site-hero-image'/);
  assert.match(code, /aria-roledescription="carousel"/);
  assert.match(code, /aria-live="polite"/);
  assert.match(code, /aria-hidden=\{index !== slideIndex\}/);
  assert.match(code, /fetchPriority=\{index === 0 \? 'high'/);
  assert.match(code, /window\.setTimeout/);
  assert.match(code, /window\.clearTimeout/);
  assert.match(code, /document\.hidden/);
  assert.match(code, /IntersectionObserver/);
  assert.match(code, /observer\.disconnect\(\)/);
  assert.match(code, /scope\.dispose\(\)/);
  assert.match(code, /prefers-reduced-motion: reduce/);
  assert.match(code, /onMouseEnter/);
  assert.match(code, /onMouseLeave/);
  assert.match(code, /onFocusCapture/);
  assert.match(code, /onBlurCapture/);
  assert.match(code, /onTouchStart/);
  assert.match(code, /onTouchEnd/);
  assert.match(code, /Math\.abs\(x\) > 60 && Math\.abs\(x\) > Math\.abs\(y\)/);
  assert.match(code, /onKeyDown=\{onKeyboard\}/);
  assert.match(css, /height:\s*clamp\(430px,\s*61vh,\s*810px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-width:\s*var\(--ast-target-min\)/);
  assert.doesNotMatch(code + css, /window\.(?:setView|AsteriaFirebase|AsteriaLibrary)|!important/);
});

test('Home CTA and Forge links resolve to known fail-closed preview routes', () => {
  const content = read('frontend/src/home/homeContent.mjs');
  const urls = [
    '#/compendium?group=world',
    '#/compendium?group=rules&category=handbook',
    '#/character-forge?mode=create',
    '#/campaign-forge?mode=create'
  ];
  urls.forEach(hash => {
    assert.ok(content.includes(hash), hash);
    const parsed = parseSiteRoute({ hash });
    assert.notEqual(parsed.id, 'not-found', hash);
    assert.equal(canActivateRoute(parsed.id, previewServices), false, hash);
  });
  const forge = read('frontend/src/components/home/ForgeCards.jsx');
  const style = read('frontend/src/components/home/ForgeCards.module.css');
  assert.match(forge, /HOME_FORGE_CARDS\.map/);
  assert.match(forge, /href=\{card\.href\}/);
  assert.match(forge, /forge-campaign-map-book\.avif/);
  assert.match(forge, /asteria-home-varkhyn\.webp/);
  assert.match(style, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(style, /@media \(max-width: 760px\)/);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(forge + style, /window\.Asteria|!important/);
});

test('Home replaces Phase 1 placeholder with the cinematic carousel and simple card section', () => {
  const home = read('frontend/src/pages/HomePage.jsx');
  const css = read('frontend/src/pages/HomePage.module.css');
  assert.match(home, /<HomeCarousel \/>/);
  assert.match(home, /<ForgeCards \/>/);
  assert.match(home, /<Heading id="site-home-title" hero>Asteria<\/Heading>/);
  assert.match(home, /HOME_ACTIONS\.map/);
  assert.match(home, /React Home preview:/);
  assert.doesNotMatch(home, /<SurfacePanel|<WorldMap|<WelcomePanel/);
  assert.match(css, /background:\s*var\(--ast-color-page\)/);
  assert.doesNotMatch(css, /:global\(|!important|#[0-9a-f]{3,8}\b/i);
});

test('Phase 2.3 is isolated from production and has a repeatable browser CI gate', () => {
  const oldHtml = read('index.html');
  const next = read('frontend/index.html');
  assert.match(oldHtml, /id="aaaHomeCarousel"/);
  assert.match(oldHtml, /src="js\/app\.js\?/);
  assert.doesNotMatch(oldHtml, /frontend\/src\/main\.jsx|site-home-browser/);
  assert.match(next, /id="asteria-site-root"/);
  assert.doesNotMatch(next, /asteria-aaa-upgrade\.js|css\/asteria-home-header-refresh/);
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/site-foundation.yml');
  assert.match(pkg.scripts['site:check'], /site-home-phase2-3\.test\.mjs/);
  assert.match(pkg.scripts['site:home-browser'], /site-home-browser\.cjs/);
  assert.match(workflow, /npm run site:home-browser/);
  assert.match(workflow, /asteria-phase-2-3-home-evidence/);
});
