import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const menu=read('js/asteria-aaa-upgrade.js');
const library=read('js/asteria-navigation.js');
const viewer=read('js/universal-compendium-engine.js');
const template=read('js/asteria-page-template.js');
const styles=read('css/asteria-page-template-library.css');

test('Phase 2 loads the new CSS last, activates the shared template and refreshes changed scripts',()=>{
  assert.match(html,/css\/asteria-page-template-library\.css\?v=universal-phase2-20261118/);
  assert.ok(html.indexOf('css/asteria-page-template-library.css')>html.indexOf('css/asteria-page-template.css'));
  assert.match(html,/js\/asteria-aaa-upgrade\.js\?v=universal-phase2-20261118/);
  assert.match(html,/js\/universal-compendium-engine\.js\?v=universal-phase2-20261118/);
  assert.ok(html.indexOf('js/asteria-page-template.js')<html.indexOf('js/asteria-aaa-upgrade.js'));
  assert.match(template,/root\.AsteriaPageTemplate=Object\.freeze\(\{adopt,create,ensureHeader\}\)/);
});

test('All three primary library menus use the same Account-style shell and direct-link route selection',()=>{
  for(const [key,title] of [['handbook','Asteria Handbook'],['world','Worlds & Lore'],['compendium','Asteria Compendium']]){
    assert.match(menu,new RegExp("id:'"+key+"', trigger:"));
    assert.ok(menu.includes("title:'"+title+"'"));
  }
  assert.match(menu,/const sectionId=\['rules','adventures'\]\.includes\(route\.group\)\?'handbook'/);
  assert.match(menu,/route\.group==='world'\?'world':'compendium'/);
  assert.doesNotMatch(menu,/const active=libraryMenuSelection\?/);
  assert.match(menu,/window\.AsteriaPageTemplate\?\.adopt\?\.\(\{/);
  for(const selector of [".aaa-library-layout",".aaa-category-sidebar",".aaa-category-links",".aaa-library-content"])
    assert.ok(menu.includes(selector),selector);
  assert.match(menu,/body\.prepend\(tools\)/);
  assert.match(menu,/links\.setAttribute\('aria-label'/);
  assert.match(menu,/label\.className='asteria-template-nav-label'/);
});

test('Library retains existing search, saved views, categories, route bookmarks and readable metadata',()=>{
  for(const method of ["librarySearch","libraryGroupFilter","libraryCategoryFilter","librarySort",
    "librarySavedOnly","libraryLoadMore","data-library-favourite","library-breadcrumbs"]){
    assert.ok(library.includes(method),method);
  }
  assert.match(menu,/const search=root\.querySelector\('\.library-search'\)/);
  assert.match(menu,/const filters=root\.querySelector\('\.library-filter-bar'\)/);
  assert.match(menu,/tools\.appendChild\(search\)/);
  assert.match(menu,/tools\.appendChild\(filters\)/);
  assert.match(menu,/if\(el===hero \|\| el\.classList\.contains\('library-breadcrumbs'\)\)continue/);
  assert.match(library,/visibleEntries\?\.\(true\)/);
  assert.match(library,/definitionCode\(entry\)/);
});

test('Compendium detail pages use same shell without replacing entry and GM-permission controllers',()=>{
  assert.match(viewer,/class="codex-compendium-header universal-compendium-header aaa-page-hero asteria-template-header"/);
  assert.match(viewer,/class="codex-compendium-body"/);
  assert.match(viewer,/class="codex-main-column"/);
  assert.match(viewer,/window\.AsteriaPageTemplate\?\.adopt\?\.\(\{/);
  for(const selector of [".codex-compendium-body",".codex-sidebar",".codex-tree-list",
    ".codex-main-column",".codex-main-display"])assert.ok(viewer.includes(selector),selector);
  for(const behaviour of ["data-universal-category","data-universal-entry","data-universal-breadcrumb",
    "data-universal-tab","universalSearch","universalGMToggle","isGMMode()","gmOnly",
    "writeRoute(false)","readRoute","universalBackToCards"]){
    assert.ok(viewer.includes(behaviour),behaviour);
  }
  assert.match(viewer,/selectedEntry\?\.id === entry\.id \? 'aria-current="page"'/);
  assert.match(viewer,/aria-current="page"/);
  assert.match(viewer,/root\.innerHTML = layout\(\)/);
  assert.ok(viewer.indexOf('root.innerHTML = layout()')<viewer.indexOf('window.AsteriaPageTemplate?.adopt?.({'));
});

test('Desktop and mobile share Account geometry without recolouring content cards',()=>{
  assert.match(styles,/#060D15/);
  assert.match(styles,/--asteria-page-nav-width/);
  assert.match(styles,/#compendiumLibrary \.aaa-library-layout\.asteria-template-layout/);
  assert.match(styles,/#universal-compendium-shell \.codex-compendium-body\.asteria-template-layout/);
  assert.match(styles,/#compendiumLibrary \.aaa-category-sidebar\.asteria-template-sidebar/);
  assert.match(styles,/#universal-compendium-shell \.codex-sidebar\.asteria-template-sidebar/);
  assert.match(styles,/#universal-compendium-shell \.codex-main-display\.asteria-template-panel/);
  assert.match(styles,/@media\(max-width:900px\)/);
  assert.match(styles,/overflow-x:auto!important/);
  assert.doesNotMatch(styles,/(?:^|\n)\s*(?:\.card|\.aaa-nav-card|\.codex-card|\.library-entry|\.library-group)\s*[{,]/);
  assert.doesNotMatch(styles,/^body\s+\.(?:card|crystal-button)/m);
});
