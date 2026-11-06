import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Compendium favourites use authenticated session identity, including same-role switches and logout',()=>{
  const rows=[
    {id:'one',title:'One',domain:'item',metadata:{},categoryPath:['Items'],route:'/compendium/item/one'},
    {id:'two',title:'Two',domain:'item',metadata:{},categoryPath:['Items'],route:'/compendium/item/two'}
  ];
  let account={role:'account',uid:'alpha'};
  const state={
    'asteria.library.favourites.alpha':JSON.stringify(['one']),
    'asteria.library.favourites.beta':JSON.stringify(['two']),
    'asteria.library.favourites.guest':JSON.stringify([])
  };
  const view={classList:{contains:()=>true},innerHTML:'',querySelectorAll:()=>[]};
  const nodes={compendiumLibrary:view};
  const window={
    AsteriaAuthBridge:{getSession:()=>({...account})},
    AsteriaFirebase:{getUser:()=>({uid:'alpha'})},
    AsteriaUniversalCompendium:{visibleEntries:()=>rows},
    location:{hash:'#/compendium'},
    history:{state:null,pushState(){},replaceState(){}},
    setView(){},addEventListener(){},
  };
  const context={URLSearchParams,window,localStorage:{getItem:key=>state[key]||null,setItem(key,val){state[key]=val;}},
    document:{readyState:'loading',getElementById:id=>nodes[id]||null,activeElement:null,
      querySelectorAll:()=>[],body:{classList:{remove(){}}},addEventListener(){}}};
  vm.createContext(context);
  vm.runInContext(read('js/asteria-navigation.js'),context);
  window.AsteriaLibrary.open({saved:true});
  assert.deepEqual(window.AsteriaLibrary.filtered().map(x=>x.id),['one']);
  assert.match(view.innerHTML,/One/);
  account={role:'account',uid:'beta'};
  window.AsteriaLibrary.refreshAccount();
  assert.deepEqual(window.AsteriaLibrary.filtered().map(x=>x.id),['two']);
  assert.match(view.innerHTML,/Two/);
  account={role:'guest',uid:null,account:null};
  window.AsteriaLibrary.refreshAccount();
  assert.deepEqual(window.AsteriaLibrary.filtered().map(x=>x.id),[],'Stale Firebase identity cannot reveal former favourites');
  assert.match(view.innerHTML,/0 matching entries/);
  account={role:'account',uid:'alpha'};
  window.AsteriaLibrary.refreshAccount();
  assert.deepEqual(window.AsteriaLibrary.filtered().map(x=>x.id),['one']);
});

test('Auth login, same-role identity changes and logout refresh Compendium and typography',()=>{
  const auth=read('js/auth-bridge.js');
  assert.match(auth,/document\.body\.dataset\.role = 'account';[\s\S]{0,260}AsteriaTypography\?\.refreshAccount\?\.\(\);[\s\S]{0,100}AsteriaLibrary\?\.refreshAccount\?\.\(\)/);
  assert.match(auth,/document\.body\.dataset\.role='guest';[\s\S]{0,170}AsteriaLibrary\?\.refreshAccount\?\.\(\)/);
  const nav=read('js/asteria-navigation.js');
  assert.match(nav,/function libraryAccountKey\(\)/);
  assert.match(nav,/session\.role==='guest'/);
  assert.match(nav,/window\.addEventListener\('storage'/);
});

test('Dashboard modal traps Tab, releases canceled pointers, and protects locked keyboard moves',()=>{
  const code=read('src/components/DashboardCustomisation.jsx');
  assert.match(code,/onPointerCancel=\{cancel\}\s+onLostPointerCapture=\{cancel\}/);
  assert.match(code,/const cancel=e=>\{/);
  assert.match(code,/grid\.current\?\.releasePointerCapture\?\.\(e\.pointerId\)/);
  assert.match(code,/if\(disabled\|\|lock\)return;/);
  assert.match(code,/aria-label=\{'Resize '\+item\.label\} disabled=\{disabled\}/);
  assert.match(code,/onKeyDown=\{e=>\{[\s\S]{0,220}size\(id,pos\.w/);
  assert.match(code,/if\(e\.key!=='Tab'\)return/);
  assert.match(code,/dialogRef\.current\?\.contains\(document\.activeElement\)/);
  assert.match(code,/e\.stopPropagation\(\);first\.focus\(\)/);
  assert.match(code,/if\(e\.key==='Escape'\)\{e\.preventDefault\(\)/);
  assert.match(code,/Apply Layout to Settings/);
  assert.match(code,/Save Dashboard Settings/);
});

test('Menu labels respect the 1679px navigation breakpoint while the active dialog is open',()=>{
  const shell=read('js/asteria-core-shell.js');
  assert.match(shell,/window\.matchMedia\?\.\('\(max-width: 1679px\)'\)/);
  assert.match(shell,/compact\?'Close main menu':'Close menu and appearance'/);
  assert.match(shell,/compact\?'Open main menu':'Open menu and appearance'/);
  const nav=read('js/asteria-navigation.js');
  assert.match(nav,/matchMedia\('\(max-width: 1679px\)'\)/);
});

test('Approved artwork, gameplay definitions and loading architecture remain in place',()=>{
  const html=read('index.html');
  for(const asset of ['asteria-button-images.css','asteria-panel-headers.css','asteria-dashboard-panel-images.css',
    'asteria-smoke-background.css','asteria-freeform-dashboard.css'])
    assert.ok(html.includes(asset),asset);
  assert.match(read('src/main.jsx'),/import\('\.\/app\/mountDashboard\.jsx'\)/);
  assert.match(read('js/asteria-typography.js'),/const FONTS = Object\.freeze/);
  assert.match(read('js/asteria-navigation.js'),/Asteria ID Index Code/);
});
