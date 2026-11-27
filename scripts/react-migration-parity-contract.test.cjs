/* 1:1 migration source contract for the recovered pre-migration website.
 * This does not prove visual parity; browser screenshots and interaction tests are separate gates.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

const expectedViews=[
 'home','workspace','reactDashboard','loginPage','forgotPassword','accountCreate',
 'playerHome','campaigns','player','map','crafting','gm','gmPlayer','quests',
 'creature','devLog','asteriaFriendsPage','asteriaNotificationsPage','asteriaAccountPage'
];
test('all original website view roots remain until an approved replacement is verified',()=>{
 const html=read('index.html');
 const actual=new Set([...html.matchAll(/<(?:section|div|main)\b(?=[^>]*class="[^"]*\bview\b)[^>]*id="([^"]+)"/g)].map(x=>x[1]));
 for(const id of expectedViews)assert.ok(actual.has(id),'Missing original view: '+id);
 console.log('Verified '+expectedViews.length+' original view roots.');
});
test('original global navigation and account controls remain present',()=>{
 const html=read('index.html');
 for(const id of ['asteriaHeaderBrand','globalNavigation','asteriaHandbookTop','worldLoreTop',
  'compendiumIndexButton','characterForgeTop','campaignsTop','asteriaFriendsTop',
  'accountControls','asteriaHeaderProfile','asteriaHeaderMail']) {
  assert.match(html,new RegExp('\\bid="'+id+'"'),'Missing header control: '+id);
 }
});
test('old shell remains connected to existing React dashboard bridge',()=>{
 const html=read('index.html'),bridge=read('src/app/legacyBridge.js'),entry=read('src/main.jsx');
 assert.match(html,/src\/dev-entry\.js/);
 assert.match(html,/id="asteriaReactRoot"/);
 assert.match(bridge,/export function activateReactDashboard/);
 assert.match(bridge,/export function openLegacyView/);
 assert.match(entry,/import\('\.\/app\/mountDashboard\.jsx'\)/);
 assert.match(read('src/app/mountDashboard.jsx'),/createRoot\(host\)/);
});
test('existing React deep-link categories remain supported',()=>{
 const source=read('src/app/asteriaRoutes.mjs');
 assert.match(source,/owned-character/);
 assert.match(source,/\(gm\|character\|presentation\)/);
 assert.match(source,/export function parseReactRoute/);
 assert.match(source,/export function buildReactRoute/);
});
test('original Character Forge and Campaign Forge entry points remain',()=>{
 const gameplay=read('js/asteria-gameplay-systems.js');
 const compendium=read('js/clean-compendium.js');
 for(const fn of ['openCharacterForgeHub','startNewCharacterForge'])assert.ok(gameplay.includes(fn),fn);
 for(const fn of ['openCampaignCreateForm','createWorkspaceCampaign','joinCampaignByUCN','linkCharacterToCampaign']){
  assert.ok(compendium.includes(fn),fn);
 }
});
test('existing player and GM dashboards are not deleted or replaced with stubs',()=>{
 const player=read('src/dashboards/CharacterDashboard.jsx');
 const gm=read('src/dashboards/GMDashboard.jsx');
 const layout=read('src/components/DashboardCustomisation.jsx');
 assert.match(player,/export function CharacterDashboard\(/);
 assert.match(player,/<PlayerDashboardOverview\b/);
 assert.match(player,/<CombatDashboardLayout\b/);
 assert.match(gm,/export function GMDashboard\(/);
 assert.match(gm,/<CanvasWorkspace\b/);
  assert.doesNotMatch(gm,/<DashboardLayoutWorkspace\b/);
 assert.match(gm,/<GMCombatWorkspace\b/);
 assert.doesNotMatch(gm,/function CampaignEncounter\(/);
 assert.match(layout,/export function DashboardLayoutEditor/);
});
test('React remains compiled into the hybrid site rather than replacing its HTML document',()=>{
 const vite=read('vite.config.mjs');
 assert.match(vite,/outDir: 'react-dist'/);
 assert.match(vite,/input: resolve\(process\.cwd\(\), 'src\/main\.jsx'\)/);
 const html=read('index.html');
 assert.match(html,/css\/styles\.css/);
 assert.match(html,/js\/app\.js/);
});
