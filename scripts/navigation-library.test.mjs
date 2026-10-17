import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import canonical from '../data/compendium.js';
function runtime(rows=canonical.entries,nodes={}){
  const history=[];const views=[];
  const context={URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},window:{
    addEventListener(){},AsteriaUniversalCompendium:{visibleEntries:()=>rows},location:{hash:'#/compendium'},history:{state:null,pushState(_state,_title,url){history.push(url);context.window.location.hash=url;},replaceState(_state,_title,url){history.push(url);context.window.location.hash=url;}},setView:id=>views.push(id)
  },document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],body:{classList:{remove(){}}}}};
  const source=fs.readFileSync('js/asteria-navigation.js','utf8').replace(/\}\)\(\);\s*$/, 'window.testNavigation={syncNavigation};})();');
  vm.createContext(context);vm.runInContext(source,context);
  return {api:context.window.AsteriaLibrary,window:context.window,history,views,syncNavigation:context.window.testNavigation.syncNavigation};
}
test('six navigation groups retain every 00–25 category plus the Handbook without changing definitions',()=>{
  const {api}=runtime();assert.equal(api.groups.length,6);
  const codes=new Set(api.categories.map(c=>c.code));
  for(let i=0;i<=25;i++)assert.ok(codes.has(String(i).padStart(2,'0')));
  assert.ok(codes.has('handbook'));
  const before=JSON.stringify(canonical.entries);
  const categories=new Set(api.categories.map(c=>c.id));
  for(const entry of canonical.entries)assert.ok(categories.has(api.classify(entry)),entry.id);
  assert.equal(api.entries().length,canonical.entries.length);assert.equal(JSON.stringify(canonical.entries),before);
  assert.equal(api.entries()[0],canonical.entries[0]);
});
test('source categories and crafting families project into navigation while permanent IDs remain independent',()=>{
  const {api}=runtime();
  assert.equal(api.classify({domain:'item',metadata:{type:'Recipe','Asteria ID Index Code':'09-01-001-001'}}),'recipes');
  assert.equal(api.classify({domain:'item',metadata:{sourceCategory:'18. Structures','Asteria ID Index Code':'06-06-001-001'}}),'structures');
  assert.equal(api.classify({domain:'spell',metadata:{}}),'magic');
  assert.equal(api.classify({domain:'profession',metadata:{}}),'professions');
  assert.equal(api.classify({domain:'item',categoryPath:['Resources & Materials','Metals']}),'resources');
});
test('global search finds actual pages and IDs, and category filtering never fabricates a page',()=>{
  const rows=[{id:'one',title:'Rose',domain:'item',searchTerms:'rose flower',metadata:{'Asteria ID Index Code':'07-05-001-001'},categoryPath:['Resources']},{id:'two',title:'Recipe',domain:'item',searchTerms:'recipe rose',metadata:{type:'Recipe'}}];
  const {api,history}=runtime(rows);
  api.open({search:'07-05-001-001'});assert.equal(api.filtered().length,1);assert.equal(api.filtered()[0].id,'one');
  api.open({category:'recipes',search:'rose'});assert.equal(api.filtered().length,1);assert.equal(api.filtered()[0].id,'two');
  assert.match(history.at(-1),/group=crafting&category=recipes&q=rose/);
  api.open({category:'blueprints'});assert.equal(api.filtered().length,0);assert.equal(rows.length,2);
});
test('library root routes restore filters and history without intercepting existing definition bookmarks',()=>{
  const {api,window,history,views}=runtime();
  window.location.hash='#/compendium?group=characters&category=races&q=sprite';
  assert.equal(api.readRoute(),true);assert.equal(history.length,0);assert.equal(views.at(-1),'compendiumLibrary');
  assert.ok(api.filtered().length>0);assert.ok(api.filtered().every(e=>e.domain==='race'&&e.searchTerms.includes('sprite')));
  window.location.hash='#/compendium/item/iron-ore';assert.equal(api.readRoute(),false);assert.equal(history.length,0);
  window.location.hash='#/react/character/campaign/kael';assert.equal(api.readRoute(),false);
});
test('the library uses the authoritative visibility filter rather than exposing raw registry data',()=>{
  const rows=[{id:'public',title:'Public',domain:'item',metadata:{}}];
  const {api}=runtime(rows);assert.equal(api.entries().length,1);assert.equal(api.entries()[0].id,'public');
  const source=fs.readFileSync('js/asteria-navigation.js','utf8');
  assert.match(source,/visibleEntries\?\./);assert.doesNotMatch(source,/ASTERIA_UNIVERSAL_COMPENDIUM_INDEX/);
  const html=fs.readFileSync('index.html','utf8');assert.doesNotMatch(html,/class="sidebar public-sidebar"/);
  for(const id of ['characterForgeTop','campaignsTop','accountSettingsTop','settingsToggle','loginToggle'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
test('selected navigation follows the visible workspace even when a legacy hash remains',()=>{
  const shown=new Set(['compendiumLibrary']);
  const ids=['sidebarHomeButton','compendiumIndexButton','characterForgeTop','campaignsTop','accountSettingsTop'];
  const nodes=Object.fromEntries(ids.map(id=>[id,{attributes:{},setAttribute(name,value){this.attributes[name]=value;},classList:{toggle(){}}}]));
  for(const id of ['home','compendiumLibrary','universal-compendium-shell','asteria-workspace-shell','phase3GameplayShell'])nodes[id]={getClientRects:()=>shown.has(id)?[{}]:[],classList:{contains:()=>true}};
  nodes['auth-workspace-mode-filter']={value:'settings'};
  const {syncNavigation,window}=runtime([],nodes);
  window.location.hash='#/compendium';syncNavigation();
  assert.equal(nodes.compendiumIndexButton.attributes['aria-current'],'page');
  shown.clear();shown.add('home');syncNavigation();
  assert.equal(nodes.sidebarHomeButton.attributes['aria-current'],'page');
  assert.equal(nodes.compendiumIndexButton.attributes['aria-current'],'false');
  shown.clear();shown.add('asteria-workspace-shell');syncNavigation();
  assert.equal(nodes.accountSettingsTop.attributes['aria-current'],'page');
  assert.equal(nodes.sidebarHomeButton.attributes['aria-current'],'false');
  assert.equal(nodes.compendiumIndexButton.attributes['aria-current'],'false');
});
