import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('css/asteria-button-sizes.css');
const index=read('index.html');

test('Phase 2 loads the four approved button families after previous website styles',()=>{
 const source=index.indexOf('css/asteria-menu-buttons.css');
 const phase2=index.indexOf('css/asteria-button-sizes.css?v=phase2-size-families-20261106');
 assert.ok(source>=0 && phase2>source);
 for(const [family,w,h] of [['small',160,40],['standard',220,48],['long',360,53],['icon',53,53]]){
  assert.match(css,new RegExp('--asteria-button-'+family+'-width:'+w+'px;'));
  assert.match(css,new RegExp('--asteria-button-'+family+'-height:'+h+'px;'));
  assert.match(css,new RegExp('data-asteria-button-size="'+family+'"'));
 }
 assert.match(index,/asteria-menu-buttons\.js\?v=gm-toolkit-1-2/);
});
test('Classification preserves navigation controls and avoids tiny gameplay controls',()=>{
 const elements=[];
 const document={
   readyState:'complete',
   body:{},
   querySelectorAll:()=>elements,
   addEventListener(){}
 };
 const window={addEventListener(){}};
 const context={document,window,MutationObserver:class{observe(){}}};
 vm.runInNewContext(read('js/asteria-menu-buttons.js'),context);
 const mock=(id,parent='')=>{
  const attributes=new Map(),classes=new Set();
  const element={id,
   classList:{contains:name=>classes.has(name),add:name=>classes.add(name)},
   matches:selector=>selector.includes('.crystal-button')||selector.includes('[role="tab"]'),
   closest:selector=>parent&&selector.includes(parent)?{}:null,
   getAttribute:name=>attributes.get(name)||null,
   setAttribute:(name,value)=>attributes.set(name,value),
  };
  return {element,attributes};
 };
 const expected={
  sidebarHomeButton:'small',compendiumIndexButton:'long',compendiumQuickToggle:'icon',
  characterForgeTop:'long',campaignsTop:'long',loginToggle:'small',
  settingsToggle:'icon'
 };
 for(const [id,family] of Object.entries(expected)){
  const {element,attributes}=mock(id);
  context.window.AsteriaMenuButtons.enhance(element);
  assert.equal(attributes.get('data-asteria-button-size'),family);
  assert.ok(element.classList.contains('asteria-menu-button'));
 }
 const stepper=mock('hpIncrease');
 context.window.AsteriaMenuButtons.enhance(stepper.element);
 assert.equal(stepper.attributes.has('data-asteria-button-size'),false);
 const tab=mock('inventory','react-character-dashboard .react-workspace-main > .react-tabs');
 assert.equal(context.window.AsteriaMenuButtons.buttonSize(tab.element),'standard');
});
test('Responsive sizing protects the mobile menu and existing crystal color/press layers',()=>{
 assert.match(css,/@media \(max-width:1679px\)/);
 assert.match(css,/#settingsPanel #globalNavigation/);
 assert.match(css,/#settingsPanel #compendiumQuickToggle/);
 assert.match(css,/\.react-character-dashboard,\.react-gm-dashboard/);
 assert.doesNotMatch(css,/background-image:|border-image:|pointer-events:none|color-mix\(/);
 const menu=read('css/asteria-menu-buttons.css');
 assert.match(menu,/--button-crystal-color/);
 assert.match(menu,/data-menu-pressed/);
});
