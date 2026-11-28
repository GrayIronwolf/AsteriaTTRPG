import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('both role dashboards retain the sidebar shell across all tabs',()=>{
 for(const role of ['CharacterDashboard','GMDashboard']){
  const source=read('src/dashboards/'+role+'.jsx');
  assert.match(source,/asteria-canvas-workspace-mode/);
  assert.match(source,/className="asteria-dashboard-body" /);
  assert.match(source,/className="asteria-dashboard-page-content"/);
  assert.match(source,/<DashboardNavigation role=/);
 }
});
test('header starts collapsed and self-collapses without persistence',()=>{
 const fold=read('src/components/DashboardHeaderFold.jsx');
 assert.match(fold,/useState\(false\)/);
 assert.match(fold,/setTimeout\(\(\)=>setExpanded\(false\),8000\)/);
 assert.match(fold,/addEventListener\('hashchange',collapse\)/);
 assert.doesNotMatch(fold,/localStorage\.setItem/);
});
test('shared nav and viewport-top fold work on non-canvas dashboard pages',()=>{
 const css=read('src/styles/asteria-react.css');
 assert.match(css,/\.asteria-dashboard-body\s*\{/);
 assert.match(css,/\.asteria-dashboard-body > nav\[data-testid='asteria-gm-hybrid-menu'\]/);
 assert.match(css,/\.asteria-dashboard-body > nav\[data-testid='asteria-player-hybrid-menu'\]/);
 assert.match(css,/\.asteria-dashboard-header-fold\{\s*position:fixed!important/);
 assert.match(css,/background:#060D15/);
});
test('symbol-only vertical controls are shared by GM, combat and player canvases',()=>{
 const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
 assert.match(css,/\.centre \.canvasActions\{[\s\S]*?flex-direction:column/);
 assert.match(css,/\.centre \.canvasActions \.iconButton,[\s\S]*?background:transparent!important;border:0!important/);
 assert.match(css,/\.centre \.resizeHandle\{[\s\S]*?opacity:0/);
});
