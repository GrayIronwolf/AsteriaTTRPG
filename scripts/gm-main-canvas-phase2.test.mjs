import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 DASHBOARD_PANEL_REGISTRY,GM_CANVAS_DEFAULT_IDS,GM_DASHBOARD_CANVAS_CONFIG,
 defaultDashboardLayout,normalizeDashboardLayout,normalizeGMCanvasLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {
 editCombatWindow,normalizeCombatWorkspace,fitCombatCamera,
 focusCombatCamera,orderedCombatPartyIds
} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('GM canvas uses eight approved quick windows and every formerly available GM panel',()=>{
 const expected=['gmResources','combatOverview','requestsOverview','preparedOverview',
  'quickNotes','questTracker','calendarWeather','sessionOverview'];
 assert.deepEqual([...GM_CANVAS_DEFAULT_IDS],expected);
 const layout=normalizeGMCanvasLayout(null);
 assert.deepEqual(GM_DASHBOARD_CANVAS_CONFIG.ids.filter(id=>!layout.hidden.includes(id)),expected);
 assert.equal(new Set(GM_DASHBOARD_CANVAS_CONFIG.ids).size,GM_DASHBOARD_CANVAS_CONFIG.ids.length);
 assert.ok(GM_DASHBOARD_CANVAS_CONFIG.ids.length>20);
 assert.ok(DASHBOARD_PANEL_REGISTRY.gm.every(panel=>
   GM_DASHBOARD_CANVAS_CONFIG.ids.includes(panel.id)));
 assert.ok(GM_DASHBOARD_CANVAS_CONFIG.ids.every(id=>
   typeof GM_DASHBOARD_CANVAS_CONFIG.labels[id]==='string'));
 const library=GM_DASHBOARD_CANVAS_CONFIG.categories.flatMap(row=>row.panels);
 assert.equal(new Set(library).size,library.length);
 assert.deepEqual([...new Set(library)].sort(),[...GM_DASHBOARD_CANVAS_CONFIG.ids].sort());
});

test('GM canvas positions, visibility, lock and focus are allowlisted and round trip',()=>{
 const config=GM_DASHBOARD_CANVAS_CONFIG;
 const blank=normalizeGMCanvasLayout(null);
 const first=editCombatWindow(blank,'gmResources','move',{x:350,y:200},config);
 assert.deepEqual(first.freeform.positions.gmResources.x,350);
 assert.equal(editCombatWindow(blank,'controls','move',{x:50,y:50},config),blank,
   'Combat-only IDs cannot be added to GM main');
 const saved=normalizeGMCanvasLayout({...first,
   hidden:[...first.hidden,'sessionOverview','controls'],
   locked:['gmResources','controls'],minimized:['quickNotes','controls'],
   partyCardOrder:['kael','lyra']});
 assert.deepEqual(saved.hidden.includes('controls'),false);
 assert.deepEqual(saved.locked,['gmResources']);
 assert.deepEqual(saved.minimized,['quickNotes']);
 assert.equal(saved.hidden.includes('sessionOverview'),true);
 assert.deepEqual(saved.partyCardOrder,['kael','lyra']);
 assert.deepEqual(normalizeGMCanvasLayout(JSON.parse(JSON.stringify(saved))),saved);
 const ids=config.ids.filter(id=>!saved.hidden.includes(id));
 const camera=fitCombatCamera(saved,ids,1440,780);
 assert.ok(camera.scale>0);
 const focus=focusCombatCamera(saved,'gmResources',1440,780);
 assert.ok(focus.scale>=camera.scale);
 assert.deepEqual(orderedCombatPartyIds(['kael','lyra'],saved.partyCardOrder),['kael','lyra']);
});

test('Existing GM layout and named focus content remain available after canvas migration',()=>{
 const original=defaultDashboardLayout('gm');
 assert.equal(original.mode,'default');
 assert.equal(original.gmCanvas.hidden.includes('gmResources'),false);
 const legacy={...original,gmCanvas:undefined,mode:'custom',
  hidden:['loot','magicRewards','acInspector','partySummary']};
 const migrated=normalizeDashboardLayout(legacy,'gm');
 assert.equal(migrated.gmCanvas.hidden.includes('playerManagement'),false,
   'Legacy selected optional panels remain available on migration');
 assert.equal(migrated.gmCanvas.hidden.includes('loot'),true);
 assert.equal(migrated.gmCanvas.hidden.includes('gmResources'),false);
 assert.deepEqual(normalizeDashboardLayout(JSON.parse(JSON.stringify(migrated)),'gm').gmCanvas,
   migrated.gmCanvas);
 const player=normalizeDashboardLayout(defaultDashboardLayout('player'),'player');
 assert.equal('gmCanvas' in player,false,'Player and GM layouts must remain independent');
});

test('GM Main is an in-place canvas replacement, not an overlaid grid editor',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx');
 const canvas=read('src/dashboards/combat/CombatCommandCentre.jsx');
 const layout=read('src/state/dashboardLayoutModel.mjs');
 const quick=read('src/dashboards/GMDashboardQuickPanels.jsx');
 const player=read('src/dashboards/PlayerDashboardOverview.jsx');
 const auth=read('js/firebase-auth.js');
 const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
 assert.match(gm,/canvasConfig=\{GM_DASHBOARD_CANVAS_CONFIG\}/);
 assert.match(gm,/GM_DASHBOARD_CANVAS_CONFIG\.ids\.map/);
 assert.match(gm,/tab!=='combat'&&tab!=='main'/);
 assert.match(gm,/window\.AsteriaCharacterAccess\.isGM/);
 assert.doesNotMatch(gm,/DashboardLayoutWorkspace|DashboardLayoutEditor|defaultContent=/);
 assert.match(canvas,/export const CanvasWorkspace=CombatCommandCentre/);
 assert.match(canvas,/className=\{styles\.manageActions\}/);
 assert.match(canvas,/gmCanvas\?'gm-canvas-add-window':'combat-canvas-add-window'/);
 assert.match(canvas,/panelIds\.includes\(child\.props\.id\)/);
 assert.match(canvas,/panelIds\.filter\(id=>!saved\.hidden\.includes\(id\)\)/);
 assert.match(canvas,/normalizeCombatWorkspace\(value,canvasConfig\|\|undefined\)/);
 assert.match(css,/\.manageActions\{/);
 assert.match(layout,/normalizeGMCanvasLayout\(value\.gmCanvas,value\)/);
 assert.match(quick,/subscribeUniversalChecks/);
 assert.match(quick,/loadPrepared/);
 assert.match(quick,/subscribeAsteriaCalendar/);
 assert.match(quick,/subscribeWeatherReports/);
 assert.match(quick,/saveSection\('notes'/);
 assert.match(auth,/normalizeDashboardLayout\(layout,role\)/);
 assert.match(player,/<CanvasWorkspace key=\{character\.id\+':player-main-canvas'\}/);
});
