import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function harness(){
  const ids=new Map();
  const mediaHandlers=[];
  const media={matches:false,addEventListener(_event,fn){mediaHandlers.push(fn);}};
  class Element{
    constructor(tag='div'){
      this.tagName=tag;this.children=[];this.attrs={};this.classes=new Set();
      this.classList={
        add:(...names)=>names.forEach(n=>this.classes.add(n)),
        contains:name=>this.classes.has(name)
      };
      this.hidden=false;this.tabIndex=-1;this.textContent='';this.listeners={};
      this.className='';
    }
    set id(value){this._id=value;ids.set(value,this);}
    get id(){return this._id;}
    setAttribute(name,value){this.attrs[name]=String(value);}
    getAttribute(name){return this.attrs[name]||null;}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.children.push(node);}
    insertBefore(node){this.children.unshift(node);}
    addEventListener(name,fn){this.listeners[name]=fn;}
    querySelector(selector){
      if(selector==='h1')return this.find(x=>x.tagName==='h1');
      if(selector.startsWith('.'))return this.find(x=>x.classes.has(selector.slice(1)));
      return null;
    }
    querySelectorAll(selector){
      const found=[];
      function collect(parent){
        for(const child of parent.children){
          if(selector==='[role="tab"],button,a' &&
            (child.attrs.role==='tab'||child.tagName==='button'||child.tagName==='a'))found.push(child);
          else if(selector==='.asteria-template-panel'&&child.classes.has('asteria-template-panel'))found.push(child);
          collect(child);
        }
      }
      collect(this);return found;
    }
    find(check){
      for(const child of this.children){
        if(check(child))return child;
        const nested=child.find(check);if(nested)return nested;
      }
      return null;
    }
    contains(target){return this===target || this.children.some(node=>node.contains(target));}
    closest(selector){return selector==='[role="tab"]'&&this.attrs.role==='tab'?this:null;}
    focus(){this.focused=true;}
  }
  const callbacks={};
  const document={
    readyState:'loading',getElementById:id=>ids.get(id)||null,
    createElement:tag=>new Element(tag),
    addEventListener(name,fn){callbacks[name]=fn;}
  };
  const window={matchMedia:()=>media};
  vm.runInNewContext(read('js/asteria-page-template.js'),{window,document});
  return {window,document,Element,media,mediaHandlers,callbacks};
}

test('Phase 1 shared shell is loaded after visual skin and before AAA Account enhancement',()=>{
  const html=read('index.html');
  assert.ok(html.includes('css/asteria-page-template.css?v=universal-phase1-20261118'));
  assert.ok(html.includes('js/asteria-page-template.js?v=universal-phase1-20261118'));
  assert.ok(html.indexOf('css/asteria-page-template.css')>html.indexOf('css/asteria-solid-navy-surfaces.css'));
  assert.ok(html.indexOf('js/asteria-account-pages.js')<html.indexOf('js/asteria-page-template.js'));
  assert.ok(html.indexOf('js/asteria-page-template.js')<html.indexOf('js/asteria-aaa-upgrade.js'));
  assert.match(html,/class="asteria-account-shell"/);
  for(const id of ['asteriaAccountPanelProfile','asteriaAccountPanelSettings','asteriaAccountPanelAppearance','asteriaAccountPanelSecurity']){
    assert.equal(html.split('id="'+id+'"').length-1,1);
  }
  assert.match(html,/data-asteria-account-action="logout"/);
});

test('Shared template creation uses one accessible tablist and preserves external content nodes',()=>{
  const h=harness();
  const child=new h.Element('article');
  const chosen=[];
  const result=h.window.AsteriaPageTemplate.create({
    id:'sampleTemplate',title:'Handbook',
    sections:[{key:'rules',label:'Rules',node:child},{key:'lore',label:'Lore'}],
    onSelect:key=>{chosen.push(key);}
  });
  assert.ok(result);
  assert.equal(result.page.id,'sampleTemplate');
  assert.equal(h.document.getElementById('sampleTemplate'),result.page);
  assert.ok(result.page.classList.contains('asteria-template-page'));
  const nav=result.page.querySelector('.asteria-template-nav');
  assert.equal(nav.getAttribute('role'),'tablist');
  assert.equal(nav.getAttribute('aria-orientation'),'vertical');
  const tabs=nav.querySelectorAll('[role="tab"],button,a');
  assert.equal(tabs.length,2);
  assert.equal(tabs[0].getAttribute('aria-selected'),'true');
  assert.equal(tabs[1].getAttribute('aria-selected'),'false');
  assert.equal(tabs[0].getAttribute('aria-controls'),'sampleTemplate-panel-rules');
  assert.equal(child.id,'sampleTemplate-panel-rules');
  assert.equal(child.hidden,false);
  assert.equal(result.select('lore'),true);
  assert.equal(child.hidden,true);
  assert.equal(tabs[1].getAttribute('aria-selected'),'true');
  assert.equal(result.select('missing'),false);
  assert.ok(chosen.includes('rules')&&chosen.includes('lore'));
  assert.equal(h.window.AsteriaPageTemplate.create({id:'sampleTemplate',sections:[{key:'x'}]}),null);
});

test('Keyboard selection follows desktop orientation and switches to horizontal on mobile',()=>{
  const h=harness();
  const result=h.window.AsteriaPageTemplate.create({
    id:'mobileTest',title:'Account',
    sections:[{key:'profile'},{key:'settings'},{key:'security'}]
  });
  const nav=result.page.querySelector('.asteria-template-nav');
  const tabs=nav.querySelectorAll('[role="tab"],button,a');
  let prevented=false;
  nav.listeners.keydown({target:tabs[0],key:'ArrowDown',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(tabs[1].getAttribute('aria-selected'),'true');
  h.media.matches=true;h.mediaHandlers.forEach(fn=>fn());
  assert.equal(nav.getAttribute('aria-orientation'),'horizontal');
  nav.listeners.keydown({target:tabs[1],key:'ArrowRight',preventDefault(){}});
  assert.equal(tabs[2].getAttribute('aria-selected'),'true');
  assert.equal(tabs[2].focused,true);
  nav.listeners.keydown({target:tabs[2],key:'Home',preventDefault(){}});
  assert.equal(tabs[0].getAttribute('aria-selected'),'true');
});

test('Universal shell styles target opted-in pages and preserve #060D15 colour',()=>{
  const css=read('css/asteria-page-template.css');
  assert.match(css,/--asteria-page-surface:#060D15/);
  for(const name of ['asteria-template-page','asteria-template-header','asteria-template-layout',
    'asteria-template-sidebar','asteria-template-nav','asteria-template-content','asteria-template-panel']){
    assert.ok(css.includes('.'+name),name);
  }
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/overflow-x:auto/);
  assert.doesNotMatch(css,/(?:^|\n)\s*\.card\s*[{,]/);
  assert.doesNotMatch(css,/\.aaa-nav-card\s*[{,]/);
  assert.doesNotMatch(css,/\.crystal-button\s*[{,]/);
  const js=read('js/asteria-page-template.js');
  assert.match(js,/page:'asteriaAccountPage'/);
  assert.match(js,/layoutSelector:'\.asteria-account-shell'/);
  assert.doesNotMatch(js,/getDoc\(|getDocs\(|collection\(|localStorage|sessionStorage|indexedDB|fetch\(/);
});
