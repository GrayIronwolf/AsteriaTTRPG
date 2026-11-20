import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DASHBOARD_SAVED_WORKSPACES_LIMIT,defaultDashboardLayout,
  normalizeDashboardLayout,saveNamedDashboardWorkspace,restoreNamedDashboardWorkspace,
  deleteNamedDashboardWorkspace,dashboardLayoutForViewport,setDashboardViewportLayout
} from '../src/state/dashboardLayoutModel.mjs';
import {normalizeFreeformWorkspace} from '../src/state/workspaceFreeformModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Phase 6.1B: named Player and GM layouts preserve their previous grid and freeform settings',()=>{
  for(const role of ['player','gm']){
    const base=defaultDashboardLayout(role),id=base.order[0];
    const freeform=normalizeFreeformWorkspace({
      enabled:true,snap:false,allowOverlap:true,positions:{
        [id]:{x:550,y:250,w:360,h:410}
      }
    },base.placements,base.order);
    const custom=normalizeDashboardLayout({...base,freeform},role);
    const named=saveNamedDashboardWorkspace(custom,role,'  Dungeon   Combat  ','workspace-1');
    assert.equal(named.savedWorkspaces[0].name,'Dungeon Combat');
    assert.equal(named.savedWorkspaces[0].layout.freeform.positions[id].x,550);
    assert.equal(named.savedWorkspaces[0].layout.freeform.positions[id].h,410);
    assert.equal(named.savedWorkspaces[0].layout.savedWorkspaces,undefined);
    assert.deepEqual(named.placements,base.placements);
    const original=normalizeDashboardLayout(JSON.parse(JSON.stringify(named)),role);
    const altered={...original,freeform:{...original.freeform,enabled:false}};
    const restored=restoreNamedDashboardWorkspace(altered,role,'workspace-1');
    assert.equal(restored.freeform.enabled,true);
    assert.deepEqual(restored.savedWorkspaces,original.savedWorkspaces);
  }
});
test('Phase 6.1B: saved layouts are bounded and reject duplicated, unknown or nested data',()=>{
  let layout=defaultDashboardLayout('player');
  for(let i=0;i<DASHBOARD_SAVED_WORKSPACES_LIMIT;i++){
    layout=saveNamedDashboardWorkspace(layout,'player','Layout '+i,'workspace-'+i);
  }
  assert.equal(layout.savedWorkspaces.length,DASHBOARD_SAVED_WORKSPACES_LIMIT);
  assert.deepEqual(saveNamedDashboardWorkspace(layout,'player','Another','workspace-extra'),layout);
  assert.deepEqual(saveNamedDashboardWorkspace(layout,'player','Layout 0','workspace-other'),layout);
  const malicious=normalizeDashboardLayout({...layout,savedWorkspaces:[
    {id:'workspace-danger',name:'Danger',layout:{
      ...layout,order:['unknown-panel','weapons'],
      savedWorkspaces:[{id:'nested',name:'Nested',layout}]}}
  ]},'player');
  assert.equal(malicious.savedWorkspaces.length,1);
  assert.equal(malicious.savedWorkspaces[0].layout.savedWorkspaces,undefined);
  assert.equal(malicious.savedWorkspaces[0].layout.order.includes('unknown-panel'),false);
  assert.equal(malicious.order.includes('unknown-panel'),false);
});
test('Phase 6.1B: deleting a named layout does not remove gameplay or active panel positions',()=>{
  const original=defaultDashboardLayout('gm');
  const saved=saveNamedDashboardWorkspace(original,'gm','Preparation','workspace-prepare');
  const deleted=deleteNamedDashboardWorkspace(saved,'gm','workspace-prepare');
  assert.equal(deleted.savedWorkspaces,undefined);
  assert.deepEqual(deleted.placements,original.placements);
  assert.deepEqual(deleted.order,original.order);
});
test('Phase 6.1B: named presets retain independent viewport preferences',()=>{
  const original=defaultDashboardLayout('player'),id=original.order[0];
  const mobile={...original,freeform:normalizeFreeformWorkspace({
    enabled:true,positions:{[id]:{x:0,y:900,w:500,h:300}}
  },original.placements,original.order)};
  const withMobile=setDashboardViewportLayout(original,'player','mobile',mobile);
  const stored=saveNamedDashboardWorkspace(withMobile,'player','Mobile','workspace-mobile');
  const restored=restoreNamedDashboardWorkspace(stored,'player','workspace-mobile');
  assert.deepEqual(dashboardLayoutForViewport(restored,'player','mobile').freeform.positions[id],
    mobile.freeform.positions[id]);
  assert.equal(dashboardLayoutForViewport(restored,'player','desktop').freeform,undefined);
});
test('Phase 6.1B: GM named layouts do not clear existing private GM Focus Modes',()=>{
  const base=defaultDashboardLayout('gm');
  const withFocus={...base,focusModes:[{id:'focus-a',name:'Combat',layout:base}]};
  const saved=saveNamedDashboardWorkspace(withFocus,'gm','New Workspace','workspace-gm');
  assert.equal(saved.focusModes.length,1);
  assert.equal(saved.savedWorkspaces[0].layout.focusModes,undefined);
  const restored=restoreNamedDashboardWorkspace(saved,'gm','workspace-gm');
  assert.equal(restored.focusModes.length,1);
});
test('Phase 6.1B: dashboard direct-edit actions are owned by the existing permissioned manager',()=>{
  const manager=read('frontend/src/layout/DashboardLayoutManager.jsx');
  const workspace=read('frontend/src/layout/DashboardLayoutWorkspace.jsx');
  assert.match(manager,/if\(!owner&&!isGM\)/);
  assert.match(manager,/if\(!available\|\|!uid\)/);
  assert.match(manager,/data-testid="site-direct-layout-save"/);
  assert.match(manager,/createLayoutHistory\(ready,role\)/);
  assert.match(manager,/await save\(directHistory\.present,baseline\)/);
  assert.match(manager,/layoutFingerprint\(server,role\)!==layoutFingerprint\(baseline,role\)/);
  assert.match(workspace,/editing=false,onLayoutChange=null/);
  assert.match(workspace,/editFreeformWorkspace\(/);
  assert.match(workspace,/setPointerCapture/);
  assert.match(workspace,/renderPanel\(id\)/);
  assert.match(workspace,/inert=\{minimized\?true:undefined\}/);
  assert.match(workspace,/onPointerCancel=\{pointerEnd\}/);
});
test('Phase 6.1B: implementation remains scoped to React components without unsafe overrides',()=>{
  const css=[
    read('frontend/src/layout/DashboardLayoutManager.module.css'),
    read('frontend/src/layout/DashboardLayoutWorkspace.module.css')
  ].join('\n');
  assert.doesNotMatch(css,/!\s*important/i);
  assert.doesNotMatch(css,/@import\b/i);
});
