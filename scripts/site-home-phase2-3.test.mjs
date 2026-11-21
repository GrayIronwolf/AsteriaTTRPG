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
  assert.match(code, /fetchpriority=\{index === 0 \? 'high'/);
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

test('Home links target the original public scopes and protect My Characters', () => {
  const content = read('frontend/src/home/homeContent.mjs');
  const routes = [
    ['#/compendium?group=world&category=worlds', 'lore', 'worlds'],
    ['#/compendium?group=rules&category=handbook', 'handbook', 'handbook']
  ];
  for (const [hash, id, category] of routes) {
    assert.ok(content.includes(hash), hash);
    const route = parseSiteRoute({ hash });
    assert.equal(route.id, id, hash);
    assert.equal(route.query.get('category'), category, hash);
  }
  const characters = '#/character-forge?view=my-characters';
  assert.ok(content.includes(characters));
  assert.equal(canActivateRoute(parseSiteRoute({hash:characters}).id, previewServices), false);
  const home = read('frontend/src/pages/HomePage.jsx');
  assert.match(home, /isVerifiedOwnedSession\(session\)/);
  assert.match(home, /href=\{action\.href\}/);
});

test('Home restores the single welcome section below the approved carousel', () => {
  const home = read('frontend/src/pages/HomePage.jsx');
  const css = read('frontend/src/pages/HomePage.module.css');
  assert.match(home, /<HomeCarousel \/>/);
  assert.doesNotMatch(home, /ForgeCards|React Home preview:|Make Asteria your own/);
  assert.match(home, /<Heading id="site-home-title" hero>Asteria<\/Heading>/);
  assert.match(home, /HOME_ACTIONS\.map/);
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
