import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gridRectanglesOverlap} from '../src/state/dashboardGridModel.mjs';
import {
  DASHBOARD_PANEL_REGISTRY,defaultDashboardLayout,normalizeDashboardLayout,visibleDashboardPanels,
  dashboardViewportFromWidth,dashboardLayoutForViewport,setDashboardViewportLayout,
  dashboardPanelSizeChoices,placeDashboardGridPanel,fitDashboardGridPanel,
  lockDashboardGridPanel,toggleDashboardPanel
} from '../src/state/dashboardLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Player and GM viewport layouts persist independently and normalize after reloading',()=>{
 for(const role of ['player','gm']){
  const panel=role==='gm'?'encounter':'weapons';
  const base=defaultDashboardLayout(role);
  const mobile=placeDashboardGridPanel(base,role,panel,0,24);
  const combined=setDashboardViewportLayout(base,role,'mobile',mobile);
  const restored=normalizeDashboardLayout(JSON.parse(JSON.stringify(combined)),role);
  assert.equal(dashboardLayoutForViewport(restored,role,'mobile').placements[panel].y,24);
  assert.deepEqual(dashboardLayoutForViewport(restored,role,'desktop').placements[panel],base.placements[panel]);
  assert.deepEqual(dashboardLayoutForViewport(restored,role,'tablet').placements[panel],base.placements[panel]);
  assert.equal(restored.order.includes(role==='gm'?'weapons':'encounter'),false);
 }
});
test('Viewport widths match dashboard container rules',()=>{
 assert.equal(dashboardViewportFromWidth(400),'mobile');
 assert.equal(dashboardViewportFromWidth(620),'mobile');
 assert.equal(dashboardViewportFromWidth(621),'tablet');
 assert.equal(dashboardViewportFromWidth(900),'tablet');
 assert.equal(dashboardViewportFromWidth(901),'desktop');
});
test('Each Player and GM panel exposes numeric dimensions with three or four choices',()=>{
 for(const role of ['player','gm']){
  for(const panel of DASHBOARD_PANEL_REGISTRY[role]){
   const options=dashboardPanelSizeChoices(role,panel.id);
   assert.ok(options.length>=3&&options.length<=4,role+': '+panel.id);
   assert.equal(new Set(options.map(option=>option.label)).size,options.length);
   for(const option of options)assert.equal(option.label,option.w+'×'+option.h);
  }
 }
 const editor=read('src/components/DashboardCustomisation.jsx');
 const css=read('css/asteria-freeform-dashboard.css');
 assert.match(editor,/<b>\{item\.label\}<\/b>/);
 assert.doesNotMatch(editor,/option\.label==='Small'|option\.label==='Large'/);
 assert.match(css,/\.react-grid-editor-tile>\.react-grid-editor-size-options\{[^}]*flex-direction:column/);
});
test('Editor keeps filled panel tile surfaces while dimension choices remain unboxed text',()=>{
 const css=read('css/asteria-freeform-dashboard.css');
 const editor=read('src/components/DashboardCustomisation.jsx');
 assert.match(css,/\.react-grid-editor-tile\s*\{[^}]*border:1px solid #bda066!important/);
 assert.match(css,/\.react-grid-editor-tile\s*\{[^}]*background:linear-gradient/);
 assert.match(css,/\.react-grid-editor-tile\s*\{[^}]*overflow:hidden/);
 assert.match(css,/\.react-grid-editor-tile>\.react-grid-editor-size-options button\s*\{[^}]*background:none!important;[^}]*border:0!important;/);
 assert.match(css,/\.react-grid-editor-tile>\.react-grid-editor-size-options button\[aria-pressed="true"\]\s*\{[^}]*text-decoration:underline/);
 assert.match(editor,/data-grid-tile-rows=\{pos\.h\}/);
 assert.match(css,/data-grid-tile-rows="2"/);
});
test('Size choices are panel-specific and locked panels do not change',()=>{
 for(const role of ['player','gm']){
  const id=role==='gm'?'encounter':'weapons';
  const choices=dashboardPanelSizeChoices(role,id);
  assert.ok(choices.length>=3&&choices.length<=4);
  assert.deepEqual(choices.map(({label,w,h})=>label),choices.map(({w,h})=>w+'×'+h));
  let layout=defaultDashboardLayout(role);
  const selectedSize=choices.at(-1);
  layout=fitDashboardGridPanel(layout,role,id,selectedSize.w,selectedSize.h);
  assert.deepEqual({w:layout.placements[id].w,h:layout.placements[id].h},{w:selectedSize.w,h:selectedSize.h});
  const locked=lockDashboardGridPanel(layout,role,id,true);
  assert.deepEqual(fitDashboardGridPanel(locked,role,id,choices[0].w,choices[0].h).placements[id],layout.placements[id]);
  assert.deepEqual(placeDashboardGridPanel(locked,role,id,0,25).placements[id],layout.placements[id]);
 }
});
test('Moving and resizing panels reflow unlocked neighbours without overlaps',()=>{
 for(const role of ['player','gm']){
  const id=role==='gm'?'encounter':'weapons';
  let layout=defaultDashboardLayout(role);
  const first=layout.placements[layout.order[0]];
  layout=placeDashboardGridPanel(layout,role,id,first.x,first.y);
  const choices=dashboardPanelSizeChoices(role,id);
  layout=fitDashboardGridPanel(layout,role,id,choices.at(-1).w,choices.at(-1).h);
  const ids=visibleDashboardPanels(layout,role);
  for(const a of ids)for(const b of ids)if(a!==b)assert.equal(
    gridRectanglesOverlap(layout.placements[a],layout.placements[b]),false,a+' overlaps '+b);
 }
});
test('Unticking a panel retains data-independent layout registration',()=>{
 const original=defaultDashboardLayout('player');
 const removed=toggleDashboardPanel(original,'player','weapons',false);
 assert.ok(removed.order.includes('weapons'));
 assert.equal(visibleDashboardPanels(removed,'player').includes('weapons'),false);
 assert.equal(visibleDashboardPanels(toggleDashboardPanel(removed,'player','weapons',true),'player').includes('weapons'),true);
});
test('Player/GM apply saves directly and editor provides confirmation controls',()=>{
 const editor=read('src/components/DashboardCustomisation.jsx');
 const player=read('src/dashboards/CharacterGallerySettings.jsx');
 const gm=read('src/dashboards/GMDashboard.jsx');
 assert.match(editor,/onClick=\{apply\}/);
 assert.match(editor,/onApply\(combined\)/);
 assert.match(editor,/Confirm Reset/);
 assert.match(editor,/Discard Changes/);
 assert.match(editor,/react-grid-editor-library-item/);
 assert.match(editor,/dashboardPanelSizeChoices/);
 assert.doesNotMatch(editor,/className="react-grid-editor-tile-resize"/);
 assert.match(player,/onApply=\{applyLayout\}/);
 assert.match(gm,/onApply=\{applyGMLayout\}/);
 assert.match(gm,/saveUserDashboardLayout/);
});
