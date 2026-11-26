import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCombatWorkspaceLayout,fitCombatCamera,focusCombatCamera,zoomCombatCamera,
 normalizeCombatCamera,openingCombatCamera,COMBAT_CANVAS_ZOOM_MIN,COMBAT_CANVAS_ZOOM_MAX}
 from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG} from '../src/state/dashboardLayoutModel.mjs';
for(const config of [undefined,GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG]){
 test((config?.kind||'combat')+': fit, focus and opening views preserve custom geometry at each viewport',()=>{
  const layout=defaultCombatWorkspaceLayout(config),ids=Object.keys(layout.freeform.positions);
  const original=JSON.stringify(layout);
  for(const width of [700,1000,1920]){
   const view=fitCombatCamera(layout,ids,width,800),unit=width/1000*view.scale;
   for(const id of ids){const r=layout.freeform.positions[id];
    assert.ok(r.x*unit+view.x>=-1);assert.ok((r.x+r.w)*unit+view.x<=width+1);
    assert.ok(r.y*unit+view.y>=-1);assert.ok((r.y+r.h)*unit+view.y<=801);
    const focused=focusCombatCamera(layout,id,width,800),pixels=width/1000*focused.scale;
    assert.ok(Math.abs((r.x+r.w/2)*pixels+focused.x-width/2)<.01);
   }
   assert.equal(openingCombatCamera(layout,ids,width).scale,.5);
  }
  assert.equal(JSON.stringify(layout),original);
 });
}
test('minimised windows use their title footprint for fit and focus',()=>{
 const layout=defaultCombatWorkspaceLayout(),id='map';
 layout.freeform.positions[id]={x:0,y:0,w:490,h:2000};
 const full=fitCombatCamera(layout,[id],1000,700);
 layout.minimized=[id];const small=fitCombatCamera(layout,[id],1000,700);
 assert.ok(small.scale>full.scale);
 const focused=focusCombatCamera(layout,id,1000,700);
 assert.equal(focused.y,350-40*focused.scale);
});
test('pointer-relative zoom preserves the anchored world point and rejects boundary overshoot',()=>{
 for(const scale of [.04,.5,.75,1,2.5])for(const factor of [.01,.8,1.2,100]){
  const before=normalizeCombatCamera({scale,x:-150,y:240}),pivot={x:300,y:210};
  const after=zoomCombatCamera(before,scale*factor,pivot);
  assert.ok(after.scale>=COMBAT_CANVAS_ZOOM_MIN&&after.scale<=COMBAT_CANVAS_ZOOM_MAX);
  assert.ok(Math.abs((pivot.x-before.x)/before.scale-(pivot.x-after.x)/after.scale)<.00001);
  assert.ok(Math.abs((pivot.y-before.y)/before.scale-(pivot.y-after.y)/after.scale)<.00001);
 }
});
