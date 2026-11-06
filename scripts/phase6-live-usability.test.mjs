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

test('Existing dashboard grid drag, resize, lock and save behavior stays protected',()=>{
  const editor=read('src/components/DashboardCustomisation.jsx');
  assert.match(editor,/onPointerMove=\{drag\}\s+onPointerUp=\{end\}/);
  assert.match(editor,/onPointerCancel=/);
  assert.match(editor,/if\(disabled\|\|gesture\.current\|\|e\.isPrimary===false\|\|e\.button!==0\|\|layout\.lockedPositions\.includes\(id\)\)return/);
  assert.match(editor,/onKeyDown=\{e=>\{/);
  assert.match(editor,/e\.altKey/);
  assert.match(editor,/const next=propose\(g,e\)/);
  assert.match(editor,/onChange\(draft\);setOpen\(false\)/);
  assert.match(editor,/Apply Layout to Settings/);
  assert.match(editor,/Save Dashboard Settings/);
  // Editor enhancements that alter JSX require a matching committed production
  // bundle; this release does not pretend an unbuilt source change is live.
  const html=read('index.html');
  assert.match(html,/src\/dev-entry\.js/);
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
