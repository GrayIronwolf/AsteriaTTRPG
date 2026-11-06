import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('css/asteria-freeform-dashboard.css');
const panelArt=read('css/asteria-dashboard-panel-images.css');
const headerArt=read('css/asteria-panel-headers.css');
const workspace=read('src/components/WorkspaceUI.jsx');
const editor=read('src/components/DashboardCustomisation.jsx');

test('approved artwork stays unchanged and dashboard frame is behind content',()=>{
  assert.match(css,/\.react-dashboard-freeform-grid>\.react-dashboard-custom-cell\{[^}]*overflow:visible!important/);
  assert.match(css,/\.react-dashboard-freeform-grid>\.react-dashboard-custom-cell::before\{[^}]*z-index:1;/);
  assert.match(css,/\.react-dashboard-freeform-grid>\.react-dashboard-custom-cell::after\{[^}]*z-index:0;/);
  assert.match(css,/\.react-dashboard-freeform-grid>\.react-dashboard-custom-cell>\.asteria-react-panel\.asteria-royal-relic\{[^}]*z-index:2!important/);
  assert.match(css,/\.react-dashboard-freeform-grid>\.react-dashboard-custom-cell>\.asteria-react-panel\.asteria-royal-relic\{[^}]*overflow:visible!important/);
  for(const frame of ['panel-frame-3x3.webp','panel-frame-3x6.webp','panel-frame-6x3.webp','panel-frame-9x3.webp']){
    assert.ok(css.includes(frame),frame+' is still in use');
  }
  for(const backdrop of ['panel-backdrop-obsidian.webp','panel-backdrop-slate.webp','panel-backdrop-arcane.webp']){
    assert.ok(panelArt.includes(backdrop),backdrop+' remains selectable');
  }
  assert.match(headerArt,/10004\.png/);
  assert.match(headerArt,/10006\.png/);
});

test('only top-level dashboard panels have content scroller; header stays separate',()=>{
  assert.match(workspace,/export const DashboardPanelFrameContext = React\.createContext\(false\)/);
  assert.match(workspace,/const inDashboardGrid = React\.useContext\(DashboardPanelFrameContext\)/);
  assert.match(workspace,/<PanelHeader title=\{title\} eyebrow=\{eyebrow\} action=\{action\} icon=\{icon\} \/>/);
  assert.match(workspace,/inDashboardGrid[\s\S]*<DashboardPanelFrameContext\.Provider value=\{false\}>/);
  assert.match(workspace,/<div className="react-panel-scroll-region">\{children\}<\/div>/);
  assert.match(editor,/<DashboardPanelFrameContext\.Provider value=\{true\}>\{renderPanel\(id\)\}<\/DashboardPanelFrameContext\.Provider>/);
  // Preserve native controls and unwrapped nested panel contents outside the grid scope.
  assert.match(workspace,/<DashboardPanelFrameContext.Provider value=\{false\}>/);
  assert.match(workspace,/\s: children}/);
  assert.doesNotMatch(editor,/onClick=\{\(\)=>renderPanel/);
  assert.match(css,/>.react-panel-scroll-region\{[\s\S]*?overflow-y:auto;/);
  assert.match(css,/>.react-panel-header\{[\s\S]*?overflow:visible!important;/);
  assert.match(css,/@container \(max-width:620px\)\{[\s\S]*?>.react-panel-scroll-region\{[\s\S]*?overflow:visible;/);
});

test('layout geometry and panel sizing remain managed by existing grid code',()=>{
  const grid=read('src/state/dashboardGridModel.mjs');
  assert.match(grid,/DASHBOARD_GRID_COLUMNS = 12/);
  assert.match(editor,/data-panel-size=\{p\.w\+'x'\+p\.h\}/);
  assert.match(editor,/data-frame-family=\{frame\}/);
  assert.match(editor,/dashboardBackgroundForPanel\(layout,role,id\)/);
  assert.doesNotMatch(css,/pointer-events:none[^;]*;[^}]*\.react-panel-scroll-region/);
});
