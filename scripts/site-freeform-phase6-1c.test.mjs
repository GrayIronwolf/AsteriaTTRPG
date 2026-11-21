import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  COMBAT_PANEL_IDS,COMBAT_WORKSPACE_PRESET_LIMIT,
  applyCombatPreset,arrangeCombatWorkspace,combatWorkspaceStorageKey,
  defaultCombatWorkspaceLayout,dockCombatWindow,editCombatWindow,
  normalizeCombatWorkspace,removeCombatPreset,saveCombatPreset,setCombatGroup
} from '../frontend/src/combat/combatWorkspaceLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Phase 6.1C: allowed windows have safe default positions',()=>{
  const state=defaultCombatWorkspaceLayout();
  assert.deepEqual(Object.keys(state.freeform.positions),COMBAT_PANEL_IDS);
  assert.equal(state.freeform.snap,true);
  assert.equal(state.freeform.allowOverlap,false);
  assert.deepEqual(state.hidden,[]);
});
test('Phase 6.1C: layout imports sanitize unknown, malformed and nested data',()=>{
  const imported=normalizeCombatWorkspace({
    freeform:{positions:{unexpected:{x:0,y:0,w:1000,h:400},controls:{
      x:-900,y:90000,w:1,h:1}}},
    hidden:['unknown','actor','actor'],locked:['unknown','setup'],
    groups:[['controls','initiative','unknown']],
    savedWorkspaces:[{id:'layout-a',name:'Test',layout:{
      freeform:{positions:{actor:{x:100,y:200,w:390,h:380}}},
      savedWorkspaces:[{id:'layout-inner',name:'Malicious',layout:{}}]
    }}]
  });
  assert.deepEqual(imported.hidden,['actor']);
  assert.deepEqual(imported.locked,['setup']);
  assert.equal(imported.freeform.positions.unexpected,undefined);
  assert.equal(imported.freeform.positions.controls.x,0);
  assert.equal(imported.freeform.positions.controls.w>=140,true);
  assert.equal(imported.savedWorkspaces[0].layout.savedWorkspaces,undefined);
});
test('Phase 6.1C: locked windows cannot move, resize or dock',()=>{
  let state=defaultCombatWorkspaceLayout();
  state={...state,locked:['controls']};
  assert.equal(editCombatWindow(state,'controls','move',{x:500,y:20}),state);
  assert.equal(editCombatWindow(state,'controls','resize',{w:800,h:500}),state);
  assert.equal(dockCombatWindow(state,'controls','right'),state);
  assert.equal(editCombatWindow(state,'invalid','move',{x:100}),state);
});
test('Phase 6.1C: window editing respects collision and snapping',()=>{
  const state=defaultCombatWorkspaceLayout();
  assert.equal(editCombatWindow(state,'controls','move',{x:510,y:0}),state);
  const moved=editCombatWindow(state,'controls','move',{x:10,y:900});
  assert.notEqual(moved,state);
  assert.equal(moved.freeform.positions.controls.y,900);
  assert.equal(moved.freeform.positions.controls.x,10);
});
test('Phase 6.1C: grouping moves two windows without moving other windows',()=>{
  const state=defaultCombatWorkspaceLayout();
  const group=setCombatGroup(state,'controls','initiative');
  assert.deepEqual(group.groups,[['controls','initiative']]);
  const moved=editCombatWindow(group,'controls','move',{x:0,y:100});
  assert.equal(moved,group,'group cannot move into another window');
  const groupMoved=editCombatWindow(group,'controls','move',{x:0,y:10});
  assert.equal(groupMoved.freeform.positions.initiative.y,180);
  assert.equal(groupMoved.freeform.positions.actor.y,0);
  assert.deepEqual(setCombatGroup(groupMoved,'controls').groups,[]);
});
test('Phase 6.1C: bounded presets do not store game state and can be restored',()=>{
  let layout=defaultCombatWorkspaceLayout();
  for(let i=0;i<COMBAT_WORKSPACE_PRESET_LIMIT;i++)
    layout=saveCombatPreset(layout,'Preset '+i,'layout-'+i);
  assert.equal(layout.savedWorkspaces.length,COMBAT_WORKSPACE_PRESET_LIMIT);
  assert.equal(saveCombatPreset(layout,'Excess','layout-excess'),layout);
  const modified={...layout,hidden:['map'],locked:['actor']};
  const applied=applyCombatPreset(modified,'layout-0');
  assert.deepEqual(applied.hidden,[]);
  assert.equal(applied.savedWorkspaces.length,COMBAT_WORKSPACE_PRESET_LIMIT);
  assert.equal(removeCombatPreset(layout,'layout-0').savedWorkspaces.length,
    COMBAT_WORKSPACE_PRESET_LIMIT-1);
  const imported=normalizeCombatWorkspace({...layout,combatants:[{id:'secret'}]});
  assert.equal(imported.combatants,undefined);
});
test('Phase 6.1C: per-GM per-campaign device key is bounded and safe',()=>{
  assert.equal(combatWorkspaceStorageKey('gm-1','campaign-2'),
    'asteria:gm-combat-workspace:v1:gm-1:campaign-2');
  assert.equal(combatWorkspaceStorageKey('../gm','campaign'),null);
  assert.equal(combatWorkspaceStorageKey('gm',''),null);
});
test('Phase 6.1C: auto-arrange preserves names while exposing all windows',()=>{
  const state=normalizeCombatWorkspace({
    hidden:['map'],minimized:['actor'],
    savedWorkspaces:[{id:'layout-test',name:'Preset',layout:{}}]
  });
  const next=arrangeCombatWorkspace(state);
  assert.deepEqual(next.hidden,[]);
  assert.deepEqual(next.minimized,[]);
  assert.equal(next.savedWorkspaces[0].name,'Preset');
});
test('Phase 6.1C: React combat command centre reuses secure Firebase commands',()=>{
  const combat=read('frontend/src/combat/CombatWorkspace.jsx');
  const centre=read('frontend/src/combat/CombatCommandCentre.jsx');
  const gm=read('frontend/src/pages/GMDashboardPage.jsx');
  assert.match(combat,/api\.commandGM\(campaignId,actorId/);
  assert.match(combat,/revision:combat\.revision/);
  assert.match(combat,/data-testid="site-gm-combat-command-centre"|<CombatCommandCentre/);
  assert.match(combat,/<CombatCommandPanel id="controls">/);
  assert.match(combat,/<CombatCommandPanel id="initiative">/);
  assert.match(combat,/<CombatCommandPanel id="actor">/);
  assert.match(combat,/<CombatCommandPanel id="setup">/);
  assert.match(combat,/<CombatCommandPanel id="map">/);
  assert.match(centre,/setPointerCapture/);
  assert.match(centre,/onPointerCancel=\{end\}/);
  assert.match(centre,/localStorage\.setItem\(storageKey,JSON\.stringify\(normalized\)\)/);
  assert.match(gm,/uid=\{uid\}/);
  assert.match(gm,/mediaApi=\{mediaEnabled\?api.media:null\}/);
  assert.match(gm,/onNavigate=\{setTab\}/);
  assert.doesNotMatch(centre,/firebase\/firestore|httpsCallable|updateDoc|setDoc/);
  const css=read('frontend/src/combat/CombatCommandCentre.module.css');
  assert.doesNotMatch(css,/!\s*important|@import\b/i);
});
