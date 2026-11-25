import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 DASHBOARD_PANEL_REGISTRY,PLAYER_CANVAS_DEFAULT_IDS,PLAYER_DASHBOARD_CANVAS_CONFIG,
 GM_DASHBOARD_CANVAS_CONFIG,defaultDashboardLayout,normalizeDashboardLayout,
 defaultPlayerCanvasLayout,normalizePlayerCanvasLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {editCombatWindow,normalizeCombatWorkspace} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Player Main canvas preserves every existing panel and the Action / Resource Log',()=>{
 const defaults=DASHBOARD_PANEL_REGISTRY.player.filter(row=>!row.optional).map(row=>row.id);
 assert.deepEqual([...PLAYER_DASHBOARD_CANVAS_CONFIG.ids].sort(),[...defaults,'activityLog'].sort());
 const layout=defaultPlayerCanvasLayout();
 assert.deepEqual(PLAYER_DASHBOARD_CANVAS_CONFIG.ids.filter(id=>!layout.hidden.includes(id)),
   PLAYER_CANVAS_DEFAULT_IDS);
 assert.equal(PLAYER_CANVAS_DEFAULT_IDS.length,8);
 assert.equal(PLAYER_DASHBOARD_CANVAS_CONFIG.ids.length,DASHBOARD_PANEL_REGISTRY.player.length+1);
 assert.equal(new Set(PLAYER_DASHBOARD_CANVAS_CONFIG.ids).size,PLAYER_DASHBOARD_CANVAS_CONFIG.ids.length);
 const library=PLAYER_DASHBOARD_CANVAS_CONFIG.categories.flatMap(group=>group.panels);
 assert.deepEqual([...new Set(library)].sort(),[...PLAYER_DASHBOARD_CANVAS_CONFIG.ids].sort());
 for(const id of PLAYER_DASHBOARD_CANVAS_CONFIG.ids){
   assert.ok(PLAYER_DASHBOARD_CANVAS_CONFIG.labels[id]);
   assert.ok(layout.freeform.positions[id],id+' has no position');
   assert.ok(layout.freeform.positions[id].y<=4500,'Position exceeds canvas storage bounds');
 }
});

test('Player canvas remains independent of GM and Combat panel allowlists',()=>{
 const player=defaultPlayerCanvasLayout(),gm=GM_DASHBOARD_CANVAS_CONFIG;
 assert.ok(!PLAYER_DASHBOARD_CANVAS_CONFIG.ids.includes('restRequests'));
 assert.ok(!PLAYER_DASHBOARD_CANVAS_CONFIG.ids.includes('gmResources'));
 assert.ok(!gm.ids.includes('activityLog'));
 assert.equal(editCombatWindow(player,'controls','move',{x:100,y:100},
   PLAYER_DASHBOARD_CANVAS_CONFIG),player);
 const edited=editCombatWindow(player,'weapons','resize',{w:720,h:490},
   PLAYER_DASHBOARD_CANVAS_CONFIG);
 assert.equal(edited.freeform.positions.weapons.w,720);
 assert.equal(edited.freeform.positions.weapons.h,490);
 assert.equal(normalizePlayerCanvasLayout(JSON.parse(JSON.stringify(edited))).freeform.positions.weapons.w,720);
 assert.equal(normalizeCombatWorkspace(null).hidden.length,7,
   'Combat defaults show eight windows; other tools remain in the library');
});

test('Legacy Player grid migration keeps hide/show, lock and desktop arrangement',()=>{
 const old=defaultDashboardLayout('player');
 const newLayout=normalizeDashboardLayout({
   ...old,mode:'custom',playerCanvas:undefined,
   hidden:old.hidden.filter(id=>id!=='combatOverview').concat('skills'),
   lockedPositions:['weapons'],
   placements:{...old.placements,weapons:{x:4,y:23,w:6,h:3}}
 },'player');
 const canvas=newLayout.playerCanvas;
 assert.equal(canvas.hidden.includes('combatOverview'),false,
   'Previously added optional panel must stay visible');
 assert.equal(canvas.hidden.includes('skills'),true,
   'Previously hidden player panel must remain hidden');
 assert.deepEqual(canvas.locked,['weapons']);
 assert.equal(canvas.freeform.positions.weapons.x,333);
 assert.equal(canvas.freeform.positions.weapons.y,2645);
 assert.equal(canvas.freeform.positions.weapons.w,500);
 assert.equal(canvas.freeform.positions.weapons.h,570);
 assert.deepEqual(normalizeDashboardLayout(JSON.parse(JSON.stringify(newLayout)),'player')
   .playerCanvas,canvas);
});

test('Owned-character settings use the current authenticated preferences, not a second Firebase store',()=>{
 const player=read('src/dashboards/PlayerDashboardOverview.jsx');
 const shell=read('src/dashboards/CharacterDashboard.jsx');
 const settings=read('src/dashboards/CharacterGallerySettings.jsx');
 const canvas=read('src/dashboards/combat/CombatCommandCentre.jsx');
 const bridge=read('src/firebase/asteriaFirebaseService.js');
 assert.match(player,/<CanvasWorkspace key=\{character\.id\+':player-main-canvas'\}/);
 assert.match(player,/canvasConfig=\{PLAYER_DASHBOARD_CANVAS_CONFIG\}/);
 assert.match(player,/canvasScopeId=\{character\.id\}/);
 assert.match(player,/canEditCanvas=\{canEditLayout\}/);
 assert.match(player,/forcedPanelIds=\{forcedPanels\}/);
 assert.match(player,/case 'activityLog':return <ActivityLog character=\{character\}/);
 assert.match(player,/firebaseService\.updateDashboardPreferences\(campaignId,character\.id,/);
 assert.match(player,/const saveQueue=useRef\(Promise\.resolve\(\)\)/);
 assert.doesNotMatch(player,/DashboardLayoutWorkspace|defaultContent=|react-player-overview-grid/);
 assert.doesNotMatch(settings,/DashboardLayoutEditor|onApply=\{applyLayout\}/);
 assert.match(settings,/Open Player Dashboard Canvas/);
 assert.doesNotMatch(shell,/<ActivityLog character=\{character\} \/>/);
 assert.match(bridge,/updateDashboardPreferences/);
 assert.match(canvas,/canEditCanvas=true/);
 assert.match(canvas,/if\(!canEditCanvas\)return/);
 assert.match(canvas,/playerCanvas\?'site-player-main-canvas'/);
 assert.match(canvas,/playerCanvas\?'player-canvas-add-window'/);
 assert.match(canvas,/asteria:player-main-canvas:v1:/);
});


test('Player add-window control opens its own first category and removes the old overview grid',()=>{
 const canvas=read('src/dashboards/combat/CombatCommandCentre.jsx');
 const css=read('src/styles/asteria-react.css');
 assert.equal(PLAYER_DASHBOARD_CANVAS_CONFIG.categories[0].id,'character');
 assert.equal(GM_DASHBOARD_CANVAS_CONFIG.categories[0].id,'core');
 assert.match(canvas,/setSelectedTools\(toolCategories\[0\]\?\.id\|\|'overview'\)/);
 assert.doesNotMatch(canvas,/setSelectedTools\('core'\);setSidebarExpanded\(true\)/);
 assert.doesNotMatch(css,/\.react-player-overview-grid\b/);
});

test('New Player layout serialises without injecting player fields into GM layouts',()=>{
 const player=normalizeDashboardLayout(defaultDashboardLayout('player'),'player');
 const gm=normalizeDashboardLayout(defaultDashboardLayout('gm'),'gm');
 assert.ok(player.playerCanvas);
 assert.equal('gmCanvas' in player,false);
 assert.ok(gm.gmCanvas);
 assert.equal('playerCanvas' in gm,false);
 assert.deepEqual(normalizePlayerCanvasLayout(JSON.parse(JSON.stringify(player.playerCanvas))),
   player.playerCanvas);
});
