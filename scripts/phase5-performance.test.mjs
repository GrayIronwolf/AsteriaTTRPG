import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const exists=path=>statSync(new URL('../'+path,import.meta.url)).size;

test('Initial header preload targets the separate wordmark without loading the retired banner',()=>{
  const html=read('index.html'),css=read('css/asteria-menu-buttons.css');
  const preloads=[...html.matchAll(/<link[^>]*rel="preload"[^>]*as="image"[^>]*>/g)].map(x=>x[0]);
  assert.equal(preloads.length,1);
  assert.match(preloads[0],/href="assets\/header\/asteria-wordmark\.png"/);
  assert.match(preloads[0],/fetchpriority="high"/);
  assert.match(css,/--asteria-header-art:none/);
  assert.ok(exists('assets/header/asteria-wordmark.png')>0);
  assert.doesNotMatch(preloads[0],/asteria-header-v2/);
});

test('Registry builds a single talent lookup and preserves class talent order and independent lists',()=>{
  const text=read('js/compendium-registry.js');
  assert.match(text,/const talentsByClass = new Map\(\)/);
  assert.match(text,/for\(const entry of staticEntries\)/);
  assert.match(text,/entry\.talents = \(talentsByClass\.get\(entry\.slug\) \|\| \[\]\)\.slice\(\)/);
  assert.doesNotMatch(text,/staticEntries\.filter\(talent => talent\.domain === 'talent'/);
  const entries=[
    {id:'class1',domain:'class',slug:'spellblade',title:'Spellblade',metadata:{},categoryPath:[],sections:{},tags:[],sourcePath:'class1',route:'/class1'},
    {id:'t2',domain:'talent',slug:'spark',title:'Spark',metadata:{className:'Spellblade'},categoryPath:[],sections:{},tags:[],sourcePath:'t2',route:'/t2'},
    {id:'t3',domain:'talent',slug:'focus',title:'Focus',metadata:{className:'Sage'},categoryPath:[],sections:{},tags:[],sourcePath:'t3',route:'/t3'},
    {id:'t4',domain:'talent',slug:'burst',title:'Burst',metadata:{className:'Spellblade'},categoryPath:[],sections:{},tags:[],sourcePath:'t4',route:'/t4'},
    {id:'class2',domain:'class',slug:'sage',title:'Sage',metadata:{},categoryPath:[],sections:{},tags:[],sourcePath:'class2',route:'/class2'},
    {id:'class3',domain:'class',slug:'spellblade',title:'Spellblade Copy',metadata:{},categoryPath:[],sections:{},tags:[],sourcePath:'class3',route:'/class3'}
  ];
  const win={ASTERIA_UNIVERSAL_COMPENDIUM_INDEX:{
    entries,aliases:{},tabTemplates:{item:[]},lazy:false
  }};
  vm.runInNewContext(text,{window:win});
  assert.deepEqual([...win.AsteriaContent.entries().find(e=>e.id==='class1').talents.map(x=>x.id)],['t2','t4']);
  assert.deepEqual([...win.AsteriaContent.entries().find(e=>e.id==='class2').talents.map(x=>x.id)],['t3']);
  const spellblade=win.AsteriaContent.entries().find(e=>e.id==='class1');
  const copy=win.AsteriaContent.entries().find(e=>e.id==='class3');
  assert.notEqual(spellblade.talents,copy.talents);
  assert.equal(spellblade.talents[0],entries[1],'The original authoritative entry is reused');
});

test('Compendium search batches rapid keystrokes into one visual update per frame',()=>{
  const source=read('js/asteria-navigation.js');
  assert.match(source,/let searchFrame=0/);
  assert.match(source,/window\.cancelAnimationFrame\(searchFrame\)/);
  assert.match(source,/window\.requestAnimationFrame\(\(\)=>\{/);
  assert.match(source,/searchFrame=0;render\(\);route\(false\);/);
  assert.match(source,/else \{searchFrame=0;render\(\);route\(false\);\}/);
  assert.match(read('index.html'),/js\/asteria-navigation\.js\?v=phase6-update1-20261106/);
});

test('Previous approved artwork and on-demand dashboard runtime are unchanged',()=>{
 const html=read('index.html'),source=read('src/main.jsx');
 for(const token of [
   'asteria-smoke-background.css','asteria-button-images.css',
   'asteria-panel-headers.css','asteria-dashboard-panel-images.css',
   'asteria-freeform-dashboard.css'
 ])assert.ok(html.includes(token),token);
 assert.match(source,/import\('\.\/app\/mountDashboard\.jsx'\)/);
 assert.match(source,/window\.AsteriaContent\?\.ensureDomains/);
 assert.match(html,/js\/compendium-registry\.js\?v=phase5-update4-20261106/);
});
