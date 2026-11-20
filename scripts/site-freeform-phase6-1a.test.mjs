import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultDashboardLayout,normalizeDashboardLayout,dashboardLayoutForViewport,
  setDashboardViewportLayout,visibleDashboardPanels
} from '../src/state/dashboardLayoutModel.mjs';
import {
  FREEFORM_MIN_WIDTH,FREEFORM_MAX_HEIGHT,normalizeFreeformRect,
  normalizeFreeformWorkspace,editFreeformWorkspace,freeformOverlaps,
  freeformCanvasHeight
} from '../src/state/workspaceFreeformModel.mjs';
import {
  createLayoutHistory,pushLayoutHistory,undoLayoutHistory,redoLayoutHistory
} from '../frontend/src/layout/layoutHistoryModel.mjs';

const make=(role='gm')=>{
  const original=defaultDashboardLayout(role);
  const panelIds=original.order;
  return {...original,freeform:normalizeFreeformWorkspace({
    enabled:true,snap:false,allowOverlap:false
  },original.placements,panelIds)};
};
test('Phase 6.1A leaves all original saved dashboards unchanged until freeform is opted in',()=>{
  for(const role of ['player','gm']){
    const original=defaultDashboardLayout(role);
    const legacy=normalizeDashboardLayout(JSON.parse(JSON.stringify(original)),role);
    assert.equal(legacy.freeform,undefined);
    assert.deepEqual(legacy.placements,original.placements);
    assert.deepEqual(legacy.sizes,original.sizes);
    assert.deepEqual(visibleDashboardPanels(legacy,role),visibleDashboardPanels(original,role));
  }
});
test('Phase 6.1A can save and restore freeform positions without losing grid geometry',()=>{
  for(const role of ['player','gm']){
    const original=make(role),id=original.order[0];
    const rect=original.freeform.positions[id];
    const updated=normalizeDashboardLayout({...original,
      freeform:{...original.freeform,
        positions:{...original.freeform.positions,[id]:{...rect,x:120,y:300,w:420,h:220}}}},role);
    const saved=normalizeDashboardLayout(JSON.parse(JSON.stringify(updated)),role);
    assert.deepEqual(saved.freeform.positions[id],{x:120,y:300,w:420,h:220});
    assert.deepEqual(saved.placements,original.placements);
  }
});
test('Phase 6.1A only permits known panels and bounded finite freeform geometry',()=>{
  const original=make('gm');
  const layout=normalizeDashboardLayout({...original,freeform:{
    enabled:true,snap:false,allowOverlap:false,positions:{
      [original.order[0]]:{x:-100,y:999999,w:Infinity,h:NaN},
      '__proto__':{x:0,y:0,w:900,h:1000},
      unknown:{x:0,y:0,w:1000,h:1000}
    }
  }},'gm');
  const rect=layout.freeform.positions[original.order[0]];
  assert.equal(rect.x,0);
  assert.ok(rect.y<=FREEFORM_MAX_HEIGHT-rect.h);
  assert.ok(rect.w>=FREEFORM_MIN_WIDTH);
  assert.equal(Object.hasOwn(layout.freeform.positions,'unknown'),false);
  assert.equal(Object.hasOwn(layout.freeform.positions,'__proto__'),false);
  assert.deepEqual(normalizeFreeformRect({x:5000,y:-3,w:1,h:2}),
    {x:860,y:0,w:140,h:120});
});
test('Phase 6.1A rejects panel collisions by default and permits them only by choice',()=>{
  const state={enabled:true,snap:false,allowOverlap:false,positions:{
    a:{x:0,y:0,w:250,h:250},b:{x:300,y:0,w:250,h:250}
  }};
  assert.equal(freeformOverlaps(state.positions.a,state.positions.b),false);
  assert.equal(editFreeformWorkspace(state,'b','move',{x:150,y:0}),state);
  const permitted=editFreeformWorkspace({...state,allowOverlap:true},'b','move',{x:150,y:0});
  assert.equal(permitted.positions.b.x,150);
  assert.equal(freeformOverlaps(permitted.positions.a,permitted.positions.b),true);
});
test('Phase 6.1A locks and hidden panels prevent editing',()=>{
  const state={enabled:true,snap:false,allowOverlap:false,positions:{
    a:{x:0,y:0,w:250,h:250},b:{x:300,y:0,w:250,h:250}
  }};
  assert.equal(editFreeformWorkspace(state,'a','move',{x:5},{locked:['a']}),state);
  assert.equal(editFreeformWorkspace(state,'a','resize',{w:280},{hidden:['a']}),state);
  assert.equal(editFreeformWorkspace(state,'missing','resize',{w:280}),state);
  assert.equal(editFreeformWorkspace({...state,enabled:false},'a','move',{x:10}),null);
});
test('Phase 6.1A honours optional snapping and independent width/height resizing',()=>{
  const state={enabled:true,snap:true,allowOverlap:true,
    positions:{a:{x:0,y:0,w:250,h:250}}};
  const next=editFreeformWorkspace(state,'a','resize',{w:323,h:417});
  assert.deepEqual(next.positions.a,{x:0,y:0,w:320,h:420});
  const moved=editFreeformWorkspace(next,'a','move',{x:77,y:83});
  assert.deepEqual(moved.positions.a,{x:80,y:80,w:320,h:420});
  assert.ok(freeformCanvasHeight(moved,['a'])>=700);
});
test('Phase 6.1A keeps freeform layouts independent across device sizes and supports undo',()=>{
  const original=make('player');
  const first=original.order[0];
  const mobile={...original,freeform:editFreeformWorkspace(original.freeform,first,
    'move',{x:30,y:700})};
  const combined=setDashboardViewportLayout(original,'player','mobile',mobile);
  const saved=normalizeDashboardLayout(JSON.parse(JSON.stringify(combined)),'player');
  assert.deepEqual(dashboardLayoutForViewport(saved,'player','desktop').freeform.positions[first],
    original.freeform.positions[first]);
  assert.deepEqual(dashboardLayoutForViewport(saved,'player','mobile').freeform.positions[first],
    mobile.freeform.positions[first]);
  const history=createLayoutHistory(original,'player');
  const next=pushLayoutHistory(history,{...original,freeform:{
    ...original.freeform,allowOverlap:true
  }},'player');
  assert.equal(undoLayoutHistory(next).present.freeform.allowOverlap,false);
  assert.equal(redoLayoutHistory(undoLayoutHistory(next)).present.freeform.allowOverlap,true);
});
