import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DASHBOARD_PANEL_REGISTRY,PLAYER_CANVAS_DEFAULT_IDS,PLAYER_DASHBOARD_CANVAS_CONFIG,
  defaultPlayerCanvasLayout,normalizePlayerCanvasLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {defaultGMCanvasLayout} from '../src/state/dashboardLayoutModel.mjs';
import {defaultCombatWorkspaceLayout} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Player seven-window default combines weapons and armour without changing window dimensions',()=>{
  const layout=defaultPlayerCanvasLayout();
  assert.equal(PLAYER_CANVAS_DEFAULT_IDS.length,7);
  assert.deepEqual(PLAYER_CANVAS_DEFAULT_IDS,
    ['armour','quick','talents','spells','conditions','quests','party']);
  assert.equal(PLAYER_DASHBOARD_CANVAS_CONFIG.ids.includes('weapons'),false);
  assert.equal(DASHBOARD_PANEL_REGISTRY.player.some(row=>row.id==='weapons'),true,\n    'Retain the old identifier for legacy grid preferences only');
  assert.deepEqual(layout.freeform.positions.armour,
    {x:0,y:0,w:235,h:360});
  assert.equal(Object.keys(layout.freeform.positions)
    .filter(id=>!layout.hidden.includes(id)).length,7);
  const player=source('src/dashboards/PlayerDashboardOverview.jsx');
  assert.match(player,/title="Equipment, Armour & Weapons"/);
  assert.match(player,/react-overview-combined-weapons/);
  assert.match(player,/\['Main Weapon','Secondary Weapon','Off-Hand','Quiver'\]/);
  assert.doesNotMatch(player,/case 'weapons'/);
});

test('old standalone weapons preferences cannot create a duplicate window',()=>{
  const base=defaultPlayerCanvasLayout();
  const saved={...base,
    hidden:['armour','quick'],
    freeform:{...base.freeform,positions:{...base.freeform.positions,
      weapons:{x:500,y:900,w:400,h:420}}}};
  const updated=normalizePlayerCanvasLayout(saved);
  assert.equal(updated.hidden.includes('armour'),false,
    'Previously visible weapons restore the combined equipment window');
  assert.equal(Object.hasOwn(updated.freeform.positions,'weapons'),false);
  assert.deepEqual(updated.freeform.positions.armour,base.freeform.positions.armour);
});

test('GM and Combat canvas window geometry remains unchanged',()=>{
  const gm=defaultGMCanvasLayout(),combat=defaultCombatWorkspaceLayout();
  assert.deepEqual(gm.freeform.positions.gmResources,{x:0,y:0,w:490,h:670});
  assert.deepEqual(combat.freeform.positions.enemyTracker,{x:510,y:0,w:245,h:710});
});

test('shared header fold is accessible, conditional and never removes header navigation',()=>{
  const component=source('src/components/DashboardHeaderFold.jsx');
  const html=source('index.html');
  const css=source('src/styles/asteria-react.css');
  const player=source('src/dashboards/CharacterDashboard.jsx');
  const gm=source('src/dashboards/GMDashboard.jsx');
  assert.match(html,/id="globalNavigation"/);
  assert.match(component,/aria-controls="globalNavigation"/);
  assert.match(component,/aria-expanded=\{expanded\}/);
  assert.match(component,/document\.documentElement/);
  assert.match(component,/useEffect/);
  assert.match(css,/data-asteria-dashboard-header='collapsed'/);
  assert.match(css,/position:fixed!important/);
  assert.match(player,/<DashboardHeaderFold scope="player"\/>/);
  assert.match(gm,/<DashboardHeaderFold scope="gm"\/>/);
});

test('canvas viewport is wide, taller on desktop and does not resize windows',()=>{
  const canvas=source('src/dashboards/combat/CombatCommandCentre.jsx');
  const css=source('src/dashboards/combat/CombatCommandCentre.module.css');
  const siteCss=source('src/styles/asteria-react.css');
  assert.match(canvas,/Math\.max\(800,Math\.floor\(scrollArea\.clientHeight/);
  assert.match(canvas,/--combat-edge-left','0px'/);
  assert.match(canvas,/restoredCamera=storedCamera&&storedCamera\.scale>=\.25/);
  assert.match(canvas,/Apply Recommended Arrangement \(keep window sizes\)/);
  assert.match(canvas,/x:defaults\.freeform\.positions\[id\]\.x/);
  assert.match(canvas,/y:defaults\.freeform\.positions\[id\]\.y/);
  assert.match(canvas,/data-testid="site-canvas-opening-zoom"/);
  assert.match(css,/\.canvas\{position:relative;container-type:inline-size;min-width:0;width:100%/);
  assert.match(siteCss,/\.asteria-canvas-workspace-mode \.react-workspace-main/);
  assert.match(siteCss,/grid-template-columns:56px minmax\(0,1fr\)/);
});

test('non-canvas forms receive their own responsive sizing policy',()=>{
  const css=source('src/styles/asteria-react.css');
  assert.match(css,/react-character-dashboard:not\(\.asteria-canvas-workspace-mode\)/);
  assert.match(css,/max-width:1120px/);
  assert.match(css,/max-width:1200px/);
});
