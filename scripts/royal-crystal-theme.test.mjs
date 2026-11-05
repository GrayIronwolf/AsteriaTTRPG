import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const theme=read('css/asteria-royal-crystal-dashboard.css');
const index=read('index.html');
const shared=read('src/components/WorkspaceUI.jsx');
const originalMenu=read('css/asteria-menu-buttons.css');
const endcaps=read('assets/ui/asteria-royal-crystal-sidewall.svg');
const staticHeader=theme.split('/* 2. Panel heading:')[1]?.split('/* 3. Shared gemstone')[0] || '';

test('Royal Crystal stylesheet is versioned and loaded after the original menu skin',()=>{
  const basic=index.indexOf('css/asteria-menu-buttons.css');
  const overlay=index.indexOf('css/asteria-royal-crystal-dashboard.css?v=royal-crystal-v1');
  assert.ok(basic > 0 && overlay > basic,'new stylesheet follows the existing menu baseline');
  assert.match(theme,/\.asteria-react-panel\.asteria-royal-relic/);
  assert.match(shared,/data-panel-material="royal-relic"/);
});

test('Panels keep narrow steel rims and use original obsidian texture, without layout surgery',()=>{
  assert.match(theme,/royal-relic-obsidian\.svg/);
  assert.match(theme,/royal-relic-brushed-steel\.svg/);
  assert.match(theme,/border:1px solid #87939e/);
  assert.doesNotMatch(theme,/grid-template-columns|grid-template-areas|grid-column|position\s*:\s*fixed/);
  assert.doesNotMatch(theme,/--panel-columns/);
});

test('Panel headings are plain, non-interactive labels with fixed dark-centre and bright-edge fill',()=>{
  assert.ok(staticHeader.length > 500);
  const group=shared.match(/<div className="react-panel-title-group"[^>]*>/)?.[0];
  assert.ok(group);
  assert.doesNotMatch(group,/onClick|onKeyDown|role="button"/);
  assert.match(staticHeader,/cursor:default/);
  assert.match(staticHeader,/transition:none !important/);
  assert.match(staticHeader,/animation:none !important/);
  assert.match(staticHeader,/color-mix\(in srgb,var\(--royal-header-hue\) 22%,#070e17\) 50%/);
  assert.match(staticHeader,/color-mix\(in srgb,var\(--royal-header-hue\) 67%,#9cbbc8\) (?:0|100)%/);
  assert.match(staticHeader,/pointer-events:none/);
  assert.match(shared,/\{action\}<\/header>/,'existing header actions are still separate controls');
});

test('Crystals recolour using existing independent theme controls; metal never uses them',()=>{
  assert.match(originalMenu,/--button-crystal-color:var\(--asteria-dashboard-tab/);
  assert.match(originalMenu,/--button-crystal-color:var\(--asteria-top-menu-button/);
  assert.match(theme,/var\(--button-crystal-color\)/);
  assert.match(theme,/crystal-facets\.svg/);
  assert.match(theme,/royal-crystal-sidewall\.svg/);
  assert.match(endcaps,/<linearGradient id="steel"/);
  assert.match(endcaps,/<linearGradient id="gold"/);
  assert.doesNotMatch(endcaps,/--asteria-|--button-crystal-color/,'fixed-colour metal endcaps');
  assert.doesNotMatch(endcaps,/<(?:circle|polygon)\b/i,'no extra decorative circles or star polygons');
});

test('Existing menu pressing and dashboard editing remain JavaScript-owned',()=>{
  assert.match(originalMenu,/--button-travel/);
  assert.match(originalMenu,/\[data-menu-pressed\]/);
  assert.match(theme,/prefers-reduced-motion:reduce/);
  const dashboard=read('src/components/DashboardCustomisation.jsx');
  assert.match(dashboard,/resize/i);
  assert.match(dashboard,/reorder|drag/i);
});
