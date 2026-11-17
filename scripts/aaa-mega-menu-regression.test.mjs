import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source = read('js/asteria-aaa-upgrade.js');
const css = read('css/asteria-aaa-upgrade.css');

function createMenuHarness(){
  const elements = new Map();
  const winListeners = new Map();
  const docListeners = new Map();
  const makeElement = (id='',tag='div') => {
    const attributes = new Map();
    const element = {
      id,tagName:tag.toUpperCase(),children:[],dataset:{},hidden:false,
      textContent:'',className:'',
      classList:{add(){},remove(){},contains(){return false;},toggle(){}},
      setAttribute(key,value){attributes.set(key,String(value));if(key==='hidden')this.hidden=true;},
      getAttribute(key){return attributes.get(key)||null;},
      addEventListener(){},focus(){},remove(){},
      append(...nodes){this.children.push(...nodes);for(const node of nodes){if(node.id)elements.set(node.id,node);}},
      replaceChildren(...nodes){this.children=[...nodes];},
      querySelector(selector){return selector==='button'?this.children.find(x=>x.tagName==='BUTTON')||null:null;},
      querySelectorAll(){return [];}
    };
    Object.defineProperty(element,'innerHTML',{set(value){
      if(this.id==='aaaMegaMenu'){
        for(const childId of ['aaaMegaTitle','aaaMegaSearch','aaaMegaClose','aaaMegaCards']){
          elements.set(childId,makeElement(childId,childId==='aaaMegaSearch'?'input':childId==='aaaMegaClose'?'button':'div'));
        }
      }
      this.html=value;
    }});
    return element;
  };
  const headerIds=['asteriaHandbookTop','worldLoreTop','compendiumIndexButton','characterForgeTop','campaignsTop','asteriaFriendsTop','loginToggle'];
  for(const id of headerIds)elements.set(id,makeElement(id,'button'));
  const body=makeElement('body');
  const document={
    title:'Asteria',readyState:'loading',body,
    getElementById:id=>elements.get(id)||null,
    createElement:tag=>makeElement('',tag),
    querySelectorAll:()=>[],
    addEventListener:(name,callback,capture)=>docListeners.set(name+':'+Boolean(capture),callback)
  };
  const window={
    location:{hash:'#/compendium?group=rules'},
    AsteriaAuthBridge:{isLoggedIn:()=>true},
    matchMedia:()=>({matches:false}),
    addEventListener:(name,callback,capture)=>winListeners.set(name+':'+Boolean(capture),callback)
  };
  vm.runInNewContext(source,{window,document,URLSearchParams,console});
  assert.equal(typeof docListeners.get('DOMContentLoaded:false'),'function');
  docListeners.get('DOMContentLoaded:false')();
  return {elements,window,winListeners,docListeners};
}

test('all seven header clicks open the mega menu before old document-capture navigation',()=>{
  const env=createMenuHarness();
  const handler=env.winListeners.get('click:true');
  assert.equal(typeof handler,'function','The shared handler must listen on window capture');
  assert.equal(env.docListeners.has('click:true'),false,'The new handler must not be too late on document capture');
  for(const menu of env.window.AsteriaAAAWebsite.menus){
    const trigger=env.elements.get(menu.trigger);
    let prevented=false,stopped=false;
    const event={
      target:{closest:()=>trigger},
      preventDefault(){prevented=true;},
      stopImmediatePropagation(){stopped=true;}
    };
    handler(event);
    assert.ok(prevented && stopped,menu.id+' must suppress legacy link navigation');
    const panel=env.elements.get('aaaMegaMenu');
    assert.equal(panel.hidden,false,menu.id+' opened');
    assert.equal(panel.dataset.menu,menu.id,menu.id+' shown');
    assert.equal(env.elements.get('aaaMegaCards').children.length,menu.entries.length,menu.id+' card count');
    env.window.AsteriaAAAWebsite.closeMenu();
    assert.equal(panel.hidden,true,menu.id+' closed');
  }
});

test('all dropdowns have one fixed width and height independent of entry counts',()=>{
  assert.match(css,/\.aaa-mega-menu\s*\{[^}]*height:min\(570px, calc\(100dvh - var\(--core-header-height\) - 16px\)\)!important/s);
  assert.match(css,/width:calc\(100vw - 16px\)!important/);
  assert.match(css,/\.aaa-mega-grid\s*\{[^}]*overflow-y:auto!important/s);
  assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)!important/);
  assert.match(css,/background:#32373D!important/);
});

test('restores original header crystal sizes, left-aligned logo and unframed envelope',()=>{
  assert.match(css,/padding-left:0!important/);
  assert.match(css,/clamp\(195px,11vw,360px\)!important/);
  assert.match(css,/height:53px!important/);
  assert.match(css,/\.asteria-header \.asteria-header-profile button\.asteria-header-mail\s*\{[^}]*background:transparent!important;[^}]*border:0!important;[^}]*border-radius:0!important/s);
  assert.match(css,/left:-26px!important/);
  assert.match(css,/has-unread::after/);
});


test('Option C keeps all six original-size header buttons and Account in one desktop row',()=>{
  const html=read('index.html');
  const originalButtonCSS=read('css/asteria-button-sizes.css');
  assert.ok(css.includes('--asteria-logo-compact-width:clamp(180px,calc(31.25vw - 345px),255px)'));
  assert.ok(css.includes('--asteria-profile-compact-width:clamp(82px,4.95vw,95px)'));
  assert.ok(css.includes('flex-wrap:nowrap!important'));
  assert.ok(css.includes('object-position:left center!important'));
  assert.ok(css.includes('body .asteria-header .asteria-header-profile .asteria-header-identity'));
  assert.ok(css.includes('@media (min-width:1680px)'));
  assert.ok(originalButtonCSS.includes('--asteria-button-long-height:53px;'));
  assert.ok(html.includes('css/asteria-aaa-upgrade.css?v=20261117-3-option-c'));
  assert.ok(html.includes('js/asteria-aaa-upgrade.js?v=20261117-3-menu-fix'));
  const clamp=(min,value,max)=>Math.max(min,Math.min(value,max));
  for(const width of [1680,1720,1760,1840,1920,2048,2560,3200]){
    const logo=clamp(180,0.3125*width-345,255);
    const profile=clamp(82,0.0495*width,95);
    const longButton=clamp(195,0.11*width,360);
    const account=clamp(106,0.08*width,160);
    // Six unchanged long navigation buttons, one small Account control,
    // portrait, envelope's half-button margin and all declared row gaps.
    const total=logo + (longButton*6) + account + profile + 26 + 20;
    assert.ok(total<=width,
      'header items must fit at '+width+'px; estimated '+Math.round(total)+'px');
  }
  assert.equal(clamp(180,0.3125*1920-345,255),255);
  assert.equal(clamp(82,0.0495*1920,95),95);
});
