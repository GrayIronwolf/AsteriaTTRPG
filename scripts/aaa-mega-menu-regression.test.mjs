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

test('all dropdowns have one fixed width and height, with narrower cards at the same height',()=>{
  assert.match(css,/height:min\(570px,calc\(100dvh - var\(--core-header-height\) - 16px\)\)!important/);
  assert.match(css,/width:calc\(100vw - 16px\)!important/);
  assert.match(css,/overflow-y:auto!important/);
  assert.match(css,/grid-template-columns:repeat\(auto-fill,minmax\(150px,170px\)\)!important/);
  assert.match(css,/height:clamp\(145px,20vh,205px\)!important/);
  assert.match(css,/background:#32373D!important/);
});

test('restores compact header crystal widths, left-aligned logo and unframed envelope',()=>{
  const sizes=read('css/asteria-button-sizes.css');
  assert.ok(sizes.includes('clamp(140px,8.2vw,166px)'));
  assert.ok(sizes.includes('--asteria-button-long-height:53px;'));
  assert.ok(css.includes('padding:0 4px 0 0!important'));
  assert.ok(css.includes('flex-wrap:nowrap!important'));
  assert.match(css,/button\.asteria-header-mail\{[^}]*background:transparent!important;[^}]*border:0!important;[^}]*border-radius:0!important/s);
  assert.ok(css.includes('left:-26px!important'));
  assert.ok(css.includes('has-unread::after'));
});

test('all seven desktop buttons fit on one row with restored large logo and profile',()=>{
  const html=read('index.html');
  const sizes=read('css/asteria-button-sizes.css');
  assert.ok(css.includes('clamp(330px,20.5vw,420px)'));
  assert.ok(css.includes('clamp(180px,10.2vw,220px)'));
  assert.ok(css.includes('object-position:left center!important'));
  assert.ok(css.includes('body .asteria-header .asteria-header-profile .asteria-header-identity'));
  assert.ok(css.includes('@media(min-width:1680px)'));
  assert.ok(sizes.includes('clamp(140px,8.2vw,166px)'));
  assert.ok(html.includes('css/asteria-aaa-upgrade.css?v=20261118-campaign-book-v1'));
  const clamp=(min,value,max)=>Math.max(min,Math.min(value,max));
  for(const width of [1680,1720,1760,1840,1920,2048,2560,3200]){
    const logo=clamp(330,0.205*width,420);
    const profile=clamp(180,0.102*width,220);
    const longButton=clamp(140,0.082*width,166);
    const account=clamp(106,0.08*width,160);
    // Six compact long navigation buttons, Account, portrait, envelope's
    // left margin, six row gaps, and small right padding.
    const total=logo + (longButton*6) + account + profile + 26 + 40;
    assert.ok(total<=width,
      'header controls must fit at '+width+'px; estimated '+Math.round(total)+'px');
  }
  assert.equal(Math.round(clamp(330,0.205*1920,420)),394);
  assert.equal(Math.round(clamp(180,0.102*1920,220)),196);
});
