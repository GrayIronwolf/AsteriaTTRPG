import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gridRectanglesOverlap} from '../src/state/dashboardGridModel.mjs';
import {
  defaultDashboardLayout,normalizeDashboardLayout,visibleDashboardPanels,
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
test('Size choices are panel-specific and locked panels do not change',()=>{
 for(const role of ['player','gm']){
  const id=role==='gm'?'encounter':'weapons';
  const choices=dashboardPanelSizeChoices(role,id);
  assert.deepEqual(choices.map(choice=>choice.label),['3×3','6×3','3×6','3×9']);
  let layout=defaultDashboardLayout(role);
  const tall=choices.at(-1);
  layout=fitDashboardGridPanel(layout,role,id,tall.w,tall.h);
  assert.deepEqual({w:layout.placements[id].w,h:layout.placements[id].h},{w:3,h:9});
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
