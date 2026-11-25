import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderedCombatPartyIds} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('New canvas sessions open at 50 percent on the top row without changing saved geometry',async()=>{
 const {openingCombatCamera,COMBAT_CANVAS_OPENING_ZOOM,defaultCombatWorkspaceLayout,
  fitCombatCamera}=await import('../src/dashboards/combat/combatWorkspaceLayoutModel.mjs');
 const {defaultPlayerCanvasLayout,defaultGMCanvasLayout,GM_CANVAS_DEFAULT_IDS,
  PLAYER_CANVAS_DEFAULT_IDS}=await import('../src/state/dashboardLayoutModel.mjs');
 assert.equal(COMBAT_CANVAS_OPENING_ZOOM,.5);
 for(const [layout,ids] of [
   [defaultGMCanvasLayout(),GM_CANVAS_DEFAULT_IDS],
   [defaultPlayerCanvasLayout(),PLAYER_CANVAS_DEFAULT_IDS],
   [defaultCombatWorkspaceLayout(),Object.keys(defaultCombatWorkspaceLayout().freeform.positions)]
 ]){
   const before=JSON.stringify(layout);
   const opening=openingCombatCamera(layout,ids,1440);
   const fit=fitCombatCamera(layout,ids,1440,680);
   assert.equal(opening.scale,.5);
   assert.ok(fit.scale>0&&fit.scale<=2.5);
   assert.ok(opening.y>=0&&opening.y<=30);
   assert.equal(JSON.stringify(layout),before);
 }
 const jsx=read('src/dashboards/combat/CombatCommandCentre.jsx');
 assert.match(jsx,/openingCameraPending\.current=!restoredCamera/);
 assert.match(jsx,/onClick=\{openingView\}>Opening view \(50%\)/);
 assert.match(jsx,/stored\?normalizeCombatCamera\(JSON\.parse\(stored\)\):null/);
});
test('Larger resize handles and balanced default GM windows keep custom layouts intact',async()=>{
 const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
 const {defaultGMCanvasLayout,normalizeGMCanvasLayout}=await import('../src/state/dashboardLayoutModel.mjs');
 assert.match(css,/--grip:clamp\(20px,calc\(22px \/ var\(--combat-scale,1\)\),80px\)/);
 assert.match(css,/width:var\(--grip\);height:var\(--grip\)/);
 assert.match(css,/--combat-canvas-background:#091623/);
 assert.match(css,/background-color:var\(--combat-canvas-background\)/);
 assert.match(css,/\.focused\{border-color:/);
 const base=defaultGMCanvasLayout();
 assert.deepEqual(base.freeform.positions.gmResources,{x:0,y:0,w:490,h:670});
 assert.equal(base.freeform.positions.requestsOverview.y,0);
 const old=normalizeGMCanvasLayout({...base,freeform:{...base.freeform,positions:{
  ...base.freeform.positions,gmResources:{x:70,y:80,w:650,h:780}
 }}});
 assert.deepEqual(old.freeform.positions.gmResources,{x:70,y:80,w:650,h:780});
});

test('All zoom levels preserve window content and controls in GM, Player, and Combat canvases',()=>{
 const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
 const canvas=read('src/dashboards/combat/CombatCommandCentre.jsx');
 assert.doesNotMatch(css,/\.canvas\[data-overview/);
 assert.doesNotMatch(canvas,/data-overview=\{/);
 assert.match(css,/\.minimised \.windowContent\{visibility:hidden/);
 assert.match(canvas,/zoomCombatCamera/);
 assert.match(canvas,/data-layout-mode=\{wide\?'freeform':'stacked'\}/);
});

test('GM Player Resources canvas cards are slimmer and taller without action buttons',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx');
 const css=read('src/styles/asteria-react.css');
 assert.match(css,/\.react-party-sidebar-in-canvas>\.react-party-list\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/\.react-party-sidebar-in-canvas \.react-party-card\{\s*min-width:0;width:100%;height:auto;min-height:340px/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.match(gm,/\{!embedded\?<div className="react-party-card-actions">/);
 assert.match(gm,/selected\?'Selected':'Select'/);
 assert.match(gm,/>Open Character<\/button>/);
 assert.match(gm,/kind="xp"/);
 assert.match(gm,/resourceDefinitions\(character\)/);
 assert.match(gm,/onFocus=\{onFocus\?\(\)=>onFocus\(character\):null\}/);
});

test('Full-card lifted drag image, pointer capture, animated reorder and keyboard access',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx');
 const css=read('src/styles/asteria-react.css');
 assert.match(gm,/source\.cloneNode\(true\)/);
 assert.match(gm,/gesture\.overlay\.style\.transform/);
 assert.match(gm,/setPointerCapture\(event\.pointerId\)/);
 assert.match(gm,/document\.elementFromPoint\(gesture\.x,gesture\.y\)/);
 assert.match(gm,/requestAnimationFrame/);
 assert.match(gm,/onPointerCancel=\{onEndDrag\}/);
 assert.match(gm,/onLostPointerCapture=\{onEndDrag\}/);
 assert.match(gm,/if\(event\.type==='pointerup'&&gesture\.moved&&to\)reorder/);
 assert.match(gm,/card\.animate\?\.\(/);
 assert.match(gm,/event\.altKey/);
 assert.match(css,/\.react-party-drag-overlay\{/);
 assert.match(css,/\.react-party-card\.is-lifted\{/);
 assert.match(css,/\.react-party-card\.is-drop-target\{/);
 assert.deepEqual(orderedCombatPartyIds(['a','b','c'],['c','a','b']),['c','a','b']);
});
