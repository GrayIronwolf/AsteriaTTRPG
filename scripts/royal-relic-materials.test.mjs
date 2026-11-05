import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const shared=read('src/components/WorkspaceUI.jsx');
const styles=read('src/styles/asteria-react.css');
const vite=read('vite.config.mjs');
const entry=read('src/dev-entry.js');
const index=read('index.html');

test('Every shared Player and GM panel receives the material hook without changing its structure',()=>{
  assert.match(shared,/className=\{\`asteria-react-panel asteria-royal-relic \$\{className\}\`\.trim\(\)\}/);
  assert.match(shared,/data-panel-material="royal-relic"/);
  assert.match(shared,/export function DashboardPanel[\s\S]*?return <Panel /);
  assert.match(shared,/export const DashboardCard = Panel;/);
  assert.match(shared,/export const AsteriaPanel = Panel;/);
});

test('Royal Relic includes authentic repeatable stone and steel assets with theme-bound crystals',()=>{
  for(const filename of ['assets/ui/royal-relic-obsidian.svg','assets/ui/royal-relic-brushed-steel.svg']){
    const svg=read(filename);
    assert.match(svg,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg,/<feTurbulence/);
    assert.ok(svg.length<6000);
  }
  assert.match(styles,/Royal Relic v2/);
  assert.match(styles,/url\("\.\.\/assets\/ui\/royal-relic-obsidian\.svg"\)/);
  assert.match(styles,/url\("\.\.\/assets\/ui\/royal-relic-brushed-steel\.svg"\)/);
  assert.match(styles,/--relic-crystal: var\(--asteria-accent/);
  assert.match(styles,/react-character-dashboard \.asteria-react-panel\.asteria-royal-relic/);
  assert.match(styles,/react-gm-dashboard \.asteria-react-panel\.asteria-royal-relic/);
  assert.match(styles,/pointer-events: none;/);
});

test('No dashboard grid, resource banner, navigation or GM roster markup is modified by the material update',()=>{
  const player=read('src/dashboards/CharacterDashboard.jsx');
  const gm=read('src/dashboards/GMDashboard.jsx');
  assert.match(player,/<DashboardInformationRow /);
  assert.match(player,/<DashboardNavigation tabs=\{tabs\}/);
  assert.match(gm,/sidebar=\{<PartySidebar /);
  assert.match(gm,/<DashboardNavigation tabs=\{GM_TABS\}/);
  const materialRule=styles.slice(styles.lastIndexOf('/* Royal Relic v2'));
  assert.doesNotMatch(materialRule,/grid-template-columns|grid-column:|order:|min-height:|max-height:|width: [0-9]|padding: [0-9]/);
});

test('Production dashboard styles use a new versioned URL while remaining lazy-loaded',()=>{
  assert.match(vite,/asteria-react-royal-relic-v2\.css/);
  assert.match(entry,/react-dist\/asteria-react-royal-relic-v2\.css/);
  assert.match(index,/src\/dev-entry\.js\?v=royal-relic-panels-v2/);
  assert.match(entry,/dashboardRuntime === 'on-demand'/);
  assert.doesNotMatch(index,/<link[^>]+stylesheet[^>]+royal-relic-v2/);
});
