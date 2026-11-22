import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GM_DASHBOARD_CATEGORIES,PLAYER_DASHBOARD_CATEGORIES,
  dashboardTabs,dashboardMenu,dashboardCategoryForPage
} from '../src/state/dashboardMenuModel.mjs';
import {
  COMBAT_PANEL_IDS,COMBAT_PANEL_LABELS,COMBAT_TOOL_CATEGORIES,
  defaultCombatWorkspaceLayout,normalizeCombatWorkspace,
  editCombatWindow,saveCombatPreset,applyCombatPreset,arrangeCombatWorkspace
} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {freeformOverlaps} from '../src/state/workspaceFreeformModel.mjs';

const source=path=>readFileSync(path,'utf8');
const unique=items=>new Set(items).size===items.length;

test('approved hybrid dashboard menus preserve every GM and player destination',()=>{
  assert.equal(GM_DASHBOARD_CATEGORIES.length,7);
  assert.equal(PLAYER_DASHBOARD_CATEGORIES.length,7);
  const gm=dashboardTabs('gm'),player=dashboardTabs('player');
  assert.equal(gm.length,25);
  assert.equal(player.length,21);
  assert.ok(unique(gm.map(item=>item.id)));
  assert.ok(unique(player.map(item=>item.id)));
  assert.equal(dashboardCategoryForPage('gm','combat'),'combat');
  assert.equal(dashboardCategoryForPage('gm','encounter-rewards'),'combat');
  assert.equal(dashboardCategoryForPage('player','inventory'),'inventory');
  assert.equal(dashboardCategoryForPage('player','settings'),'settings');
  for(const role of ['gm','player']){
    const groups=dashboardMenu(role);
    const allowed=new Set(dashboardTabs(role).map(row=>row.id));
    assert.deepEqual(groups.flatMap(group=>group.items.map(item=>item.id)),[...allowed]);
  }
});

test('unassigned player filters campaign-only cards without dangling categories',()=>{
  const allowed=dashboardTabs('player').map(page=>page.id).filter(id=>
    !['quest','information','party','crafting','battle-maps','asteria-calendar',
      'weather-environment','world-atlas'].includes(id));
  const groups=dashboardMenu('player',allowed);
  assert.ok(groups.every(group=>group.items.length));
  assert.ok(groups.every(group=>group.items.every(item=>allowed.includes(item.id))));
  assert.equal(groups.flatMap(group=>group.items).some(item=>item.id==='quest'),false);
  assert.equal(groups.some(group=>group.id==='dashboard'),true);
  assert.equal(groups.some(group=>group.id==='character'),true);
});

test('React/Vite replaces top-level flat tabs with header-style card menus',()=>{
  const gm=source('src/dashboards/GMDashboard.jsx');
  const player=source('src/dashboards/CharacterDashboard.jsx');
  const shared=source('src/components/WorkspaceUI.jsx');
  const menu=source('src/components/DashboardNavigation.jsx');
  const css=source('src/components/DashboardNavigation.module.css');
  assert.match(gm,/dashboardTabs\('gm'\)/);
  assert.match(player,/dashboardTabs\('player'\)/);
  assert.match(shared,/export \{DashboardNavigation\} from '\.\/DashboardNavigation.jsx'/);
  assert.doesNotMatch(shared,/export const DashboardNavigation = Tabs/);
  assert.match(menu,/data-testid="asteria-dashboard-card-dropdown"/);
  assert.match(menu,/aria-expanded/);
  assert.match(menu,/aria-pressed/);
  assert.match(menu,/Escape/);
  assert.match(menu,/dashboardMenu\(role,allowed\)/);
  assert.match(css,/\.card\{/);
  assert.match(css,/\.dropdown\{/);
  assert.match(source('src/state/gmToolkitModel.mjs'),
    /label:'Combat Command Centre',tab:'combat'/);
});

test('dashboard main menu reuses approved header frame, crystal and press states',()=>{
  const menu=source('src/components/DashboardNavigation.jsx');
  const css=source('src/components/DashboardNavigation.module.css');
  const header=source('index.html');
  const frame=source('css/asteria-button-images.css');
  const shared=source('css/asteria-menu-buttons.css');
  // This is the same class and size family used by live Asteria header buttons.
  assert.match(header,/crystal-button asteria-menu-button/);
  assert.match(menu,/className=\{'asteria-menu-button '\+styles\.category/);
  assert.match(menu,/className=\{'asteria-menu-button '\+styles\.searchButton/);
  assert.equal((menu.match(/data-asteria-button-size="standard"/g)||[]).length,2);
  assert.ok(menu.includes("(current?' active':'')"),'Selected categories must keep crystal active state');
  assert.match(frame,/button-standard-frame\.webp/);
  assert.match(frame,/button-standard-crystal\.webp/);
  assert.match(shared,/--asteria-dashboard-tab/);
  assert.doesNotMatch(css,/\.category,\.searchButton\{[^}]*background:/);
});

test('combat launcher keeps all tools attached to one window system',()=>{
  assert.equal(COMBAT_PANEL_IDS.length,13);
  assert.ok(unique(COMBAT_PANEL_IDS));
  assert.ok(COMBAT_PANEL_IDS.every(id=>Boolean(COMBAT_PANEL_LABELS[id])));
  const groups=COMBAT_TOOL_CATEGORIES.flatMap(group=>group.panels);
  assert.equal(groups.length,COMBAT_PANEL_IDS.length);
  assert.ok(unique(groups));
  assert.ok(groups.every(id=>COMBAT_PANEL_IDS.includes(id)));
  const workspace=source('src/dashboards/combat/CombatWorkspace.jsx');
  const command=source('src/dashboards/combat/CombatCommandCentre.jsx');
  for(const id of COMBAT_PANEL_IDS)
    assert.ok(workspace.includes('<CombatCommandPanel id="'+id+'">'),id);
  assert.match(command,/COMBAT_TOOL_CATEGORIES\.map/);
  assert.match(command,/onPointerMove=\{move\}/);
  assert.match(command,/setPreference\(previous=>/);
  assert.match(workspace,/<PreparedEncounterLibrary/);
  assert.equal((workspace.match(/<PreparedEncounterLibrary/g)||[]).length,1);
  assert.equal((workspace.match(/<GMAdvancedCombatControls/g)||[]).length,1);
});

test('combat default layout keeps every possible window out of overlap',()=>{
  const layout=defaultCombatWorkspaceLayout();
  for(let i=0;i<COMBAT_PANEL_IDS.length;i++)
    for(let j=i+1;j<COMBAT_PANEL_IDS.length;j++){
      const a=COMBAT_PANEL_IDS[i],b=COMBAT_PANEL_IDS[j];
      assert.equal(freeformOverlaps(layout.freeform.positions[a],layout.freeform.positions[b]),false,
        a+' overlaps '+b);
    }
  assert.equal(layout.hidden.includes('prepared'),false);
  assert.equal(layout.hidden.includes('queue'),false);
  assert.equal(layout.hidden.includes('timer'),false);
  assert.equal(layout.hidden.includes('advanced'),true);
  assert.equal(layout.hidden.includes('setup'),true);
});

test('existing GM saved combat layouts preserve six previous window positions',()=>{
  const original=defaultCombatWorkspaceLayout();
  const legacyIds=['controls','initiative','actor','setup','map','history'];
  const legacyPositions=Object.fromEntries(legacyIds.map(id=>[id,original.freeform.positions[id]]));
  const old=normalizeCombatWorkspace({
    hidden:[],locked:['history'],
    freeform:{enabled:true,positions:legacyPositions}
  });
  for(const id of legacyIds){
    assert.deepEqual(old.freeform.positions[id],legacyPositions[id],id);
    assert.equal(old.hidden.includes(id),false,'Pre-existing window hidden: '+id);
  }
  assert.equal(old.locked.includes('history'),true);
  assert.equal(old.hidden.includes('advanced'),true);
  assert.equal(old.hidden.includes('queue'),false);
  assert.equal(old.hidden.includes('prepared'),false);
  for(const newId of COMBAT_PANEL_IDS.filter(id=>!legacyIds.includes(id)))
    for(const oldId of legacyIds){
      assert.equal(freeformOverlaps(old.freeform.positions[newId],old.freeform.positions[oldId]),false,
        newId+' overlaps previously saved '+oldId);
    }
});

test('saved combat presets retain hidden window choices and drag constraints',()=>{
  const base=defaultCombatWorkspaceLayout();
  const cleared={...base,hidden:base.hidden.filter(id=>id!=='setup')};
  const saved=saveCombatPreset(cleared,'Boss Battle','layout-abc');
  const after=applyCombatPreset({...base,savedWorkspaces:saved.savedWorkspaces},'layout-abc');
  assert.equal(after.hidden.includes('setup'),false);
  const restore=arrangeCombatWorkspace(after);
  assert.equal(restore.hidden.includes('setup'),false);
  const refused=editCombatWindow(restore,'setup','move',{x:0,y:0});
  assert.equal(refused,restore,'Collision with controls must not be allowed');
});
