import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('css/asteria-dashboard-spacing-responsive.css');
const base=read('css/asteria-freeform-dashboard.css');
const content=read('css/asteria-dashboard-responsive-content.css');
const html=read('index.html');
const grid=read('src/state/dashboardGridModel.mjs');
const workspace=read('src/components/DashboardCustomisation.jsx');

test('Update 3 loads after previous frame and panel-content layers',()=>{
  const frame=html.indexOf('css/asteria-freeform-dashboard.css');
  const previous=html.indexOf('css/asteria-dashboard-responsive-content.css');
  const current=html.indexOf('css/asteria-dashboard-spacing-responsive.css?v=dashboard-update3-responsive-20261106');
  assert.ok(frame>=0&&previous>frame&&current>previous);
  assert.match(base,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(grid,/DASHBOARD_GRID_COLUMNS = 12/);
  assert.match(workspace,/--panel-col/);
  assert.match(workspace,/--panel-row/);
  assert.match(workspace,/--panel-w/);
  assert.match(workspace,/--panel-h/);
  assert.doesNotMatch(css,/grid-column:var\(--panel-col\)|grid-row:var\(--panel-row\)/);
});
test('tablet selects 2 compact columns without reordering and leaves complex panels full-width',()=>{
  assert.match(css,/@container \(min-width:621px\) and \(max-width:900px\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-auto-flow:row!important/);
  assert.doesNotMatch(css,/grid-auto-flow:row dense|order\s*:/);
  for(const id of ['conditions','effects','currency','partySummary']) assert.ok(css.includes('[data-panel-id="'+id+'"]'));
  assert.match(css,/\[data-panel-id\^="shortcut"\]/);
  assert.match(css,/grid-column:span 1!important/);
  assert.match(css,/grid-column:1 \/ -1!important/);
});
test('phone uses a content-driven single column instead of forced tall empty frames',()=>{
  assert.match(css,/@container \(max-width:620px\)/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/min-height:126px!important/);
  assert.match(css,/height:auto!important/);
  assert.match(css,/max-height:none!important/);
  assert.match(css,/overflow:visible!important/);
  assert.match(css,/\.react-dashboard-empty \{\s*min-height:78px!important/);
  assert.doesNotMatch(css,/height:\s*550px|height:\s*300px|display:none/);
});
test('resizing, controls, backgrounds and artwork are preserved',()=>{
  const approved=read('css/asteria-dashboard-panel-images.css');
  const title=read('css/asteria-panel-headers.css');
  for(const name of ['panel-frame-3x3.webp','panel-frame-6x3.webp','panel-frame-3x6.webp','panel-frame-9x3.webp'])assert.ok(base.includes(name),name);
  for(const name of ['panel-backdrop-obsidian.webp','panel-backdrop-slate.webp','panel-backdrop-arcane.webp'])assert.ok(approved.includes(name),name);
  assert.match(title,/10004\.png/);
  assert.match(title,/10006\.png/);
  assert.match(content,/container-name:asteria-panel/);
  assert.match(base,/\.react-panel-scroll-region/);
  assert.match(css,/\.react-panel-scroll-region/);
  assert.doesNotMatch(css,/pointer-events:none|position:absolute|background-image:|border-image-source:|z-index:|transform:|--panel-col:|--panel-row:/);
});
