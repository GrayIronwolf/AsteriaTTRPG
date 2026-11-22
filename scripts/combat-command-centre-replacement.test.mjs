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
