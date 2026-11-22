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
 assert.match(workspace,/COMBAT_PANEL_IDS\.map\(id=>/);
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
