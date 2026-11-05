import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardGridRule,clampGridDimensions,gridRectanglesOverlap,gridRowCount} from '../src/state/dashboardGridModel.mjs';
import {defaultDashboardLayout,normalizeDashboardLayout,visibleDashboardPanels,moveDashboardGridPanel,resizeDashboardGridPanel,lockDashboardGridPanel,autoArrangeDashboardLayout} from '../src/state/dashboardLayoutModel.mjs';
test('Player and GM default panels fit 12-column square grid without overlap',()=>{
 for(const role of ['player','gm']){
  const layout=defaultDashboardLayout(role),ids=visibleDashboardPanels(layout,role);
  assert.equal(layout.version,4);
  for(const id of ids){
   const p=layout.placements[id];assert.ok(p,id);
   assert.ok(p.x>=0&&p.x+p.w<=12&&p.y>=0);
   for(const other of ids)if(id!==other)assert.equal(gridRectanglesOverlap(p,layout.placements[other]),false,id+' vs '+other);
  }
  assert.ok(gridRowCount(layout.placements,ids)>=30);
 }
});
test('Size restrictions and tall armour mode are enforced',()=>{
 assert.deepEqual(clampGridDimensions('player','armour',3,6),{w:3,h:6});
 assert.deepEqual(clampGridDimensions('player','shortcutQuest',9,7),{w:2,h:2});
 assert.deepEqual(clampGridDimensions('gm','encounter',2,2),{w:5,h:4});
 assert.equal(dashboardGridRule('gm','resources'),null);
});
test('Movement respects collisions, locks, and exact coordinates',()=>{
 let l=defaultDashboardLayout('player'),old=l.placements.weapons;
 l=moveDashboardGridPanel(l,'player','weapons',l.placements.armour.x,l.placements.armour.y);
 assert.deepEqual(l.placements.weapons,old);
 l=lockDashboardGridPanel(l,'player','weapons',true);
 l=moveDashboardGridPanel(l,'player','weapons',0,24);
 assert.deepEqual(l.placements.weapons,old);
 l=lockDashboardGridPanel(l,'player','weapons',false);
 l=moveDashboardGridPanel(l,'player','weapons',0,24);
 assert.equal(l.placements.weapons.y,24);
 l=autoArrangeDashboardLayout(l,'player');
 assert.ok(l.placements.weapons);
});
test('Saved custom size presets migrate and reject collisions and unknown ids',()=>{
 let l=normalizeDashboardLayout({version:3,mode:'custom',order:['armour','weapons','resources'],sizes:{armour:'6x3'},
  placements:{armour:{x:0,y:0,w:4,h:4},weapons:{x:0,y:0,w:3,h:3}},
  backgroundStyle:'slate'},'player');
 assert.equal(l.placements.armour.w,4);
 assert.equal(gridRectanglesOverlap(l.placements.armour,l.placements.weapons),false);
 assert.equal(Object.hasOwn(l.placements,'resources'),false);
 assert.equal(l.backgroundStyle,'slate');
});
