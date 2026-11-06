import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tabVisibilityDelta} from '../src/state/dashboardNavigation.mjs';
import {defaultDashboardLayout,normalizeDashboardLayout,visibleDashboardPanels} from '../src/state/dashboardLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Active Player/GM tab is rechecked when tablet/desktop layout width changes',()=>{
 const ui=read('src/components/WorkspaceUI.jsx');
 assert.match(ui,/const scheduleReveal = \(\) => \{/);
 assert.match(ui,/new ResizeObserver\(scheduleReveal\)/);
 assert.match(ui,/window\.addEventListener\('resize', scheduleReveal\)/);
 assert.match(ui,/window\.removeEventListener\('resize', scheduleReveal\)/);
 assert.match(ui,/observer\?\.disconnect\(\)/);
 assert.match(ui,/window\.cancelAnimationFrame\(frame\)/);
 assert.match(ui,/navigation\.querySelector\('\[role="tab"\]\[aria-selected="true"\]'\)/);
 assert.match(ui,/scrollLeft \+= delta/);
 assert.equal(tabVisibilityDelta({viewportStart:0,viewportEnd:500,itemStart:475,itemEnd:605}),105);
 assert.equal(tabVisibilityDelta({viewportStart:0,viewportEnd:900,itemStart:475,itemEnd:605}),0);
});
test('Visual editor overlays the full viewport rather than clipping into settings panel',()=>{
 const editor=read('src/components/DashboardCustomisation.jsx');
 assert.match(editor,/import \{createPortal\} from 'react-dom'/);
 assert.match(editor,/\{open\?createPortal\(<div className="react-grid-editor-modal"/);
 assert.match(editor,/<\/div>,document\.body\):null\}/);
 assert.match(editor,/trapDialogTab\(e,dialogRef\.current,document\.activeElement\)/);
 assert.match(editor,/openButtonRef\.current\?\.focus\(\)/);
 const css=read('css/asteria-freeform-dashboard.css');
 assert.match(css,/\.react-grid-editor-modal\{position:fixed;inset:0;z-index:9999/);
 assert.match(css,/\.react-grid-editor-dialog\{width:min\(1150px,100%\);max-height:92dvh/);
});
test('Tablet panel reflow keeps DOM order, desktop saved placements and fixed resources',()=>{
 const css=read('css/asteria-dashboard-spacing-responsive.css');
 const frames=read('css/asteria-freeform-dashboard.css');
 assert.match(css,/@container \(min-width:621px\) and \(max-width:900px\)/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/grid-auto-flow:row!important/);
 assert.doesNotMatch(css,/grid-auto-flow:row dense/);
 assert.match(frames,/grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
 for(const role of ['player','gm']){
  const initial=defaultDashboardLayout(role);
  const restored=normalizeDashboardLayout(initial,role);
  assert.deepEqual(visibleDashboardPanels(restored,role),visibleDashboardPanels(initial,role));
  assert.deepEqual(restored.placements,initial.placements);
 }
 const player=read('src/dashboards/CharacterDashboard.jsx');
 const gm=read('src/dashboards/GMDashboard.jsx');
 assert.match(player,/DashboardLayoutWorkspace/);
 assert.match(gm,/DashboardLayoutWorkspace/);
});
test('Approved frames and gameplay still use existing assets and definitions',()=>{
 const html=read('index.html');
 for(const asset of ['asteria-panel-headers.css','asteria-dashboard-panel-images.css','asteria-smoke-background.css','asteria-button-images.css'])
  assert.ok(html.includes(asset),asset);
 const css=read('css/asteria-freeform-dashboard.css');
 for(const frame of ['panel-frame-3x3.webp','panel-frame-3x6.webp','panel-frame-6x3.webp','panel-frame-9x3.webp'])
  assert.ok(css.includes(frame));
 assert.match(read('src/components/DashboardCustomisation.jsx'),/DashboardPanelFrameContext\.Provider/);
});
