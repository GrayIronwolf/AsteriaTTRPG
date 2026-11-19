import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { previewServices } from '../frontend/src/services/appServices.mjs';
import {
  DEFAULT_APPEARANCE, APPEARANCE_STORAGE_KEY, BACKGROUND_OPTIONS,
  BUTTON_THEME_OPTIONS, FONT_OPTIONS, TEXT_SIZE_OPTIONS, normalizeAppearance, encodeAppearance,
  decodeAppearance
} from '../frontend/src/appearance/appearanceModel.mjs';
import { createAccountHeaderGateway } from '../frontend/src/services/accountHeaderGateway.mjs';
import { getVerifiedHeaderIdentity } from '../frontend/src/components/headerIdentity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('Phase 2.4 public appearance routing, account protection and Home isolation', () => {
  assert.equal(parseSiteRoute({ hash: '#/appearance' }).id, 'appearance');
  assert.equal(canActivateRoute('appearance', previewServices), true);
  for (const hash of ['#/account/settings', '#/account/profile', '#/account/notifications']) {
    const id = parseSiteRoute({ hash }).id;
    assert.equal(canActivateRoute(id, previewServices), false, hash);
  }
  const app = read('frontend/src/app/App.jsx');
  const shell = read('frontend/src/components/SiteShell.jsx');
  assert.match(app, /<AppearanceSettingsPage \/>/);
  assert.match(app, /showMigratedHome \? <HomePage/);
  assert.match(shell, /site-mobile-appearance-link/);
  assert.match(shell, /site-footer-appearance/);
  assert.match(read('frontend/src/main.jsx'), /<AppearanceProvider>/);
  assert.equal((shell.match(/<header\b/g) || []).length, 1);
  assert.equal((shell.match(/<main\b/g) || []).length, 1);
});

test('appearance model rejects unknown fonts, malformed storage and untrusted CSS', () => {
  assert.match(APPEARANCE_STORAGE_KEY, /^asteria\.react\.appearance\.v1$/);
  assert.equal(DEFAULT_APPEARANCE.background, 'black');
  assert.equal(BACKGROUND_OPTIONS.length, 5);
  assert.ok(FONT_OPTIONS.length >= 10);
  assert.equal(TEXT_SIZE_OPTIONS.length, 4);
  assert.equal(BUTTON_THEME_OPTIONS.length, 1);
  assert.equal(DEFAULT_APPEARANCE.buttonTheme, 'asteria-crystal');
  assert.deepEqual(decodeAppearance(encodeAppearance(DEFAULT_APPEARANCE)), DEFAULT_APPEARANCE);
  assert.deepEqual(decodeAppearance('{bad'), DEFAULT_APPEARANCE);
  assert.deepEqual(decodeAppearance(JSON.stringify({version: 17, background:'forest'})), DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({background:'url(http://attacker)', bodyFont:'<script>', textSize:'9999px'}), DEFAULT_APPEARANCE);
  const selected = normalizeAppearance({ background:'forest', bodyFont:'baskerville', displayFont:'castellar', textSize:'large' });
  assert.deepEqual(decodeAppearance(encodeAppearance(selected)), selected);
  assert.equal(normalizeAppearance({buttonTheme:'untrusted-skin'}).buttonTheme, 'asteria-crystal');
  const provider = read('frontend/src/appearance/AppearanceProvider.jsx');
  assert.match(provider, /window\.localStorage/);
  assert.match(provider, /window\.addEventListener\('storage'/);
  assert.match(provider, /window\.removeEventListener\('storage'/);
  assert.match(provider, /document\.documentElement/);
  assert.doesNotMatch(provider, /window\.AsteriaFirebase|setView|innerHTML/);
});

test('one token owner for appearance and scoped page styling', () => {
  const styles = read('frontend/src/styles/tokens.css');
  for (const id of BACKGROUND_OPTIONS.map(item => item.id)) {
    assert.ok(styles.includes('data-asteria-background="'+id+'"'));
  }
  for (const id of FONT_OPTIONS.map(item => item.id)) {
    assert.ok(styles.includes('data-asteria-body-font="'+id+'"'), id);
    assert.ok(styles.includes('data-asteria-display-font="'+id+'"'), id);
  }
  for (const id of TEXT_SIZE_OPTIONS.map(item => item.id)) {
    assert.ok(styles.includes('data-asteria-text-size="'+id+'"'), id);
  }
  assert.match(read('frontend/src/styles/typography.css'), /--ast-root-font-size/);
  assert.match(styles, /--ast-button-image-standard-crystal/);
  const page = read('frontend/src/pages/AppearanceSettingsPage.jsx');
  assert.match(page, /data-testid="site-appearance-page"/);
  assert.match(page, /Restore defaults/);
  assert.match(page, /aria-pressed=/);
  assert.match(page, /site-button-theme/);
  const css = read('frontend/src/pages/AppearanceSettingsPage.module.css');
  assert.doesNotMatch(css, /!important|:global\(|#[0-9a-f]{3,8}\b/i);
});

test('future authenticated header requires exact owner and valid notification count', async () => {
  assert.throws(() => createAccountHeaderGateway(), TypeError);
  const adapter = createAccountHeaderGateway({
    getAuthenticatedUser: async () => ({uid:'signed-in-user'}),
    getOwnedProfile: async uid => ({uid, username:'Player', avatarUrl:'https://example.com/a.jpg'}),
    getUnreadNotificationCount: async () => 120
  });
  const result = await adapter.load();
  assert.equal(result.notificationCount, 99);
  assert.equal(getVerifiedHeaderIdentity(result).notificationCount, 99);
  const mismatch = createAccountHeaderGateway({
    getAuthenticatedUser: async () => ({uid:'a'}),
    getOwnedProfile: async () => ({uid:'b',username:'Imposter'}),
    getUnreadNotificationCount: async () => 0
  });
  assert.equal(await mismatch.load(), null);
  const fake = createAccountHeaderGateway({
    getAuthenticatedUser: async () => ({uid:'a'}),
    getOwnedProfile: async () => ({uid:'a',username:'Player'}),
    getUnreadNotificationCount: async () => -1
  });
  assert.equal(await fake.load(), null);
  assert.equal(getVerifiedHeaderIdentity({status:'guest',verified:true,username:'Player'}), null);
  assert.match(read('frontend/src/components/HeaderAccountControls.jsx'), /site-header-account-menu/);
});

test('Phase 2.4 CI checks and isolated build remain separate from production', () => {
  const pkg = JSON.parse(read('package.json'));
  const workflow = read('.github/workflows/site-foundation.yml');
  assert.match(pkg.scripts['site:check'], /site-appearance-phase2-4\.test\.mjs/);
  assert.match(pkg.scripts['site:appearance-browser'], /site-appearance-browser\.cjs/);
  assert.match(workflow, /npm run site:appearance-browser/);
  assert.match(workflow, /asteria-phase-2-4-appearance-evidence/);
  assert.doesNotMatch(read('index.html'), /frontend\/src\/appearance/);
});
