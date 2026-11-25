import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCombatWorkspaceLayout,normalizeCombatWorkspace,editCombatWindow,
 combatWindowSizeLimits,combatWindowAlignment} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG} from '../src/state/dashboardLayoutModel.mjs';

for(const config of [undefined,GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG]){
 test((config?.kind||'combat')+': every window has usable resize limits without migrating saved dimensions',()=>{
  const base=defaultCombatWorkspaceLayout(config),layout={...base,hidden:[]};
  for(const [id,before] of Object.entries(layout.freeform.positions)){
   const limits=combatWindowSizeLimits(id,config);
   const minimum=editCombatWindow(layout,id,'resize',{w:1,h:1},config).freeform.positions[id];
   assert.equal(minimum.w,limits.minW,id);assert.equal(minimum.h,limits.minH,id);
   const maximum=editCombatWindow(layout,id,'resize',{w:10000,h:10000},config).freeform.positions[id];
   assert.equal(maximum.w,Math.max(limits.maxW,before.w));
   assert.equal(maximum.h,Math.max(limits.maxH,before.h));
   const northWest=editCombatWindow(layout,id,'resize',{
    x:before.x+10000,y:before.y+10000,w:1,h:1},config).freeform.positions[id];
   assert.equal(northWest.x+northWest.w,before.x+before.w,'right edge must stay anchored');
   assert.equal(northWest.y+northWest.h,before.y+before.h,'bottom edge must stay anchored');
   const legacy={...layout,freeform:{...layout.freeform,positions:{...layout.freeform.positions,
    [id]:{x:-200,y:4000,w:145,h:125}}}};
   assert.deepEqual(normalizeCombatWorkspace(legacy,config).freeform.positions[id],legacy.freeform.positions[id]);
  }
 });
 test((config?.kind||'combat')+': content behaviour normalizes, round trips and rejects unknown window IDs',()=>{
  const initial=defaultCombatWorkspaceLayout(config),id=Object.keys(initial.freeform.positions)[0];
  for(const mode of ['responsive','proportional','fixed']){
   const saved=normalizeCombatWorkspace({...initial,defaultContentSizing:mode,
    contentSizing:{[id]:mode,unauthorised:'fixed'},contentScale:{[id]:1.3}},config);
   assert.equal(saved.defaultContentSizing,mode);assert.equal(saved.contentSizing[id],mode);
   assert.equal(saved.contentSizing.unauthorised,undefined);
   assert.equal(saved.contentScale[id],1.3);
   assert.deepEqual(saved.freeform.positions,initial.freeform.positions);
   assert.deepEqual(normalizeCombatWorkspace(JSON.parse(JSON.stringify(saved)),config),saved);
  }
  const invalid=normalizeCombatWorkspace({...initial,defaultContentSizing:'unsafe',contentSizing:{[id]:'unsafe'}},config);
  assert.equal(invalid.defaultContentSizing,'responsive');assert.deepEqual(invalid.contentSizing,{});
 });
}

test('group movement does not magnetically align a window to its own moving companion',()=>{
 const initial=defaultCombatWorkspaceLayout();
 const layout={...initial,hidden:Object.keys(initial.freeform.positions).filter(id=>!['controls','initiative'].includes(id)),
  groups:[['controls','initiative']]};
 assert.deepEqual(combatWindowAlignment(layout,'controls',{
  x:layout.freeform.positions.initiative.x+3,y:layout.freeform.positions.initiative.y+3},{snap:true}).guides,[]);
});
