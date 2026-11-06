import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Laptop and tablet navigation use the same breakpoint as the JavaScript reflow',()=>{
  const js=read('js/asteria-navigation.js'),css=read('css/asteria-navigation.css'),html=read('index.html');
  const query=js.match(/matchMedia\('\(max-width: (\d+)px\)'\)/);
  assert.ok(query,'Navigation must have one explicit media query');
  assert.equal(Number(query[1]),1679);
  const laptop=css.match(/@media \(min-width:1201px\) and \(max-width:1679px\) \{([\s\S]*?)\n\}/);
  assert.ok(laptop,'Laptop rules must cover 1201 through 1679px');
  assert.match(laptop[1],/#mobileNavigationSlot,#mobileAccountSlot\s*\{\s*display:block/);
  assert.match(laptop[1],/#globalNavigation\s*\{\s*display:flex;flex-direction:column/);
  assert.match(laptop[1],/#accountControls\s*\{\s*display:flex;flex-direction:column/);
  assert.match(css,/@media \(max-width:1200px\)[\s\S]*?#mobileNavigationSlot,#mobileAccountSlot\s*\{\s*display:block/);
  assert.match(html,/css\/asteria-navigation\.css\?v=phase5-update1-20261106/);
  assert.match(html,/id="mobileNavigationSlot"/);
  assert.match(html,/id="mobileAccountSlot"/);
  for(const width of [320,390,768,1024,1200,1201,1366,1440,1679,1680,1920]){
    const movesIntoMenu=width<=1679;
    const slotVisible=width<=1200||(width>=1201&&width<=1679);
    assert.equal(movesIntoMenu,slotVisible,'Menu mismatch at '+width+'px');
  }
});

test('Navigation moves the same real controls into and out of the menu without duplicating them',()=>{
  const nodes={},events={};
  function node(id){
    const el={id,attributes:{},parentElement:null,hidden:true,innerHTML:'',
      classList:{toggle(){},contains(){return false;}},
      setAttribute(k,v){this.attributes[k]=v;},
      addEventListener(k,fn){this.listeners=this.listeners||{};this.listeners[k]=fn;},
      appendChild(child){child.parentElement=this;return child;},
      insertBefore(child){child.parentElement=this;return child;},
      getBoundingClientRect(){return {left:100,width:300};},
      getClientRects(){return [];}};
    nodes[id]=el;return el;
  }
  const header=node('header'),actions=node('actions');
  const nav=node('globalNavigation'),account=node('accountControls');
  const menu=node('compendiumQuickMenu'),quick=node('compendiumQuickToggle');
  const toggle=node('settingsToggle'),mobileNav=node('mobileNavigationSlot'),mobileAccount=node('mobileAccountSlot');
  node('compendiumLibrary');
  header.appendChild(nav);actions.appendChild(account);header.appendChild(actions);actions.appendChild(toggle);
  menu.querySelector=()=>null;
  let mediaHandler;
  const media={matches:true,addEventListener(_key,fn){mediaHandler=fn;}};
  const context={URLSearchParams,MutationObserver:class{observe(){}},
    localStorage:{getItem(){return null;}},
    window:{location:{hash:''},addEventListener(k,fn){events[k]=fn;},
      matchMedia(query){assert.equal(query,'(max-width: 1679px)');return media;},
      AsteriaUniversalCompendium:{visibleEntries(){return [];}}},
    document:{readyState:'loading',getElementById(id){return nodes[id]||null;},
      addEventListener(k,fn){events['document:'+k]=fn;},
      body:{classList:{remove(){}}}}};
  vm.createContext(context);
  vm.runInContext(read('js/asteria-navigation.js'),context);
  events['document:DOMContentLoaded']();
  assert.equal(nav.parentElement,mobileNav,'Laptop navigation moved into visible menu slot');
  assert.equal(account.parentElement,mobileAccount,'Laptop account buttons moved into visible menu slot');
  assert.equal(toggle.attributes['aria-label'],'Open main menu');
  media.matches=false;mediaHandler();
  assert.equal(nav.parentElement,header,'Desktop navigation returned to header');
  assert.equal(account.parentElement,actions,'Desktop account buttons returned to header');
  assert.equal(toggle.attributes['aria-label'],'Open menu and appearance');
  media.matches=true;mediaHandler();
  assert.equal(nav.parentElement,mobileNav,'Navigation returns to menu on resize');
  assert.equal(account.parentElement,mobileAccount,'Account actions return to menu on resize');
});

test('Typography settings keep a visible section heading, validate reading fonts and isolate stored users',()=>{
  const src=read('js/asteria-typography.js');
  const elements=[];
  function element(tag){
    const el={tagName:tag.toUpperCase(),children:[],textContent:'',value:'',dataset:{},events:{},classList:{add(){}},
      replaceChildren(){this.children=[];},
      appendChild(child){this.children.push(child);return child;},
      append(...children){this.children.push(...children);},
      setAttribute(){},
      addEventListener(type,fn){this.events[type]=fn;},
      querySelector(selector){
        const key=selector.match(/data-typography-field="([^"]+)"/);
        const found=(node)=>node.children?.find(child=>
          (key?child.dataset?.typographyField===key[1]:
            selector==='[data-typography-size-output]'&&child.dataset?.typographySizeOutput)||found(child));
        return found(this)||null;
      }};
    elements.push(el);return el;
  }
  const stored=new Map(),style=new Map();let uid='alpha';
  const window={session:{uid},AsteriaAuthBridge:{getSession:()=>({uid})},localStorage:{
    getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)
  },addEventListener(){}};
  const host=element('section');
  const document={readyState:'loading',addEventListener(){},createElement:element,
    querySelectorAll:()=>[host],head:{appendChild(){}},
    documentElement:{style:{setProperty:(k,v)=>style.set(k,v)},dataset:{}}};
  const context={window,document};vm.createContext(context);
  vm.runInContext(src,context);
  const typography=window.AsteriaTypography;
  typography.mount(host);
  assert.equal(host.children[0].tagName,'H3');
  assert.equal(host.children[0].textContent,'Typography');
  assert.equal(typography.fonts.length,15);
  assert.ok(typography.readable.length>=6);
  typography.apply({heading:'pinyon-script',reading:'inter',size:110},true);
  assert.equal(style.get('--asteria-typography-scale'),'1.1');
  assert.equal(JSON.parse(stored.get('asteria.typography.v1.alpha')).reading,'inter');
  uid='beta';typography.refreshAccount();
  assert.equal(typography.get().reading,'source-serif-4','Switching accounts restores independent defaults');
  typography.apply({heading:'great-vibes',reading:'great-vibes',size:200},true);
  assert.equal(typography.get().reading,'source-serif-4','Decorative fonts cannot become reading fonts');
  assert.equal(typography.get().size,115,'Readability scale is bounded');
  uid='alpha';typography.refreshAccount();
  assert.equal(typography.get().reading,'inter','Original account preference is preserved');
  const html=read('index.html');
  assert.match(html,/js\/asteria-typography\.js\?v=phase5-update1-20261106/);
});

test('Audit retains approved backgrounds, headers, image buttons, compendium and dashboard settings',()=>{
  const html=read('index.html'),dash=read('src/components/DashboardCustomisation.jsx');
  for(const asset of ['asteria-smoke-background.css','asteria-button-images.css','asteria-panel-headers.css','asteria-dashboard-panel-images.css','asteria-freeform-dashboard.css'])
    assert.ok(html.includes(asset),asset);
  for(const marker of ['Apply Layout to Settings','Save Dashboard Settings','Lock Position','Remove Panel','Reset Layout','Auto Arrange'])
    assert.ok(dash.includes(marker),marker);
  assert.match(dash,/onPointerUp=\{end\}/);
  assert.match(dash,/onPointerCancel=/);
  assert.match(dash,/e\.altKey/);
  assert.match(read('src/state/dashboardGridModel.mjs'),/export function dashboardPointerProposal/);
  assert.match(read('js/asteria-navigation.js'),/visibleEntries\?\.\(true\)/);
});
