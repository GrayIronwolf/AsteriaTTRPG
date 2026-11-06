import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dashboardPointerProposal} from '../src/state/dashboardGridModel.mjs';
import {
 defaultDashboardLayout, dashboardGridCandidateIsFree, lockDashboardGridPanel,
 toggleDashboardPanel,moveDashboardGridPanel,resizeDashboardGridPanel
} from '../src/state/dashboardLayoutModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Player and GM grid previews reject collisions and accept legal moves',()=>{
 for(const [role,id,blocker] of [['player','weapons','armour'],['gm','xp','encounter']]){
  const layout=defaultDashboardLayout(role),original=layout.placements[id];
  const overlapping={...original,x:layout.placements[blocker].x,y:layout.placements[blocker].y};
  assert.equal(dashboardGridCandidateIsFree(layout,role,id,overlapping),false);
  assert.deepEqual(moveDashboardGridPanel(layout,role,id,overlapping.x,overlapping.y).placements[id],original);
  const free={...original,x:0,y:25};
  assert.equal(dashboardGridCandidateIsFree(layout,role,id,free),true);
  assert.deepEqual(moveDashboardGridPanel(layout,role,id,0,25).placements[id],free);
  const locked=lockDashboardGridPanel(layout,role,id,true);
  assert.equal(dashboardGridCandidateIsFree(locked,role,id,free),false);
  const removed=toggleDashboardPanel(layout,role,id,false);
  assert.equal(dashboardGridCandidateIsFree(removed,role,id,free),false);
  assert.equal(dashboardGridCandidateIsFree(layout,role,id,{...free,x:12}),false);
  assert.equal(dashboardGridCandidateIsFree(layout,role,'resources',free),false);
 }
});

test('Resizing previews use the same legal bounds and collisions as the reducer',()=>{
 const layout=defaultDashboardLayout('player');
 const p=layout.placements.weapons;
 const bigger=dashboardPointerProposal('player','weapons',p,'resize',1,1);
 assert.equal(dashboardGridCandidateIsFree(layout,'player','weapons',bigger),
   JSON.stringify(resizeDashboardGridPanel(layout,'player','weapons',bigger.w,bigger.h).placements.weapons)!==JSON.stringify(p));
 const enabled=toggleDashboardPanel(layout,'player','shortcutInventory',true);
 const fixed=enabled.placements.shortcutInventory;
 assert.equal(dashboardGridCandidateIsFree(enabled,'player','shortcutInventory',fixed),true);
 assert.equal(dashboardGridCandidateIsFree(enabled,'player','shortcutInventory',{...fixed,w:3}),false);
});

test('Editor announces rejected pointer, numeric and keyboard placements',()=>{
 const source=read('src/components/DashboardCustomisation.jsx');
 assert.match(source,/dashboardGridCandidateIsFree\(layout,role,g\.id,next\)/);
 assert.match(source,/dashboardGridCandidateIsFree\(layout,role,id,next\)/);
 assert.match(source,/dashboardGridCandidateIsFree\(layout,role,activeSelected,proposed\)/);
 assert.match(source,/aria-live="polite"/);
 assert.match(source,/setPreview\(valid\?\{id:g\.id,rect:next\}:null\)/);
});

test('Player and GM settings preserve unsaved edits until a successful current-scope save',()=>{
 const player=read('src/dashboards/CharacterGallerySettings.jsx');
 assert.match(player,/if\(scopeRef\.current===scope&&!dirty\.current\)setPreferences\(saved\)/);
 assert.match(player,/const edit=change=>\{dirty\.current=true;revision\.current\+\+/);
 assert.match(player,/scopeRef\.current===savedScope&&revision\.current===savedRevision/);
 assert.match(player,/Discard Unsaved Changes/);
 const gm=read('src/dashboards/GMDashboard.jsx');
 assert.match(gm,/dashboardDraftRevision\.current===saveRevision/);
 assert.match(gm,/dashboardSaveScope\.current!==saveScope/);
 assert.match(gm,/if\(dashboardSaveScope\.current!==saveScope\)return result/);
});
