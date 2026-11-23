import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 COMBAT_CANVAS_GRID_DOT_SPACING,COMBAT_CANVAS_INITIAL_COLUMNS,
 COMBAT_CANVAS_INITIAL_ROWS,COMBAT_CANVAS_REFERENCE_VISIBLE_ROWS,
 combatCanvasGridStyle,combatCanvasDetailLevel,normalizeCombatCamera,
 zoomCombatCamera,clampCombatCamera,normalizeCombatWorkspace,
 defaultCombatWorkspaceLayout,editCombatWindow
} from '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs';
import {
 defaultGMCanvasLayout,defaultPlayerCanvasLayout,
 normalizeGMCanvasLayout,normalizePlayerCanvasLayout,
 GM_DASHBOARD_CANVAS_CONFIG,PLAYER_DASHBOARD_CANVAS_CONFIG
} from '../src/state/dashboardLayoutModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Obsidian-style infinite grid uses the same camera origin and zoom as windows',()=>{
 assert.equal(COMBAT_CANVAS_GRID_DOT_SPACING,26);
 assert.equal(COMBAT_CANVAS_INITIAL_COLUMNS,100);
 assert.equal(COMBAT_CANVAS_INITIAL_ROWS,60);
 assert.equal(COMBAT_CANVAS_REFERENCE_VISIBLE_ROWS,40);
 const first=combatCanvasGridStyle({scale:.5,x:24,y:-15});
 assert.equal(first['--combat-grid-spacing'],'13px');
 assert.equal(first['--combat-grid-x'],'24px');
 assert.equal(first['--combat-grid-y'],'45px');
 const next=zoomCombatCamera({scale:.5,x:24,y:-15},1,{x:100,y:100});
 const zoomed=combatCanvasGridStyle(next);
 assert.equal(zoomed['--combat-grid-spacing'],'26px');
 assert.equal(zoomed['--combat-grid-x'],next.x+'px');
 assert.equal(zoomed['--combat-grid-y'],next.y+60+'px');
 assert.ok(parseFloat(combatCanvasGridStyle({scale:.1,x:0,y:0})['--combat-grid-spacing'])>=15);
 const scrolled=clampCombatCamera({scale:.5,x:-50000,y:32000},null,[],1440,800);
 assert.equal(scrolled.x,-50000);
 assert.equal(scrolled.y,32000);
 assert.equal(normalizeCombatCamera({scale:10}).scale,2.5);
});

test('Adaptive previews and the proportional option preserve canvas preferences',()=>{
 assert.equal(combatCanvasDetailLevel({scale:.15},'adaptive'),'preview');
 assert.equal(combatCanvasDetailLevel({scale:.35},'adaptive'),'compact');
 assert.equal(combatCanvasDetailLevel({scale:.5},'adaptive'),'full');
 assert.equal(combatCanvasDetailLevel({scale:.15},'proportional'),'full');
 const layouts=[
  [defaultCombatWorkspaceLayout(),(v)=>normalizeCombatWorkspace(v)],
  [defaultGMCanvasLayout(),(v)=>normalizeGMCanvasLayout(v)],
  [defaultPlayerCanvasLayout(),(v)=>normalizePlayerCanvasLayout(v)]
 ];
 for(const [layout,normalizer] of layouts){
  assert.equal(layout.gridVisible,true);
  assert.equal(layout.detailMode,'adaptive');
  const modified=normalizer({...layout,gridVisible:false,detailMode:'proportional'});
  assert.equal(modified.gridVisible,false);
  assert.equal(modified.detailMode,'proportional');
  assert.deepEqual(normalizer(JSON.parse(JSON.stringify(modified))),modified);
 }
 assert.ok(GM_DASHBOARD_CANVAS_CONFIG.ids.length>0);
 assert.ok(PLAYER_DASHBOARD_CANVAS_CONFIG.ids.length>0);
 const renderer=read('src/dashboards/combat/CombatCommandCentre.jsx');
 assert.match(renderer,/data-detail-level=\{detailLevel\}/);
 assert.match(renderer,/data-detail-mode=\{layout.detailMode\}/);
 assert.match(renderer,/Show infinite dot grid/);
 assert.match(renderer,/Adaptive previews/);
 assert.match(renderer,/Proportional at every zoom/);
 assert.match(renderer,/inert=\{isMinimised\|\|/);
 assert.match(renderer,/viewport.dataset.detailLevel=combatCanvasDetailLevel/);
});

test('Canvas is borderless, fills the viewport and retains responsive stacking',()=>{
 const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
 const renderer=read('src/dashboards/combat/CombatCommandCentre.jsx');
 const combat=read('src/dashboards/combat/CombatWorkspace.module.css');
 const panelCss=read('src/styles/asteria-react.css');
 assert.match(css,/border:0!important;border-radius:0/);
 assert.match(css,/background-position:center top,var\(--combat-grid-x,0px\) var\(--combat-grid-y,60px\)/);
 assert.match(renderer,/scrollArea.clientHeight-contentTop-2/);
 assert.match(renderer,/viewportRect.top-scrollRect.top\+scrollArea.scrollTop/);
 assert.match(renderer,/Math.min\(36,Math.max\(0,parentRect.left-scrollRect.left\)\)/);
 assert.match(css,/@container \(max-width:699px\)/);
 assert.match(css,/\.window\[data-combat-panel\]\{position:relative;left:auto;top:auto;width:100%;height:auto/);
 assert.match(combat,/\.workspace\[data-testid="site-gm-combat"\]\{padding:0;border:0/);
 assert.match(css,/royal-relic-obsidian\.svg/);
 assert.match(panelCss,/\[data-canvas-window\] \[data-combat-scroll\]>div>/);
 assert.match(css,/\.canvas\[data-detail-level='preview'\] \.windowBar strong/);
 assert.match(css,/\.canvas\[data-detail-mode='proportional'\] \.windowContent/);
});

test('Canvas preserves existing panel layouts and moves far beyond the initial guide',()=>{
 const layout=defaultCombatWorkspaceLayout();
 const moved=editCombatWindow(layout,'resources','move',{x:67000,y:-54000});
 assert.equal(moved.freeform.positions.resources.x,67000);
 assert.equal(moved.freeform.positions.resources.y,-54000);
 const stored=normalizeCombatWorkspace({...moved,gridVisible:false,detailMode:'proportional'});
 assert.deepEqual(stored.freeform.positions.resources,moved.freeform.positions.resources);
 assert.equal(stored.gridVisible,false);
 assert.equal(stored.detailMode,'proportional');
 const renderer=read('src/dashboards/combat/CombatCommandCentre.jsx');
 assert.match(renderer,/fitCombatCamera\(layout,visible\.map/);
 assert.match(renderer,/zoomCombatCamera\(cameraRef.current,/);
 assert.match(renderer,/\{x:event.clientX-rect.left,y:event.clientY-rect.top-60\}/);
 assert.match(renderer,/setFrontWindow\(current=>current===id\?current:id\)/);
});

test('Appearance preferences are scoped to each canvas layout and do not reset window positions',()=>{
 const normalizers=[
  [defaultCombatWorkspaceLayout(),normalizeCombatWorkspace],
  [defaultGMCanvasLayout(),normalizeGMCanvasLayout],
  [defaultPlayerCanvasLayout(),normalizePlayerCanvasLayout]
 ];
 for(const [initial,normalize] of normalizers){
  assert.equal(initial.gridSize,26);
  assert.equal(initial.canvasBackground,'midnight');
  assert.equal(initial.smoothAnimations,true);
  const altered=normalize({...initial,gridVisible:false,gridSize:40,
   canvasBackground:'slate',smoothAnimations:false,detailMode:'proportional'});
  assert.equal(altered.gridVisible,false);
  assert.equal(altered.gridSize,40);
  assert.equal(altered.canvasBackground,'slate');
  assert.equal(altered.smoothAnimations,false);
  assert.equal(altered.detailMode,'proportional');
  assert.deepEqual(altered.freeform.positions,initial.freeform.positions);
  assert.equal(normalize(altered).canvasBackground,'slate');
  assert.equal(normalize({...altered,gridSize:999,canvasBackground:'unknown'}).gridSize,26);
  assert.equal(normalize({...altered,gridSize:999,canvasBackground:'unknown'}).canvasBackground,'midnight');
 }
 assert.equal(combatCanvasGridStyle({scale:.5,x:0,y:0},16)['--combat-grid-spacing'],'8px');
 assert.equal(combatCanvasGridStyle({scale:.5,x:0,y:0},40)['--combat-grid-spacing'],'20px');
 const renderer=read('src/dashboards/combat/CombatCommandCentre.jsx');
 const styles=read('src/dashboards/combat/CombatCommandCentre.module.css');
 assert.match(renderer,/Canvas grid spacing/);
 assert.match(renderer,/Canvas background/);
 assert.match(renderer,/Smooth canvas animations/);
 assert.match(renderer,/Reset appearance only/);
 assert.match(renderer,/data-background=\{layout.canvasBackground\}/);
 assert.match(renderer,/data-motion=\{layout.smoothAnimations\?'on':'off'\}/);
 assert.match(styles,/\.canvas\[data-background='obsidian'\]/);
 assert.match(styles,/\.canvas\[data-background='slate'\]/);
 assert.match(styles,/\.canvas\[data-motion='off'\]/);
});
