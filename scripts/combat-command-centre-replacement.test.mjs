import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const file=path=>readFileSync(path,'utf8');
test('GM combat renderer is replaced, not duplicated',()=>{
 const gm=file('src/dashboards/GMDashboard.jsx');
 assert.match(gm,/dashboardTabs\('gm'\)/);
 assert.match(file('src/state/dashboardMenuModel.mjs'),/page\('combat','Combat Command Centre'/);
 assert.match(gm,/<GMCombatWorkspace\b/);
 assert.doesNotMatch(gm,/function CampaignEncounter\(/);
 assert.doesNotMatch(gm,/import \{ GMCombatPanel \}/);
 assert.doesNotMatch(file('src/dashboards/CombatPanel.jsx'),/export function GMCombatPanel\(/);
 assert.match(file('src/dashboards/combat/CombatWorkspace.jsx'),/<CombatCommandCentre\b/);
 assert.match(file('src/dashboards/combat/CombatWorkspace.jsx'),/<GMAdvancedCombatControls\b/);
});
test('archived combat modules, prepared encounters and completion history all present',()=>{
 for(const path of [
  'src/dashboards/combat/CombatCommandCentre.jsx',
  'src/dashboards/combat/PreparedEncounterLibrary.jsx',
  'src/dashboards/combat/GMLiveCombatPanel.jsx',
  'src/dashboards/combat/GMEncounterWavesPanel.jsx',
  'src/dashboards/combat/GMEncounterHistoryPanel.jsx',
  'src/dashboards/combat/GMAdvancedCombatControls.jsx',
  'src/state/preparedEncounterModel.mjs',
  'src/state/preparedEncounterLoadModel.mjs',
  'src/state/encounterWaveModel.mjs',
  'src/state/encounterCompletionModel.mjs'
 ])assert.ok(existsSync(path),path);
 assert.match(file('src/dashboards/combat/CombatWorkspace.jsx'),/<PreparedEncounterLibrary\b/);
});
test('React uses existing authenticated Firebase and private encounter history',()=>{
 const app=file('js/firebase-auth.js');
 assert.match(app,/getReactCombatRuntime/);
 assert.match(app,/auth,db,functions:functionsClient/);
 assert.match(file('src/dashboards/combat/siteCombatApi.js'),/createFirebaseCombatService/);
 const f=file('functions/combatCommands.mjs');
 for(const op of ['load-prepared','release-wave','trigger-event','map-prepare'])
  assert.ok(f.includes(op),'Missing server combat operation '+op);
 assert.match(file('functions/commands.mjs'),/createEncounterCompletionCommands/);
 assert.match(file('firestore.rules'),/match \/encounterHistory\/\{encounterId\}/);
});
test('player combat remains mounted and its React module is preserved',()=>{
 assert.match(file('src/dashboards/CharacterDashboard.jsx'),/CombatDashboardLayout/);
 assert.match(file('src/dashboards/CombatPanel.jsx'),/export function CombatPanel/);
});
test('combat progression shares original XP thresholds',()=>{
 const pattern=/const XP_TO_NEXT_BY_LEVEL = \[([\s\S]*?)\];/;
 const legacy=file('js/asteria-progression.js').match(pattern)?.[1]?.replace(/\s+/g,'');
 const server=file('src/state/combatProgressionCore.mjs').match(pattern)?.[1]?.replace(/\s+/g,'');
 assert.ok(legacy&&server);assert.equal(server,legacy);
});

test('Combat Command Centre uses current design tokens, including all combat panels and badges',()=>{
 const paths=[
 'CombatCommandCentre.module.css','CombatWorkspace.module.css','GMLiveCombatPanel.module.css',
 'GMEncounterWavesPanel.module.css','GMEncounterHistoryPanel.module.css',
 'PreparedEncounterLibrary.module.css','ForgedBadge.module.css','ForgedBadge.jsx'
 ].map(name=>'src/dashboards/combat/'+name);
 const design=file('css/asteria-design-tokens.css');
 for(const path of paths){
   const content=file(path);
   assert.doesNotMatch(content,/--ast-(?!eria)[A-Za-z0-9-]+/,
     'Undefined obsolete token in '+path);
   if(path.endsWith('.css')){
     for(const match of content.matchAll(/var\((--asteria-[A-Za-z0-9-]+)/g))
       assert.ok(design.includes(match[1]+':')||match[1]==='--asteria-accent',
         'Missing Asteria design token '+match[1]+' in '+path);
   }
 }
 assert.match(file(paths[0]),/\.window\[data-combat-panel\]/);
});
test('Combat windows remain visible during loading or denied Firestore access',()=>{
 const workspace=file('src/dashboards/combat/CombatWorkspace.jsx');
 const renderer=file('src/dashboards/combat/CombatCommandCentre.jsx');
 assert.match(workspace,/COMBAT_PANEL_IDS\.filter\(id=>id!=='resources'\)\.map\(id=>/);
 assert.match(workspace,/<CombatCommandPanel id="resources">/);
 assert.match(workspace,/connectionPlaceholder/);
 assert.match(workspace,/stream\.error/);
 assert.match(renderer,/collectCombatPanels\(children\)/);
 assert.match(renderer,/visible\.map\(panel=>/);
 assert.match(file('src/dashboards/GMDashboard.jsx'),/tab === 'combat' \? <GMCombatWorkspace/);
});
test('Combat layout reset and quick modes preserve custom layouts and combat privacy',async()=>{
 const {COMBAT_PANEL_IDS,COMBAT_WORKSPACE_MODES,defaultCombatWorkspaceLayout,
  applyCombatWorkspaceMode,resetCombatWorkspace,saveCombatPreset,normalizeCombatWorkspace
 }=await import('../src/dashboards/combat/combatWorkspaceLayoutModel.mjs');
 const state=defaultCombatWorkspaceLayout();
 assert.equal(state.hidden.length,0);
 assert.equal(state.freeform.allowOverlap,true);
 assert.equal(state.freeform.snap,false);
 assert.equal(COMBAT_WORKSPACE_MODES.length,3);
 for(const mode of COMBAT_WORKSPACE_MODES){
   const view=applyCombatWorkspaceMode(state,mode.id);
   assert.deepEqual(COMBAT_PANEL_IDS.filter(id=>!view.hidden.includes(id)).sort(),[...mode.panels].sort());
 }
 const saved=saveCombatPreset(state,'Custom view','layout-test');
 const modified=applyCombatWorkspaceMode(saved,'preparation');
 const reset=resetCombatWorkspace(modified);
 assert.equal(reset.hidden.length,0);
 assert.equal(reset.savedWorkspaces.length,1);
 assert.equal(normalizeCombatWorkspace(reset).savedWorkspaces[0].name,'Custom view');
 assert.equal('combat' in reset,false);
});

test('Direct canvas actions retain combat authority and use no parallel page or editor',()=>{
 const renderer=file('src/dashboards/combat/CombatCommandCentre.jsx');
 const gm=file('src/dashboards/GMDashboard.jsx');
 assert.doesNotMatch(renderer,/Customise Combat Workspace|setHistory\(/);
 assert.match(renderer,/onPointerDown=\{startPan\}/);
 assert.match(renderer,/begin\(event,id,'move'\)/);
 assert.match(renderer,/\['n','e','s','w','ne','nw','se','sw'\]/);
 assert.match(renderer,/zoomCombatCamera/);
 assert.match(renderer,/fitCombatCamera/);
 assert.match(renderer,/localStorage\.setItem\(storageKey/);
 assert.match(renderer,/canvasLocked/);
 assert.match(gm,/data-testid="gm-player-resources-strip"/);
 assert.doesNotMatch(gm,/<GMUnifiedSearch|<GMToolkitQuickAccess/);
 assert.match(gm,/<GMToolkitHub/);
 assert.match(gm,/searchTarget=\{gmSearchTarget\}/);
});
test('Canvas geometry supports offscreen positions, zoom, persistence and collision safety',async()=>{
 const {defaultCombatWorkspaceLayout,editCombatWindow,normalizeCombatWorkspace,
  normalizeCombatCamera,zoomCombatCamera,fitCombatCamera}=await import(
  '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs');
 const first=defaultCombatWorkspaceLayout();
 const moved=editCombatWindow(first,'controls','move',{x:3500,y:3600});
 assert.notEqual(moved,first,'Canvas must move windows beyond the old 1000-unit boundary');
 assert.equal(moved.freeform.positions.controls.x,3500);
 assert.equal(moved.freeform.positions.controls.y,3600);
 assert.deepEqual(normalizeCombatWorkspace(JSON.parse(JSON.stringify(moved))).freeform.positions.controls,
   moved.freeform.positions.controls);
 const overlapped=editCombatWindow(first,'controls','move',{x:0,y:200});
 assert.notEqual(overlapped,first,'Overlapping visible windows must work by default');
 assert.equal(overlapped.freeform.positions.controls.y,200);
 const collisionRestricted={...first,freeform:{...first.freeform,allowOverlap:false}};
 const blocked=editCombatWindow(collisionRestricted,'controls','move',{x:0,y:200});
 assert.equal(blocked,collisionRestricted,'Opt-in collision protection still works');
 const fine=editCombatWindow(first,'controls','move',{x:37,y:83});
 assert.equal(fine.freeform.positions.controls.x,37,'Default must not snap');
 assert.equal(fine.freeform.positions.controls.y,83);
 const snapRestricted={...first,freeform:{...first.freeform,snap:true}};
 assert.equal(editCombatWindow(snapRestricted,'controls','move',{x:37,y:83})
   .freeform.positions.controls.x,40,'Optional snapping must remain available');
 const locked={...first,canvasLocked:true};
 assert.equal(editCombatWindow(locked,'controls','move',{x:3500,y:3600}),locked);
 const camera=normalizeCombatCamera({});
 const closer=zoomCombatCamera(camera,1.5,{x:250,y:200});
 assert.equal(closer.scale,1.5);
 assert.equal(closer.x,250-(250-camera.x)*1.5);
 assert.equal(normalizeCombatCamera({scale:200}).scale,2.5);
 const fitted=fitCombatCamera(first,['controls','initiative'],1200,650);
 assert.ok(fitted.scale>=.25&&fitted.scale<=2.5);
 const resized=editCombatWindow(moved,'controls','resize',{w:700,h:500});
 assert.equal(resized.freeform.positions.controls.w,700);
 assert.equal(resized.freeform.positions.controls.h,500);
 const sizes=normalizeCombatWorkspace({...first,contentScale:{
   controls:1.3,initiative:50,invalid:1.5,map:NaN
 }});
 assert.equal(sizes.contentScale.controls,1.3);
 assert.equal(sizes.contentScale.initiative,1.6);
 assert.equal('invalid' in sizes.contentScale,false);
 assert.equal('map' in sizes.contentScale,false);
 assert.equal(normalizeCombatWorkspace(JSON.parse(JSON.stringify(sizes)))
   .contentScale.controls,1.3,'Window content size must persist with existing layout');
});

test('Combat canvas migrates v1 layouts to free movement while preserving saved geometry',async()=>{
 const {normalizeCombatWorkspace,defaultCombatWorkspaceLayout,editCombatWindow}=await import(
   '../src/dashboards/combat/combatWorkspaceLayoutModel.mjs');
 const legacy=defaultCombatWorkspaceLayout();
 const before=legacy.freeform.positions.controls;
 const prior={...legacy,freeform:{...legacy.freeform,
    interactionVersion:undefined,snap:true,allowOverlap:false}};
 const next=normalizeCombatWorkspace(prior);
 assert.equal(next.freeform.snap,false);
 assert.equal(next.freeform.allowOverlap,true);
 assert.equal(next.freeform.interactionVersion,2);
 assert.deepEqual(next.freeform.positions.controls,before);
 const strict=normalizeCombatWorkspace({...next,freeform:{...next.freeform,
    snap:true,allowOverlap:false}});
 assert.equal(strict.freeform.snap,true);
 assert.equal(strict.freeform.allowOverlap,false);
 assert.notEqual(editCombatWindow(next,'controls','move',{x:-260,y:-120}),next,
    'Canvas should allow dragging left/up beyond the initial origin');
});
test('Freeform pointer interaction uses frame updates, one commit and active-window stacking',()=>{
 const renderer=file('src/dashboards/combat/CombatCommandCentre.jsx');
 const css=file('src/dashboards/combat/CombatCommandCentre.module.css');
 assert.match(renderer,/requestAnimationFrame\(/);
 assert.match(renderer,/paintGesture\(g\)/);
 assert.match(renderer,/node\.style\.transform='translate3d/);
 assert.match(renderer,/if\(selected!==g\.layout\)change\(/);
 assert.match(renderer,/frontWindow===id\?50:1/);
 assert.match(renderer,/wheelTimer/);
 assert.doesNotMatch(renderer,/setPreview\(/);
 assert.doesNotMatch(renderer,/const previewLayout=/);
 assert.match(css,/\.window\.dragging\{/);
 assert.match(css,/will-change:transform/);
});

test('Combat canvas replaces old layout bars with a full-width icon HUD and overlay tool drawer',()=>{
 const renderer=file('src/dashboards/combat/CombatCommandCentre.jsx');
 const css=file('src/dashboards/combat/CombatCommandCentre.module.css');
 const icons=file('src/components/AsteriaIcons.jsx');
 assert.doesNotMatch(renderer,/Auto-arrange|Quick layouts|Restore windows:|Reset layout|Reset view|Saved Layouts|Save layout preset/);
 assert.doesNotMatch(renderer,/className=\{styles\.workArea\}|className=\{styles\.modeBar\}/);
 assert.match(renderer,/className=\{styles\.canvasActions\}/);
 assert.match(renderer,/data-testid="site-combat-canvas-lock"/);
 assert.match(renderer,/aria-label="Undo canvas change"/);
 assert.match(renderer,/aria-label="Redo canvas change"/);
 assert.match(renderer,/data-testid="site-combat-tools-toggle"/);
 assert.match(renderer,/className=\{styles\.drawerBackdrop\}/);
 assert.match(renderer,/className=\{styles\.toolSidebar\}/);
 assert.doesNotMatch(renderer,/className=\{styles\.zoomTools\}|styles\.toolsToggle/);
 assert.match(renderer,/aria-label="Combat canvas controls"/);
 assert.doesNotMatch(renderer,/<h3 className=\{styles\.canvasTitle\}/);
 assert.match(file('src/dashboards/combat/CombatWorkspace.jsx'),/<h2>Combat Command Centre<\/h2>/);
 const toolbar=renderer.match(/<div className=\{styles\.canvasActions\}[\s\S]*?<\/div>/)?.[0];
 assert.ok(toolbar,'Single canvas control toolbar must exist');
 const approved=[
   'data-testid="site-combat-tools-toggle"',
   'aria-label="Undo canvas change"',
   'data-testid="site-combat-canvas-lock"',
   'aria-label="Redo canvas change"',
   'aria-label="Zoom into canvas"',
   'data-testid="site-combat-fit-all"',
   'aria-label="Zoom out of canvas"'
 ];
 let last=-1;
 for(const control of approved){
   const at=toolbar.indexOf(control);
   assert.ok(at>last,'Toolbar order or missing control: '+control);
   last=at;
 }
 assert.match(css,/\.canvasActions\{[^}]*right:12px/s);
 assert.match(renderer,/togglePanel\(id\)/);
 assert.match(renderer,/Snap windows to grid/);
 assert.match(renderer,/Allow window overlap/);
 assert.match(css,/\.toolSidebar\[hidden\]\{display:none\}/);
 assert.match(css,/\.canvas\{[^}]*height:max\(580px,calc\(100dvh - 190px\)\)/s);
 assert.doesNotMatch(css,/\.workArea\{|\.modeBar\{|\.quickActions\{/);
 for(const name of ['unlock','undo','redo','zoomIn','zoomOut','fitCanvas'])
   assert.match(icons,new RegExp('  '+name+':'));
});

test('Canvas wheel is contained and bezel content can focus and scale',()=>{
 const renderer=file('src/dashboards/combat/CombatCommandCentre.jsx');
 const css=file('src/dashboards/combat/CombatCommandCentre.module.css');
 assert.match(renderer,/viewport\.addEventListener\('wheel',wheel,\{passive:false,capture:true\}\)/);
 assert.match(renderer,/const zoomRequested=!overWindow\|\|event\.ctrlKey\|\|event\.metaKey/);
 assert.match(renderer,/event\.preventDefault\(\)/);
 assert.match(renderer,/data-combat-scroll/);
 assert.match(renderer,/onDoubleClick=\{event=>/);
 assert.match(renderer,/aria-label=\{'Content size for '\+label\}/);
 assert.match(css,/\.windowBody\{/);
 assert.match(css,/container-name:combatWindow/);
 assert.match(css,/\.window\[data-combat-panel\]::before/);
 assert.doesNotMatch(css,/\.zoomTools\{|\.canvasTitle\{|\.toolsToggle\{/);
});

test('GM Combat Phase 1 uses one canvas camera, bounded placements and recoverable focus',async()=>{
 const renderer=file('src/dashboards/combat/CombatCommandCentre.jsx');
 const css=file('src/dashboards/combat/CombatCommandCentre.module.css');
 const {defaultCombatWorkspaceLayout,normalizeCombatWorkspace,editCombatWindow,
  COMBAT_PANEL_IDS,fitCombatCamera,focusCombatCamera,clampCombatCamera,
  normalizeCombatCamera,orderedCombatPartyIds,moveCombatPartyCard}=
   await import('../src/dashboards/combat/combatWorkspaceLayoutModel.mjs');
 const layout=defaultCombatWorkspaceLayout();
 assert.equal(COMBAT_PANEL_IDS.length,14);
 assert.ok(COMBAT_PANEL_IDS.includes('resources'));
 assert.ok(layout.freeform.positions.resources);
 assert.equal(layout.hidden.includes('resources'),false);
 const legacy=normalizeCombatWorkspace({...layout,freeform:{
   ...layout.freeform,positions:Object.fromEntries(
     Object.entries(layout.freeform.positions).filter(([id])=>id!=='resources'))}});
 assert.equal(legacy.freeform.positions.resources.x,1020,
   'Existing GM combat placements must not be overwritten by the Resources window');
 const moved=editCombatWindow(layout,'resources','move',{x:99999,y:99999});
 assert.ok(moved.freeform.positions.resources.x<=4500);
 assert.ok(moved.freeform.positions.resources.y<=4500);
 const far=editCombatWindow(layout,'resources','move',{x:3600,y:3800});
 const visible=COMBAT_PANEL_IDS.filter(id=>!far.hidden.includes(id));
 const fit=fitCombatCamera(far,visible,1440,680);
 assert.ok(fit.scale>=.04&&fit.scale<=2.5);
 const clamped=clampCombatCamera({scale:1,x:-12000,y:-12000},far,visible,1440,680);
 assert.ok(clamped.x>-12000&&clamped.y>-12000,
   'Panning should not strand the canvas in empty space');
 const focus=focusCombatCamera(far,'resources',1440,680);
 assert.ok(focus.scale>0);
 assert.notDeepEqual(focus,fit,'Focus must target selected window, not Fit All');
 assert.deepEqual(normalizeCombatCamera(focus),focus);
 assert.deepEqual(orderedCombatPartyIds(['kael','lyra','new'],['lyra','old']),['lyra','kael','new']);
 assert.deepEqual(moveCombatPartyCard(['kael','lyra','new'],'new','kael'),['new','kael','lyra']);
 const stored=normalizeCombatWorkspace({...layout,partyCardOrder:['lyra','kael','lyra']});
 assert.deepEqual(stored.partyCardOrder,['lyra','kael']);
 assert.match(renderer,/focusWindow=id=>/);
 assert.match(renderer,/onDoubleClick=\{event=>/);
 assert.match(renderer,/event\.button===1/);
 assert.match(renderer,/spaceHeld\.current/);
 assert.match(renderer,/data-overview=/);
 assert.match(renderer,/renderPartyResources|onReorder:/);
 assert.doesNotMatch(renderer,/setMaximised|stageMaximised|styles\.maximised/);
 assert.match(css,/\.cameraFocus\{/);
 assert.match(css,/\.canvas\[data-overview='true'\]/);
});
test('GM Resources window reuses live character resources and existing dashboard permission checks',()=>{
 const gm=file('src/dashboards/GMDashboard.jsx');
 const workspace=file('src/dashboards/combat/CombatWorkspace.jsx');
 const css=file('src/styles/asteria-react.css');
 assert.match(gm,/resourceDefinitions\(character\)\.map/);
 assert.match(gm,/storedResource\(character,row\.id\)/);
 assert.match(gm,/ResourceBar compact label="XP"/);
 assert.match(gm,/character\.image\|\|character\.portrait/);
 assert.match(gm,/react-party-reorder/);
 assert.match(gm,/orderedCombatPartyIds\(present,order\)/);
 assert.match(gm,/onDragStart=\{event=>/);
 assert.match(gm,/onDrop=\{reorderable\?/);
 assert.match(gm,/data-testid="gm-combat-party-resources"/);
 assert.match(gm,/data-testid="gm-player-resources-strip"/);
 assert.match(gm,/\{tab!=='combat'\?/);
 assert.match(gm,/window\.AsteriaCharacterAccess\?\.canGMView/);
 assert.match(gm,/<CharacterDashboard campaignId=\{campaignId\} characterId=\{canvasCharacterId\}/);
 assert.match(gm,/react-canvas-character-dashboard/);
 assert.match(workspace,/renderPartyResources/);
 assert.match(css,/\.react-party-card-portrait/);
 assert.match(css,/\.react-modal:has\(\.react-canvas-character-dashboard\)/);
});
