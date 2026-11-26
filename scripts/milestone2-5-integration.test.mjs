import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaultCombatWorkspaceLayout,editCombatWindow,dockCombatWindow} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG,normalizeDashboardLayout} from '../src/state/dashboardLayoutModel.mjs';
for(const config of [GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG]){
 test(config.kind+': required windows remain editable, scoped and collision-safe',()=>{
  const layout=defaultCombatWorkspaceLayout(config),id=config.ids[0];layout.hidden=[id];
  assert.equal(editCombatWindow(layout,id,'move',{x:50,y:60},config),layout);
  const moved=editCombatWindow(layout,id,'move',{x:50,y:60},config,[id]);
  assert.equal(moved.freeform.positions[id].x,50);assert.deepEqual(moved.hidden,[id]);
  layout.canvasLocked=true;
  assert.equal(editCombatWindow(layout,id,'move',{x:80},config,[id]),layout);
  assert.equal(dockCombatWindow(layout,id,'left',config,[id]),layout);
  assert.equal(editCombatWindow(layout,'unapproved','move',{x:80},config,['unapproved']),layout);
  layout.canvasLocked=false;layout.freeform.allowOverlap=false;
  const other=config.ids[1],r=layout.freeform.positions[other];
  assert.equal(editCombatWindow(layout,id,'move',{x:r.x,y:r.y},config,[id,other]),layout,
   'a required visible neighbour still participates in collision checks');
  assert.notEqual(editCombatWindow(layout,id,'move',{x:r.x,y:r.y},config,[id]),layout,
   'a suppressed neighbour cannot block a visible window');
 });
}
// Run the existing GM callback with controlled backend completion, including its
// real serial queue. No source regex is used as the behavioural assertion.
const source=fs.readFileSync('src/dashboards/GMDashboard.jsx','utf8');
const body=source.match(/const saveGMCanvas=(async canvas=>\{[\s\S]*?\n  \});\n  const gmCanvasLayout/)[1];
const canvasModule=await import('../src/state/dashboardLayoutModel.mjs');
function gmSaveFixture(){
 const initial=normalizeDashboardLayout(null,'gm');
 const state={layout:initial,error:'',saving:false},pending=[];
 const scope={current:'campaign:owner'},focus={current:false},chain={current:Promise.resolve()};
 const status={current:{pending:0,version:0,confirmed:null}};
 const args={accountUid:'owner',dashboardLayoutReady:true,campaignId:'campaign',savedDashboardLayout:initial,
  normalizeDashboardLayout,normalizeGMCanvasLayout:canvasModule.normalizeGMCanvasLayout,
  dashboardSaveScope:scope,focusSavePending:focus,canvasSaveChain:chain,canvasSaveStatus:status,
  setSavedDashboardLayout:value=>{state.layout=typeof value==='function'?value(state.layout):value;},
  setDashboardLayoutError:value=>{state.error=value;},setSavingDashboardSettings:value=>{state.saving=value;},
  firebaseService:{saveUserDashboardLayout:()=>new Promise(resolve=>pending.push(resolve))}};
 const save=new Function(...Object.keys(args),'return ('+body+');')(...Object.values(args));
 return {save,state,pending,scope,focus,status,initial};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('GM queue stays busy through every write and an older failure cannot overwrite a newer success',async()=>{
 const f=gmSaveFixture(),a={...f.initial.gmCanvas,defaultContentSizing:'fixed'},b={...a,defaultContentSizing:'proportional'};
 const first=f.save(a),second=f.save(b);await tick();assert.equal(f.pending.length,1);
 assert.deepEqual(f.state.layout,f.initial,'the canvas, not a second parent layer, owns optimistic geometry');
 f.pending[0]({ok:false,error:'old write failed'});await first;await tick();
 assert.equal(f.pending.length,2);assert.equal(f.state.saving,true);assert.equal(f.focus.current,true);
 f.pending[1]({ok:true});await second;
 assert.equal(f.state.layout.gmCanvas.defaultContentSizing,'proportional');
 assert.equal(f.state.error,'');assert.equal(f.state.saving,false);assert.equal(f.focus.current,false);
});
test('GM queue restores confirmed preferences if every write fails',async()=>{
 const f=gmSaveFixture();const first=f.save({...f.initial.gmCanvas,defaultContentSizing:'fixed'});
 const second=f.save({...f.initial.gmCanvas,defaultContentSizing:'proportional'});await tick();
 f.pending[0]({ok:false});await first;await tick();f.pending[1]({ok:false,error:'last failure'});await second;
 assert.deepEqual(f.state.layout,f.initial);assert.equal(f.state.error,'last failure');assert.equal(f.status.current.pending,0);
});
test('GM save completion respects account/campaign changes and pending Focus saves',async()=>{
 const f=gmSaveFixture();f.focus.current=true;
 assert.equal((await f.save(f.initial.gmCanvas)).ok,false);assert.equal(f.pending.length,0);
 f.focus.current=false;const save=f.save({...f.initial.gmCanvas,defaultContentSizing:'fixed'});await tick();
 f.scope.current='new-campaign:new-owner';f.state.saving=true;f.focus.current=true;
 f.pending[0]({ok:true});assert.equal((await save).ok,false);
 assert.deepEqual(f.state.layout,f.initial);assert.equal(f.state.saving,true);assert.equal(f.focus.current,true);
});
