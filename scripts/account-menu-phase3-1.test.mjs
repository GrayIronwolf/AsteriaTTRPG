import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function menuHarness(){
  const documentHandlers={};
  function node(id){
    const handlers={};
    const attrs={};
    return {id,handlers,attrs,hidden:true,style:{},children:[],
      contains(target){return this===target||this.children.includes(target);},
      addEventListener(type,handler){handlers[type]=handler;},
      setAttribute(key,value){attrs[key]=value;},
      getAttribute(key){return attrs[key];},
      removeAttribute(key){delete attrs[key];},
      querySelectorAll(selector){return selector==='[role="menuitem"]'?this.children:[];},
      focus(){this.focused=true;}
    };
  }
  const login=node('loginToggle');
  const menu=node('accountQuickMenu');
  const wrap=node('accountMenuWrap');
  const settings=node('accountMenuSettings');
  const logout=node('accountMenuLogout');
  const slot=node('mobileAccountSlot');
  menu.children.push(settings,logout);
  wrap.children.push(login,menu);
  const elements={loginToggle:login,accountQuickMenu:menu,accountMenuWrap:wrap,
    accountMenuSettings:settings,accountMenuLogout:logout,mobileAccountSlot:slot};
  const calls=[];
  const windowHandlers={};
  let signedIn=true;
  const context={
    document:{readyState:'complete',activeElement:null,
      getElementById:id=>elements[id]||null,
      addEventListener:(type,handler)=>{documentHandlers[type]=handler;}},
    window:{AsteriaAuthBridge:{isLoggedIn:()=>signedIn},
      AsteriaWorkspace:{openDashboard:mode=>calls.push('settings:'+mode)},
      closeSettings:()=>calls.push('close-settings'),
      logout:()=>calls.push('logout'),
      addEventListener:(type,handler)=>{windowHandlers[type]=handler;}}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/asteria-account-menu.js','utf8'),context);
  return {api:context.window.AsteriaAccountMenu,login,menu,wrap,settings,logout,slot,
    calls,documentHandlers,windowHandlers,setSignedIn:value=>{signedIn=value;}};
}
const eventFor=(target,other={})=>({
  target,preventDefault(){this.prevented=true;},
  stopPropagation(){this.stopped=true;},...other
});

test('account menu starts closed and has accessible signed-in toggle',()=>{
  const h=menuHarness();
  assert.equal(h.api.isOpen(),false);
  assert.equal(h.api.toggle(),true);
  assert.equal(h.login.attrs['aria-expanded'],'true');
  assert.equal(h.menu.hidden,false);
  assert.equal(h.api.toggle(),false);
  assert.equal(h.login.attrs['aria-expanded'],'false');
  assert.equal(h.menu.hidden,true);
});
test('anonymous sessions cannot open account menu; signout closes current menu',()=>{
  const h=menuHarness();
  h.setSignedIn(false);
  assert.equal(h.api.toggle(),false);
  h.setSignedIn(true);h.api.toggle();
  h.setSignedIn(false);h.api.syncSession();
  assert.equal(h.api.isOpen(),false);
  h.setSignedIn(true);h.api.toggle();
  h.windowHandlers['asteria:firebase-signed-out']();
  assert.equal(h.api.isOpen(),false);
});
test('settings action opens existing workspace settings without logging out',()=>{
  const h=menuHarness();h.api.toggle();
  const event=eventFor(h.settings,{target:{closest:selector=>selector==='#accountMenuSettings'?h.settings:null}});
  h.menu.handlers.click(event);
  assert.equal(event.prevented,true);
  assert.deepEqual(h.calls.slice(-2),['close-settings','settings:settings']);
  assert.equal(h.calls.includes('logout'),false);
  assert.equal(h.api.isOpen(),false);
});
test('logout action uses existing logout routine and closes menu',()=>{
  const h=menuHarness();h.api.toggle();
  const event=eventFor(h.logout,{target:{closest:selector=>selector==='#accountMenuLogout'?h.logout:null}});
  h.menu.handlers.click(event);
  assert.equal(h.calls.at(-1),'logout');
  assert.equal(h.api.isOpen(),false);
});
test('keyboard ArrowDown and ArrowUp focus the menu actions',()=>{
  const h=menuHarness();
  let event=eventFor(h.login,{key:'ArrowDown'});
  h.login.handlers.keydown(event);
  assert.equal(event.prevented,true);
  assert.equal(h.settings.focused,true);
  h.api.close();
  event=eventFor(h.login,{key:'ArrowUp'});
  h.login.handlers.keydown(event);
  assert.equal(h.logout.focused,true);
});
test('keyboard Escape closes and restores focus, outside-click closes',()=>{
  const h=menuHarness();h.api.toggle();
  const event=eventFor(h.menu,{key:'Escape'});
  h.menu.handlers.keydown(event);
  assert.equal(event.prevented,true);
  assert.equal(h.login.focused,true);
  h.api.toggle();
  h.documentHandlers.click({target:{id:'outside'}});
  assert.equal(h.api.isOpen(),false);
});
test('the mobile account dropdown does not close the parent appearance drawer',()=>{
  const h=menuHarness();
  h.slot.children.push(h.wrap);
  h.api.toggle();
  assert.equal(h.calls.includes('close-settings'),false);
  assert.equal(h.api.isOpen(),true);
});
test('auth bridge changes signed-in Logout label to Account without changing guest Login',()=>{
  const source=fs.readFileSync('js/auth-bridge.js','utf8');
  assert.match(source,/login\.textContent = 'Account'/);
  assert.match(source,/window\.AsteriaAccountMenu\?\.toggle\?\.\(\)/);
  assert.match(source,/login\.setAttribute\?\.\('aria-haspopup','menu'\)/);
  assert.match(source,/login\.textContent = 'Login'/);
  assert.match(source,/window\.AsteriaAccountMenu\?\.close\?\.\(\)/);
});
test('navigation and markup preserve existing settings, responsive layout and feature flags',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const css=fs.readFileSync('css/asteria-account-menu.css','utf8');
  const nav=fs.readFileSync('js/asteria-navigation.js','utf8');
  for(const id of ['accountMenuWrap','accountQuickMenu','accountMenuSettings','accountMenuLogout','accountSettingsTop','loginToggle'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  assert.match(html,/role="menu" aria-label="Account navigation" hidden/);
  assert.match(html,/accountIds:false/);
  assert.match(css,/@media \(max-width:1679px\)/);
  assert.match(css,/\.asteria-account-menu\[hidden\]/);
  assert.match(nav,/\.asteria-account-menu-wrap/);
  assert.doesNotMatch(nav,/createUserWithEmailAndPassword/);
});
