import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
function harness(){
  const calls=[],listeners={},nodes={};
  for(const id of ['loginToggle','settingsToggle','settingsPanel','settingsTitle']){
    nodes[id]={id,attrs:{},classList:{remove(){}},
      removeAttribute(key){delete this.attrs[key];},
      addEventListener(type,fn){this.handlers=this.handlers||{};this.handlers[type]=fn;},
      setAttribute(k,v){this.attrs[k]=v;}};
  }
  let signed=true;
  const context={document:{readyState:'complete',getElementById:id=>nodes[id]||null},
    window:{AsteriaAuthBridge:{isLoggedIn:()=>signed,updateTopButtons:()=>calls.push('sync')},
      AsteriaAccountPages:{open:name=>{calls.push(name);return true;}},
      addEventListener:(name,fn)=>listeners[name]=fn}};
  vm.runInNewContext(read('js/asteria-account-menu.js'),context);
  return {api:context.window.AsteriaAccountMenu,calls,listeners,setSigned:v=>{signed=v;}};
}
test('signed-in Account opens full Settings page, not a dropdown',()=>{
  const h=harness();
  assert.equal(h.api.isOpen(),false);
  assert.equal(h.api.toggle(),true);
  assert.ok(h.calls.includes('account'));
  assert.doesNotMatch(read('index.html'),/id="accountQuickMenu"/);
  assert.match(read('index.html'),/id="asteriaAccountPage"/);
});
test('account navigation remains authenticated and does not trigger logout',()=>{
  const h=harness();
  h.setSigned(false);assert.equal(h.api.toggle(),false);
  h.setSigned(true);assert.equal(h.api.toggle(),true);
  h.listeners['asteria:firebase-signed-out']();
  assert.equal(h.api.isOpen(),false);
  assert.ok(!h.calls.includes('logout'));
});
test('Friends remains a separate top-level destination',()=>{
  const h=harness();
  assert.equal(h.api.openFriends(),true);
  assert.equal(h.api.openNotifications(),true);
  assert.ok(h.calls.includes('friends'));
  assert.ok(h.calls.includes('notifications'));
  assert.match(read('index.html'),/id="asteriaFriendsTop"/);
  assert.match(read('index.html'),/id="asteriaFriendsPage"/);
});
test('auth bridge retains guest Login and direct signed-in Account',()=>{
  const source=read('js/auth-bridge.js');
  assert.match(source,/login\.textContent = 'Account'/);
  assert.match(source,/login\.textContent = 'Login'/);
  assert.match(source,/window\.AsteriaAccountMenu\?\.toggle\?\.\(\)/);
  assert.match(source,/login\.removeAttribute\?\.\('aria-haspopup'\)/);
  assert.match(source,/window\.setView\?\.\('loginPage'\)/);
});
