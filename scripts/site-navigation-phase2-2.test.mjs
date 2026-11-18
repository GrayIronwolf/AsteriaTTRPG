import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIMARY_LINKS, parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';
import { MEGA_MENUS, getMegaMenu, filterMegaMenuEntries } from '../frontend/src/navigation/megaMenuRegistry.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { previewServices } from '../frontend/src/services/appServices.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('Phase 2.2 has one canonical registry matching the seven existing menu groups', () => {
  assert.deepEqual(Object.keys(MEGA_MENUS).sort(),
    ['handbook', 'lore', 'compendium', 'character-forge', 'campaign-forge', 'friends', 'account'].sort());
  const expectedCounts = { handbook: 6, lore: 8, compendium: 10,
    'character-forge': 2, 'campaign-forge': 3, friends: 2, account: 4 };
  for (const [id, menu] of Object.entries(MEGA_MENUS)) {
    const link = PRIMARY_LINKS.find(link => link.id === id);
    assert.equal(menu.id, id);
    assert.equal(menu.defaultHref, link.href);
    assert.equal(menu.entries.length, expectedCounts[id], id);
    assert.ok(Object.isFrozen(menu), id);
    assert.ok(Object.isFrozen(menu.entries), id);
    assert.equal(new Set(menu.entries.map(item => item.id)).size, menu.entries.length, id);
    for (const item of menu.entries) {
      assert.ok(Object.isFrozen(item), item.id);
      assert.match(item.href, /^#\//, item.label);
      assert.equal(item.href.includes('undefined'), false, item.label);
      assert.equal(item.href.includes('javascript:'), false, item.label);
      const parsed = parseSiteRoute({ hash: item.href });
      assert.notEqual(parsed.id, 'not-found', item.label + ': ' + item.href);
      assert.equal(canActivateRoute(parsed.id, previewServices), false,
        'Menu cards must not reveal unmigrated content: ' + item.label);
    }
  }
  assert.equal(PRIMARY_LINKS.length, 8);
  assert.equal(getMegaMenu('home'), null);
  assert.equal(getMegaMenu('__proto__'), null);
});

test('menu content and deep-link query parameters preserve legacy section intent', () => {
  const all = Object.values(MEGA_MENUS).flatMap(menu => menu.entries);
  assert.equal(all.length, 35);
  assert.deepEqual(MEGA_MENUS['campaign-forge'].entries.map(item => item.label),
    ['Forge A Campaign', 'My Campaigns', 'Join A Campaign']);
  assert.deepEqual(MEGA_MENUS.compendium.entries.map(item => item.label),
    ['Races', 'Classes', 'Magical & Element', 'Resources', 'Blueprints',
      'Recipes', 'Schematics', 'Patterns', 'Formulas', 'Design']);
  const byLabel = new Map(all.map(item => [item.label, item]));
  assert.match(byLabel.get('Realms').href, /group=world&category=worlds&q=Realm/);
  assert.match(byLabel.get('Forge A Campaign').href, /mode=create/);
  assert.match(byLabel.get('Join A Campaign').href, /mode=join/);
  assert.match(byLabel.get('Appearance').href, /tab=appearance/);
  assert.match(byLabel.get('Chats').href, /section=chats/);
  assert.equal(byLabel.get('Forge A Campaign').artwork, 'campaign-book');
});

test('search matches both titles and descriptions, ignores case and resets by menu', () => {
  const menu = MEGA_MENUS.compendium;
  assert.deepEqual(filterMegaMenuEntries(menu, '   RACES ').map(item => item.id), ['races']);
  assert.deepEqual(filterMegaMenuEntries(menu, 'construction').map(item => item.id), ['blueprints']);
  assert.deepEqual(filterMegaMenuEntries(menu, 'zzzzz'), []);
  assert.equal(filterMegaMenuEntries(menu).length, 10);
  assert.deepEqual(filterMegaMenuEntries(null), []);
});

test('React owns the menu, search and focus lifecycle without legacy handlers', () => {
  const shell = read('frontend/src/components/SiteShell.jsx');
  const modal = read('frontend/src/components/NavigationMegaMenu.jsx');
  const styles = read('frontend/src/components/NavigationMegaMenu.module.css');
  const workflow = read('.github/workflows/site-foundation.yml');
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.match(shell, /getMegaMenu/);
  assert.match(shell, /<NavigationMegaMenu/);
  assert.match(shell, /aria-haspopup=\{hasMenu \? 'dialog'/);
  assert.match(shell, /aria-expanded=\{hasMenu \? activeMenuId === link.id/);
  assert.match(shell, /event\.preventDefault\(\)/);
  assert.match(shell, /event\.metaKey/);
  assert.match(shell, /createDisposableScope\(\)/);
  assert.match(shell, /scope\.dispose\(\)/);
  assert.match(shell, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key !== 'Tab'/);
  assert.match(modal, /onChange=\{event => onQueryChange\(event\.target\.value\)\}/);
  assert.match(modal, /forge-campaign-map-book\.avif/);
  assert.match(modal, /href=\{item\.href\}/);
  assert.match(styles, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(112px,\s*132px\)\)/);
  assert.match(styles, /height:\s*clamp\(202px,\s*17vw,\s*232px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(shell + modal + styles, /window\.(?:setView|AsteriaLibrary|AsteriaFirebase)|!important/);
  assert.match(scripts['site:check'], /site-navigation-phase2-2\.test\.mjs/);
  assert.match(scripts['site:mega-browser'], /site-mega-browser\.cjs/);
  assert.match(workflow, /npm run site:mega-browser/);
  assert.match(read('index.html'), /id="globalNavigation"/);
});
