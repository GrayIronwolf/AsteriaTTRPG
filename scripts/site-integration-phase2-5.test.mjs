import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY_LINKS, parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { MEGA_MENUS } from '../frontend/src/navigation/megaMenuRegistry.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { previewServices } from '../frontend/src/services/appServices.mjs';
import { getVerifiedHeaderIdentity } from '../frontend/src/components/headerIdentity.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('Phase 2.5 merges header, menus, Home and appearance into one route contract', () => {
  assert.equal(PRIMARY_LINKS.length, 8);
  assert.equal(Object.keys(MEGA_MENUS).length, 7);
  assert.equal(parseSiteRoute({ hash: '' }).id, 'home');
  assert.equal(parseSiteRoute({ hash: '#home' }).id, 'home');
  assert.equal(parseSiteRoute({ hash: '#/appearance' }).id, 'appearance');
  assert.equal(canActivateRoute('home', previewServices), true);
  assert.equal(canActivateRoute('appearance', previewServices), true);
  for (const menu of Object.values(MEGA_MENUS)) {
    for (const card of menu.entries) {
      const route = parseSiteRoute({ hash: card.href });
      assert.notEqual(route.id, 'not-found', card.href);
      assert.equal(canActivateRoute(route.id, previewServices), card.id === 'appearance',
        'Only the migrated public Appearance card can activate: ' + card.href);
    }
  }
  const appearance = MEGA_MENUS.account.entries.find(item => item.id === 'appearance');
  assert.equal(appearance.href, '#/appearance', 'Do not route migrated appearance to protected legacy settings');
  assert.equal(parseSiteRoute({hash: MEGA_MENUS.account.entries.find(x => x.id === 'settings').href}).id, 'settings');
  assert.equal(canActivateRoute('settings', previewServices), false);
  assert.equal(canActivateRoute('profile', previewServices), false);
  assert.equal(canActivateRoute('notifications', previewServices), false);
});

test('verified header is presentational and cannot turn into an authenticated data grant', () => {
  const app = read('frontend/src/app/App.jsx');
  const main = read('frontend/src/main.jsx');
  const shell = read('frontend/src/components/SiteShell.jsx');
  const header = read('frontend/src/components/HeaderAccountControls.jsx');
  assert.match(app, /export function App\(\{ identity = null \} = \{\}\)/);
  assert.match(app, /<SiteShell route=\{route\} identity=\{identity\}>/);
  assert.match(main, /<App \/>/);
  assert.doesNotMatch(main, /identity=|mockAuthenticated|fakeUser/);
  assert.match(shell, /<HeaderAccountControls identity=\{identity\} \/>/);
  assert.match(header, /ref=\{accountMenuRef\}/);
  assert.match(header, /onClick=\{closeAccountMenu\}/);
  assert.equal(getVerifiedHeaderIdentity(null), null);
  assert.equal(getVerifiedHeaderIdentity({status:'authenticated',username:'no-verification'}), null);
  assert.equal(getVerifiedHeaderIdentity({status:'authenticated',verified:true,username:'Player'}).username,'Player');
  for (const id of ['profile', 'settings', 'notifications','friends', 'gm-dashboard','character-dashboard']) {
    assert.equal(canActivateRoute(id, previewServices), false, id);
  }
  assert.equal(parseSiteRoute({hash:''}).id,'home', 'App startup must not jump from Home to Forge');
});

test('no CSS or script overlay re-enters React from legacy HTML', () => {
  const legacy=read('index.html'), preview=read('frontend/index.html');
  assert.match(legacy, /js\/asteria-home-guard\.js/);
  assert.match(legacy, /src="js\/app\.js\?/);
  assert.match(legacy, /id="aaaHomeCarousel"/);
  assert.doesNotMatch(legacy, /frontend\/src\/main\.jsx/);
  assert.match(preview, /id="asteria-site-root"/);
  assert.doesNotMatch(preview, /css\/styles\.css|js\/app\.js|asteria-page-template/);
  assert.ok(existsSync(resolve(root,'frontend/src/styles/tokens.css')));
  assert.equal(existsSync(resolve(root,'frontend/src/styles/foundation.css')),false);
  const source = read('frontend/src/components/SiteShell.jsx') + read('frontend/src/app/App.jsx');
  assert.doesNotMatch(source, /window\.(?:setView|AsteriaFirebase|AsteriaReactMigration)/);
  assert.equal((source.match(/<header\b/g)||[]).length,1);
  assert.equal((source.match(/<main\b/g)||[]).length,1);
});

test('cleanup ledger names existing source owners with explicit no-removal gates', () => {
  const data=JSON.parse(read('docs/frontend-overhaul/PHASE-2.5-RETIREMENT-LEDGER.json'));
  assert.equal(data.schemaVersion,1);
  assert.equal(data.removalPolicy,'none_before_parity_and_approved_production_cutover');
  const candidates=data.groups.flatMap(group => group.legacyFiles);
  assert.equal(new Set(candidates).size,candidates.length);
  for(const file of candidates) assert.ok(existsSync(resolve(root,file)),file);
  const template = data.groups.find(x=>x.id==='disabled-universal-page-template');
  assert.equal(template.expectLoadedInLegacy,false);
  assert.ok(template.legacyFiles.includes('js/asteria-page-template.js'));
  assert.ok(template.legacyFiles.includes('css/asteria-page-template.css'));
});

test('Phase 2.5 is gated by integrated and prior CI, with screenshot/cleanup artifacts', () => {
  const scripts=JSON.parse(read('package.json')).scripts;
  const workflow=read('.github/workflows/site-foundation.yml');
  assert.match(scripts['site:check'], /site-integration-phase2-5\.test\.mjs/);
  assert.match(scripts['site:integration-browser'], /site-integration-browser\.cjs/);
  assert.match(scripts['site:retirement-audit'], /site-retirement-audit\.mjs/);
  for(const command of ['site:check', 'site:build','site:verify-dist','site:retirement-audit','site:integration-browser','site:acceptance','site:home-browser','site:appearance-browser']) {
    assert.ok(workflow.includes('npm run '+command),command);
  }
  assert.match(workflow,/asteria-phase-2-5-integration-evidence/);
  assert.match(workflow,/npx eslint frontend\/src/);
});
