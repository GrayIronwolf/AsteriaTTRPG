import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultDashboardLayout,normalizeDashboardLayout,moveDashboardGridPanel,resizeDashboardGridPanel,lockDashboardGridPanel,toggleDashboardPanel,visibleDashboardPanels} from '../src/state/dashboardLayoutModel.mjs';
import {gridRectanglesOverlap} from '../src/state/dashboardGridModel.mjs';
import {restoredGMView} from '../src/app/gmCharacterNavigation.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Player and GM layouts survive cross-device JSON round trips without moving fixed resources',()=>{
 for(const [role,id] of [['player','weapons'],['gm','xp']]){
  let layout=defaultDashboardLayout(role);
  layout=moveDashboardGridPanel(layout,role,id,0,28);
  layout=lockDashboardGridPanel(layout,role,id,true);
  const stored=JSON.parse(JSON.stringify(layout));
  const reopened=normalizeDashboardLayout(stored,role);
  assert.deepEqual(reopened.placements[id],{...layout.placements[id]});
  assert.deepEqual(reopened.lockedPositions,layout.lockedPositions);
  const ids=visibleDashboardPanels(reopened,role);
  for(const a of ids)for(const b of ids)if(a!==b)
   assert.equal(gridRectanglesOverlap(reopened.placements[a],reopened.placements[b]),false,a+' overlaps '+b);
  assert.ok(!reopened.order.includes('resources'));
  assert.ok(!reopened.order.includes('sidebar'));
 }
});

test('Optional panels persist and locked panels reject moves after reload',()=>{
 for(const [role,id,optional] of [['player','weapons','questTracker'],['gm','xp','inventoryOverview']]){
  let layout=toggleDashboardPanel(defaultDashboardLayout(role),role,optional,true);
  layout=lockDashboardGridPanel(layout,role,id,true);
  const reopened=normalizeDashboardLayout(JSON.parse(JSON.stringify(layout)),role);
  assert.ok(visibleDashboardPanels(reopened,role).includes(optional));
  assert.deepEqual(moveDashboardGridPanel(reopened,role,id,0,29).placements[id],reopened.placements[id]);
  assert.deepEqual(resizeDashboardGridPanel(reopened,role,id,8,8).placements[id],reopened.placements[id]);
 }
});

test('Account-aware React route remounts discard stale dashboard state',()=>{
 const root=read('src/app/AsteriaReactRoot.jsx');
 assert.match(root,/const \{ route, account \} = useAsteriaApp\(\)/);
 assert.match(root,/const accountScope=account\?\.user\?\.uid\|\|'signed-out'/);
 assert.match(root,/key=\{\x60\$\{accountScope\}\/\$\{route\.type\}/);
 const context=read('src/app/AsteriaAppContext.jsx');
 for(const event of ['asteria:firebase-ready','asteria:auth-changed','asteria:firebase-signed-out'])
  assert.ok(context.includes(event),event);
});

test('Player and GM saves do not mutate a replacement account or campaign',()=>{
 const player=read('src/dashboards/CharacterGallerySettings.jsx');
 assert.match(player,/firebaseService\.currentUser\(\)\?\.uid\|\|'signed-out'/);
 assert.match(player,/scopeRef\.current===savedScope&&revision\.current===savedRevision/);
 assert.match(player,/if\(!dirty\.current\)setPreferences\(saved\)/);
 const gm=read('src/dashboards/GMDashboard.jsx');
 assert.match(gm,/if\(dashboardSaveScope\.current!==subscriptionScope\)return/);
 assert.match(gm,/if\(dashboardSaveScope\.current!==saveScope\)return result/);
 assert.match(gm,/if\(dashboardSaveScope\.current!==saveScope\)return;/);
 assert.match(gm,/setDashboardSettingsMessage\(''\)/);
});

test('GM navigation restore remains scoped to authenticated campaign user',()=>{
 const context={uid:'gm-1',campaignId:'c1',tab:'settings',selectedId:'a',scrollY:100};
 const win={history:{state:{gmView:context}}};
 assert.deepEqual(restoredGMView('c1','gm-1',win),context);
 assert.deepEqual(restoredGMView('c1','gm-2',win),{});
 assert.deepEqual(restoredGMView('c2','gm-1',win),{});
});

test('Mobile editor retains focus handling, pointer cancellation, and approved artwork',()=>{
 const editor=read('src/components/DashboardCustomisation.jsx');
 assert.match(editor,/onPointerCancel=\{cancel\}/);
 assert.match(editor,/onLostPointerCapture=\{cancel\}/);
 assert.match(editor,/trapDialogTab\(e,dialogRef\.current,document\.activeElement\)/);
 const css=read('css/asteria-freeform-dashboard.css');
 assert.match(css,/min-height:44px!important/);
 for(const artwork of ['panel-frame-3x3.webp','panel-frame-6x3.webp','panel-frame-3x6.webp','panel-frame-9x3.webp'])
  assert.ok(css.includes(artwork));
});
