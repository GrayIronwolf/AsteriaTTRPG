import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('css/asteria-dashboard-responsive-content.css');
const freeform=read('css/asteria-freeform-dashboard.css');
const html=read('index.html');
const grid=read('src/state/dashboardGridModel.mjs');
const panels=read('src/dashboards/PlayerDashboardOverview.jsx');

test('Update 2 content CSS follows existing frame rules without changing artwork',()=>{
  const first=html.indexOf('css/asteria-freeform-dashboard.css');
  const next=html.indexOf('css/asteria-dashboard-responsive-content.css?v=dashboard-update2-content-fit-20261106');
  assert.ok(first>=0&&next>first);
  assert.match(css,/container-name:asteria-panel;/);
  assert.match(css,/container-type:inline-size;/);
  // A named panel container belongs to the scroll region, not the outer grid
  // cell: otherwise existing generic mobile @container rules misfire on desktop.
  assert.match(css,/\.react-dashboard-custom-cell > \.asteria-react-panel\s*> \.react-panel-scroll-region \{\s*container-name:asteria-panel;\s*container-type:inline-size;/);
  assert.doesNotMatch(css,/\.react-dashboard-custom-cell\s*\{\s*container-name:asteria-panel;/);
  assert.match(css,/--asteria-frame-border:clamp\(9px,2cqi,18px\)/);
  assert.match(css,/border-image-slice:12%!important;/);
  assert.match(css,/border-image-repeat:stretch!important;/);
  assert.match(css,/border-image-width:1!important;/);
  assert.match(freeform,/border-image-source:var\(--asteria-panel-frame\)/);
  for(const frame of ['panel-frame-3x3.webp','panel-frame-3x6.webp','panel-frame-6x3.webp','panel-frame-9x3.webp'])
    assert.ok(freeform.includes(frame));
  for(const asset of ['10004.png','10006.png'])
    assert.ok(read('css/asteria-panel-headers.css').includes(asset));
  assert.doesNotMatch(css,/background-image\s*:|background\s*:\s*url\(|--asteria-panel-frame\s*:/);
});
test('Equipment and Quick Items remain functional and reflow for narrow widths',()=>{
  assert.match(css,/@container asteria-panel \(max-width:520px\)/);
  assert.match(css,/@container asteria-panel \(max-width:300px\)/);
  assert.match(css,/data-panel-id="armour"/);
  assert.match(css,/data-panel-id="weapons"/);
  assert.match(css,/data-panel-id="quick"/);
  assert.match(css,/\.react-armour-core \{\s*grid-column:1 \/ -1;/);
  assert.match(css,/\.react-weapon-slot-grid/);
  assert.match(css,/\.react-quick-slot-grid/);
  assert.match(panels,/function ArmourPanel\(/);
  assert.match(panels,/function WeaponsPanel\(/);
  assert.match(panels,/function QuickItemsPanel\(/);
  assert.match(panels,/onClick=\{\(\) => setShowBreakdown\(true\)\}/);
});
test('Spells, talents, skills and GM controls adapt to panel container not viewport',()=>{
  assert.match(css,/@container asteria-panel \(max-width:650px\)/);
  assert.match(css,/@container asteria-panel \(max-width:310px\)/);
  assert.match(css,/\.react-ability-grid/);
  assert.match(css,/\.react-dashboard-skill-grid/);
  assert.match(css,/@container asteria-panel \(max-width:600px\)/);
  assert.match(css,/@container asteria-panel \(max-width:410px\)/);
  for(const selector of ['.react-form-grid','.react-encounter-builder','.react-gm-grant-grid','.react-recipient-grid','.react-delivery-list','.react-gm-ac-form'])
    assert.ok(css.includes(selector),selector);
  assert.match(css,/overflow-wrap:anywhere;/);
  assert.match(css,/box-sizing:border-box;/);
});
test('Saved 12-column placements and panel-size safety rules are unchanged',()=>{
  assert.match(grid,/export const DASHBOARD_GRID_COLUMNS = 12/);
  assert.match(grid,/armour:rule\(4,3,4,4,8,7/);
  assert.match(grid,/weapons:rule\(3,2,3,3,6,5\)/);
  assert.match(grid,/quick:rule\(2,3,3,3,6,5\)/);
  assert.match(grid,/encounter:rule\(5,4,6,5,12,10\)/);
  assert.match(freeform,/\.react-panel-scroll-region/);
  assert.match(css,/overflow-wrap:break-word;/);
  assert.doesNotMatch(css,/grid-column:var\(--panel-col\)|grid-row:var\(--panel-row\)|grid-template-columns:repeat\(12/);
  for(const asset of ['panel-frame-3x3.webp','panel-frame-3x6.webp','panel-frame-6x3.webp','panel-frame-9x3.webp'])
    assert.ok(existsSync(new URL('../assets/ui/dashboard/'+asset,import.meta.url)),asset);
});
