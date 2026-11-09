import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import canonical from '../data/compendium.js';
function runtime(rows=canonical.entries,nodes={},storage={}){
  const history=[];const views=[];
  const context={URLSearchParams,localStorage:{getItem:key=>storage[key]||null,setItem(key,value){storage[key]=value;}},window:{
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
  for(const id of ['characterForgeTop','campaignsTop','settingsToggle','loginToggle','accountMenuSettings'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
test('selected navigation follows the visible workspace even when a legacy hash remains',()=>{
  const shown=new Set(['compendiumLibrary']);
  const ids=['sidebarHomeButton','compendiumIndexButton','characterForgeTop','campaignsTop'];
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
  assert.equal(nodes.campaignsTop.attributes['aria-current'],'false');
  assert.equal(nodes.sidebarHomeButton.attributes['aria-current'],'false');
  assert.equal(nodes.compendiumIndexButton.attributes['aria-current'],'false');
});

test('Phase 5 library matches exact permanent IDs, partial prefixes, aliases and category terms without creating definitions',()=>{
  const rows=[
    {id:'rose',title:'Red Primdale',domain:'item',route:'/compendium/item/red-primdale',metadata:{'Asteria ID Index Code':'07-05-001-001'},categoryPath:['Resources & Materials','Flowers'],aliases:['Blood Meadow Rose'],searchTerms:'red primdale flower'},
    {id:'spell',title:'Rose Flame',domain:'spell',route:'/compendium/spell/rose-flame',metadata:{'Asteria ID Index Code':'05-01-001-004'},categoryPath:['Magic'],searchTerms:'rose flame'},
    {id:'recipe',title:'Bloom Tonic',domain:'item',route:'/compendium/item/bloom-tonic',metadata:{type:'Recipe','Asteria ID Index Code':'09-01-001-002'},categoryPath:['Recipes'],searchTerms:'tonic'}
  ];
  const original=JSON.stringify(rows),{api}=runtime(rows);
  assert.equal(api.matchesSearch(rows[0],'07-05-001-001'),true);
  assert.equal(api.matchesSearch(rows[1],'07-05-001-001'),false);
  api.open({search:'07-05'});assert.deepEqual(api.filtered().map(e=>e.id),['rose']);
  api.open({search:'blood meadow'});assert.deepEqual(api.filtered().map(e=>e.id),['rose']);
  api.open({search:'flowers'});assert.deepEqual(api.filtered().map(e=>e.id),['rose']);
  api.open({search:'05-01-001-004'});assert.deepEqual(api.filtered().map(e=>e.id),['spell']);
  api.open({group:'crafting',category:'recipes',search:'tonic'});
  assert.deepEqual(api.filtered().map(e=>e.id),['recipe']);
  assert.equal(JSON.stringify(rows),original,'Navigation must not mutate canonical content');
});

test('Phase 5 library sorts reliably and restores bookmarked favourites and filters',()=>{
  const rows=[
    {id:'b',title:'Ore Chart',domain:'item',metadata:{'Asteria ID Index Code':'07-03-001-004'},categoryPath:['Resources'],searchTerms:'ore chart'},
    {id:'c',title:'Iron Ore',domain:'item',metadata:{'Asteria ID Index Code':'07-03-001-002'},categoryPath:['Resources'],searchTerms:'iron ore'},
    {id:'a',title:'Ore',domain:'item',metadata:{'Asteria ID Index Code':'07-03-001-001'},categoryPath:['Resources'],searchTerms:'ore'},
    {id:'recipe',title:'Ore Recipe',domain:'item',metadata:{type:'Recipe'},categoryPath:['Recipes'],searchTerms:'ore'}
  ];
  const storage={'asteria.library.favourites.guest':JSON.stringify(['b','a'])};
  const {api,window,history}=runtime(rows,{},storage);
  api.open({search:'ore'});assert.equal(api.filtered()[0].id,'a','Exact title is ranked first');
  api.open({search:'ore',sort:'name'});
  assert.deepEqual(api.filtered().map(x=>x.id),['c','a','b','recipe']);
  api.open({saved:true,sort:'name',search:'ore'});
  assert.deepEqual(api.filtered().map(x=>x.id),['a','b']);
  assert.match(history.at(-1),/saved=1&sort=name/);
  window.location.hash=history.at(-1);
  api.readRoute();
  assert.deepEqual(api.filtered().map(x=>x.id),['a','b']);
  api.open({group:'equipment',category:'resources',saved:true});
  assert.deepEqual(api.filtered().map(x=>x.id),['b','a']);
});

test('Phase 5 Compendium shows accessible responsive filters, permanent IDs and keeps definition routes',()=>{
  const entry={id:'rose',title:'Red Primdale',domain:'item',route:'/compendium/item/red-primdale',
    summary:'A red flowering plant',metadata:{'Asteria ID Index Code':'07-05-001-001'},
    categoryPath:['Resources & Materials','Flowers'],searchTerms:'red primdale'};
  const view={innerHTML:'',querySelectorAll(){return [];}};
  const nodes={compendiumLibrary:view};
  for(const id of ['librarySearch','libraryGroupFilter','libraryCategoryFilter','librarySort','librarySavedOnly','libraryLoadMore'])
    nodes[id]={listeners:{},addEventListener(event,handler){this.listeners[event]=handler;},focus(){}};
  const {api,history}=runtime([entry],nodes);
  api.open({search:'red'});
  for(const id of ['libraryGroupFilter','libraryCategoryFilter','librarySort','librarySavedOnly'])assert.match(view.innerHTML,new RegExp('id="'+id+'"'));
  assert.match(view.innerHTML,/aria-live="polite"/);
  assert.match(view.innerHTML,/07-05-001-001/);
  assert.match(view.innerHTML,/data-library-entry="rose"/);
  assert.match(view.innerHTML,/href="#\/compendium\/item\/red-primdale"/);
  nodes.librarySort.listeners.change({target:{value:'name'}});
  assert.match(history.at(-1),/sort=name/);
  nodes.libraryGroupFilter.listeners.change({target:{value:'equipment'}});
  assert.match(history.at(-1),/group=equipment/);
  nodes.libraryCategoryFilter.listeners.change({target:{value:'resources'}});
  assert.match(history.at(-1),/category=resources/);
  nodes.librarySavedOnly.listeners.change({target:{checked:true}});
  assert.match(history.at(-1),/saved=1/);
  assert.match(view.innerHTML,/No published entries match the selected filters/);
  const css=fs.readFileSync('css/asteria-navigation.css','utf8');
  assert.match(css,/\.library-filter-bar/);
  assert.match(css,/@media\(max-width:600px\)/);
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/js\/asteria-navigation\.js\?v=[a-z0-9-]+/);
  assert.match(html,/css\/asteria-navigation\.css\?v=phase5-update3-20261106/);
  assert.ok(api.groups.length===6);
});
