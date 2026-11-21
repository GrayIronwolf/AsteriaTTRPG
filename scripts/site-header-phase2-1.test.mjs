import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVerifiedHeaderIdentity } from '../frontend/src/components/headerIdentity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('Phase 2.1 reuses the actual wordmark and four star windows, without legacy handlers', () => {
  const logo = read('frontend/src/components/AsteriaBrand.jsx');
  const css = read('frontend/src/components/AsteriaBrand.module.css');
  assert.match(logo, /import wordmarkUrl from '\.\.\/\.\.\/\.\.\/assets\/header\/asteria-wordmark\.png'/);
  assert.match(logo, /useId\(\)/);
  assert.match(logo, /href="#home"/);
  assert.match(logo, /viewBox="0 0 2048 682"/);
  assert.equal((logo.match(/<path d="/g) || []).length, 4);
  assert.equal((logo.match(/href=\{wordmarkUrl\}/g) || []).length, 2);
  assert.match(logo, /<feFlood className=\{styles\.starFlood\}/);
  assert.match(logo, /clipPath=/);
  assert.match(css, /flood-color:\s*var\(--ast-button-crystal-tone\)/);
  assert.doesNotMatch(css, /starColourCycle|animation:/);


  assert.doesNotMatch(logo + css, /setInterval|setTimeout|MutationObserver|!important/);
});

test('the header is owned by SiteShell and uses one responsive menu and one account area', () => {
  const shell = read('frontend/src/components/SiteShell.jsx');
  const styles = read('frontend/src/components/SiteShell.module.css');
  const tokens = read('frontend/src/styles/tokens.css');
  assert.match(shell, /<AsteriaBrand \/>/);
  assert.match(shell, /<HeaderAccountControls identity=\{identity\} \/>/);
  assert.equal((shell.match(/<header\b/g) || []).length, 1);
  assert.match(shell, /data-testid="site-primary-navigation"/);
  assert.match(shell, /data-testid="site-mobile-menu"/);
  assert.match(shell, /aria-label="Mobile navigation"/);
  assert.match(shell, /onNavigate=\{navigate\}/);
  assert.match(shell, /function navigate\(\) \{[\s\S]*?closeMobileMenu\(\)/);
  assert.match(styles, /@media \(max-width: 1679px\)/);
  assert.match(styles, /flex-wrap:\s*nowrap/);
  assert.match(styles, /display:\s*none/);
  for (const name of ['--ast-header-brand-width', '--ast-header-height', '--ast-header-avatar-size']) {
    assert.ok(tokens.includes(name + ':'), name);
  }
  for (const name of ['--ast-logo-star-blue', '--ast-logo-star-cyan', '--ast-logo-star-violet', '--ast-logo-star-gold']) {
    assert.ok(tokens.includes(name + ':'), name);
  }
  assert.match(styles, /\.header\s*\{[^}]*background:\s*var\(--ast-color-panel\)/);
  assert.match(tokens, /--ast-color-panel:\s*#060d15/i);
  assert.doesNotMatch(shell + styles, /window\.setView|document\.querySelector|!important/);
});

test('profile UI requires a verified authenticated identity, and keeps unsafe URLs out of img', () => {
  for (const account of [
    null, undefined, {}, { status: 'authenticated', username: 'Player' },
    { status: 'guest', verified: true, username: 'Player' },
    { status: 'authenticated', verified: true, username: '' }
  ]) {
    assert.equal(getVerifiedHeaderIdentity(account), null);
  }
  const good = getVerifiedHeaderIdentity({
    status: 'authenticated',
    verified: true,
    username: '  AsteriaPlayer  ',
    avatarUrl: 'https://example.com/profile.webp'
  });
  assert.equal(good.username, 'AsteriaPlayer');
  assert.equal(good.initial, 'A');
  assert.equal(good.avatarUrl, 'https://example.com/profile.webp');

  for (const invalid of [
    'javascript:alert(1)', 'data:image/svg+xml;base64,YQ==',
    'http://example.com/avatar.jpg', 'file:///secret/photo.png',
    'https://me:password@example.com/avatar.png', '/assets/avatar.png'
  ]) {
    assert.equal(getVerifiedHeaderIdentity({
      status: 'authenticated', verified: true, username: 'Tester', avatarUrl: invalid
    }).avatarUrl, null, invalid);
  }
  const controls = read('frontend/src/components/HeaderAccountControls.jsx');
  const css = read('frontend/src/components/HeaderAccountControls.module.css');
  assert.match(controls, /getVerifiedHeaderIdentity\(identity\)/);
  assert.match(controls, /href="#\/account\/login"/);
  assert.match(controls, /href="#\/account\/profile"/);
  assert.match(controls, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(controls, /aria-label="Open My Profile"/);
  assert.match(css, /width:\s*var\(--ast-header-avatar-size\)/);
  assert.match(css, /height:\s*var\(--ast-header-height\)/);
  assert.match(css, /border:\s*0;/);
  assert.match(controls, /site-header-notifications/);
  assert.match(controls, /isVerifiedOwnedSession\(session\)/);
  assert.match(controls, /session\.accountId/);
  assert.match(controls, /Account ID pending/);
  assert.match(controls, /href="#\/account\/settings\?tab=security"/);
  assert.doesNotMatch(controls, /⋮/);
  assert.match(css, /object-fit:\s*cover/);
  assert.doesNotMatch(controls.replace(/\/\*[\s\S]*?\*\//g, ''), /localStorage|window\.AsteriaFirebase|sessionStorage/);
});

test('the existing live site remains the old implementation until feature parity', () => {
  const legacy = read('index.html');
  const newHtml = read('frontend/index.html');
  const siteConfig = read('vite.site.config.mjs');
  assert.match(legacy, /id="asteriaHeaderBrand"/);
  assert.match(legacy, /id="globalNavigation"/);
  assert.match(legacy, /id="asteriaHeaderProfile"/);
  assert.match(legacy, /src="js\/app\.js\?/);
  assert.doesNotMatch(legacy, /frontend\/src|frontend-dist/);
  assert.match(newHtml, /id="asteria-site-root"/);
  assert.doesNotMatch(newHtml, /asteria-header-wordmark\.css|js\/asteria-account-header/);
  assert.match(siteConfig, /outDir: resolve\(repositoryRoot, 'frontend-dist'\)/);

  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/site-foundation.yml');
  assert.match(pkg.scripts['site:check'], /site-header-phase2-1\.test\.mjs/);
  assert.match(pkg.scripts['site:header-browser'], /site-header-browser\.cjs/);
  assert.match(workflow, /npm run site:header-browser/);
});
