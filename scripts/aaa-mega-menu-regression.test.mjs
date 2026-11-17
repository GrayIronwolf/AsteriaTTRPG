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
      if(id==='aaaMegaMenu'){
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
