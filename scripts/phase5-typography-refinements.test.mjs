import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function runtime(){
  const storage=new Map(),css=new Map(),elements=[],links=[],events={},listeners={};
  let user={role:'account',uid:'first'};
  const el=tag=>{
    const node={tagName:tag.toUpperCase(),textContent:'',children:[],dataset:{},style:{setProperty:(name,value)=>css.set(name,value)},events:{},attributes:{},classList:{add(){}},
      appendChild(child){this.children.push(child);return child;},
      append(...children){this.children.push(...children);},
      replaceChildren(){this.children=[];},
      setAttribute(name,value){this.attributes[name]=value;},
      addEventListener(name,fn){this.events[name]=fn;},
      remove(){},
      querySelectorAll(selector){return all(this).filter(child=>selector==='[data-font-sample]'?child.dataset.fontSample:selector==='[data-use-heading]'?child.dataset.useHeading:selector==='[data-use-reading]'?child.dataset.useReading:false);},
      querySelector(selector){
        const key=selector.match(/data-typography-field="([^"]+)"/);
        return all(this).find(child=>key?child.dataset.typographyField===key[1]:selector==='[data-typography-size-output]'&&child.dataset.typographySizeOutput)||null;
      }};
    elements.push(node);return node;
  };
  const all=(root)=>root.children.flatMap(child=>[child,...all(child)]);
  const host=el('section');
  const document={
    readyState:'loading',addEventListener(name,fn){listeners[name]=fn;},createElement:el,
    getElementById(id){return id==='asteriaTypographyMenu'?host:null;},
    querySelectorAll(selector){return selector==='[data-asteria-typography-host]'?[host]:selector==='[data-asteria-font-status]'?all(host).filter(x=>x.dataset.asteriaFontStatus):[];},
    head:{appendChild(link){links.push(link);}},body:{dataset:{role:'account'}},
    documentElement:{dataset:{},style:{setProperty:(key,val)=>css.set(key,val)}}
  };
  const window={
    AsteriaAuthBridge:{getSession:()=>({...user})},
    AsteriaFirebase:{getUser:()=>({uid:'first'})},
    session:{uid:'first'},
    addEventListener(name,fn){events[name]=fn;},
    localStorage:{
      getItem:key=>storage.get(key)||null,
      setItem:(key,val)=>storage.set(key,val),
      removeItem:key=>storage.delete(key)
    }
  };
  const context={window,document};
  vm.createContext(context);vm.runInContext(read('js/asteria-typography.js'),context);
  listeners.DOMContentLoaded?.();
  return {api:window.AsteriaTypography,window,document,host,storage,links,css,events,el,all,setUser(value){user=value;}};
}

test('All 15 choices are available with safe readable fonts and an on-demand sample gallery',()=>{
  const t=runtime(),fonts=t.api.fonts;
  assert.equal(fonts.length,15);
  assert.equal(new Set(fonts.map(x=>x.id)).size,15);
  assert.ok(fonts.every(x=>x.name&&x.family&&x.fallback&&['both','display'].includes(x.type)));
  assert.ok(fonts.filter(x=>x.type==='display').length>=5);
  assert.ok(fonts.filter(x=>x.type==='both').length>=7);
  const gallery=t.all(t.host).find(x=>x.tagName==='DETAILS');
  assert.ok(gallery,'On-demand catalogue exists');
  const samples=t.all(gallery).filter(x=>x.dataset.fontSample);
  assert.equal(samples.length,15);
  assert.equal(samples.filter(sample=>t.all(sample).some(x=>x.dataset.useReading)).length,fonts.filter(x=>x.type==='both').length);
  assert.equal(t.links.length,2,'Initial view downloads only two selected fonts');
  for(const sample of samples){
    const name=t.all(sample).find(x=>x.tagName==='STRONG');
    const line=t.all(sample).find(x=>x.className==='asteria-typography-sample-line');
    assert.ok(name?.textContent);
    assert.match(line.textContent,/Asteria/);
  }
  gallery.open=true;
  gallery.events.toggle();
  assert.equal(t.links.length,15,'Fallback without IntersectionObserver loads catalogue only on expansion');
});

test('Reading size respects root rem scaling and uses a single scale for previews',()=>{
  const t=runtime();
  const css=read('css/asteria-typography.css');
  assert.match(css,/html \{ font-size: var\(--asteria-root-font-size\); \}/);
  assert.doesNotMatch(css,/font-size: calc\(16px \* var\(--asteria-typography-scale\)\)/);
  assert.doesNotMatch(css,/font-size: calc\(1rem \* var\(--asteria-typography-scale\)\)/);
  assert.match(css,/@media \(max-width:620px\)/);
  t.api.apply({heading:'great-vibes',reading:'inter',size:115},true);
  assert.equal(t.css.get('--asteria-root-font-size'),'115%');
  assert.equal(t.css.get('--asteria-typography-scale'),'1.15');
  assert.equal(t.api.get().reading,'inter');
  t.api.apply({heading:'great-vibes',reading:'pinyon-script',size:8},true);
  assert.equal(t.api.get().reading,'source-serif-4');
  assert.equal(t.api.get().size,90);
  assert.equal(t.css.get('--asteria-root-font-size'),'90%');
});

test('User and guest settings are isolated across reload, sign-out and sign-in',()=>{
  const t=runtime();
  t.api.apply({heading:'uncial-antiqua',reading:'arimo',size:110},true);
  assert.equal(JSON.parse(t.storage.get('asteria.typography.v1.first')).reading,'arimo');
  t.setUser({role:'guest',uid:null});
  t.api.refreshAccount();
  assert.equal(t.api.get().reading,'source-serif-4','Guest must not see signed-in font');
  t.api.apply({heading:'cinzel',reading:'carlito',size:95},true);
  assert.equal(JSON.parse(t.storage.get('asteria.typography.v1.guest')).reading,'carlito');
  t.setUser({role:'account',uid:'second'});
  t.api.refreshAccount();
  assert.equal(t.api.get().size,100,'Second account uses its own defaults');
  t.setUser({role:'account',uid:'first'});
  t.api.refreshAccount();
  assert.equal(t.api.get().reading,'arimo');
  assert.equal(t.api.get().size,110);
  // Calling the storage listener reflects changes from another browser tab.
  t.storage.set('asteria.typography.v1.first',JSON.stringify({heading:'cinzel',reading:'inter',size:115}));
  t.events.storage({key:'asteria.typography.v1.first'});
  assert.equal(t.api.get().reading,'inter');
});

test('Font stylesheet failures retain readable CSS fallbacks and do not mutate dashboard artwork',()=>{
  const t=runtime();
  t.api.apply({heading:'pinyon-script',reading:'inter',size:100},false);
  const last=t.links.at(-1);
  assert.match(last.href,/fonts\.googleapis\.com\/css2\?family=/);
  assert.match(last.href,/display=swap/);
  last.onerror?.();
  const status=t.all(t.host).find(x=>x.dataset.asteriaFontStatus);
  assert.match(status.textContent,/readable fallback/i);
  const css=read('css/asteria-typography.css');
  assert.match(css,/\.asteria-typography-gallery/);
  const html=read('index.html');
  assert.match(html,/css\/asteria-typography\.css\?v=phase5-update2-20261106/);
  assert.match(html,/js\/asteria-typography\.js\?v=phase6-update2-20261106/);
  for(const a of ['asteria-button-images.css','asteria-panel-headers.css','asteria-dashboard-panel-images.css','asteria-smoke-background.css'])
    assert.ok(html.includes(a),a);
  const source=read('js/asteria-typography.js');
  assert.doesNotMatch(source,/dashboardPreferences|panelBackgrounds|setDashboardBackground|backgroundImage/);
});

test('Auth changes immediately refresh user-specific font settings',()=>{
  const code=read('js/auth-bridge.js');
  const login=code.slice(code.indexOf("setSession(profile, firebaseUser)"),code.indexOf('importCharacters(accountKey'));
  const logout=code.slice(code.indexOf('logoutLocal(){'),code.indexOf('\n  };',code.indexOf('logoutLocal(){')));
  assert.match(login,/document\.body\.dataset\.role = 'account';\s*\/\/[^\n]*\n\s*window\.AsteriaTypography\?\.refreshAccount\?\.\(\)/);
  assert.match(logout,/document\.body\.dataset\.role='guest';\s*window\.AsteriaTypography\?\.refreshAccount\?\.\(\)/);
});
