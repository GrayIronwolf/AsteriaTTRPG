import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('restored sessions and later profile updates keep the current route', () => {
  const navigations = [];
  const context = { console, session:{role:'guest'}, selected:null, updateRoleLocks(){},
    document:{body:{dataset:{}},getElementById:()=>null,addEventListener(){}},
    window:{location:{hash:'#/react/owned-character/hero'},AsteriaWorkspace:{openDashboard:mode=>navigations.push(mode)}} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/auth-bridge.js','utf8'),context);
  const user = {uid:'owner',email:'owner@example.com'};
  context.window.AsteriaAuthBridge.setSession({characters:['hero']},user);
  context.window.AsteriaAuthBridge.setSession({username:'Updated',characters:['hero']},user);
  assert.equal(context.window.AsteriaAuthBridge.getSession().user,'Updated');
  assert.equal(context.document.body.dataset.role,'account');
  assert.deepEqual(navigations,[]);
  assert.equal(context.window.location.hash,'#/react/owned-character/hero');
  delete context.window.AsteriaWorkspace;
  context.window.AsteriaAuthBridge.setSession({},user);
  assert.equal(context.window.__asteriaOpenDashboardOnReady,undefined);
});

const auth = fs.readFileSync('js/firebase-auth.js','utf8');
const loginHome = auth.slice(auth.indexOf('function openAccountHome('),auth.indexOf('\nfunction authPanelHtml('));
for(const hash of ['', '#', '#/', '#/compendium', '#/react/owned-character/hero', '#/join/123456789012']){
  test(`successful login ${hash || 'at the root'} opens Home or preserves the requested route`, () => {
    let homes = 0, sessions = 0, closed = 0;
    const window = {location:{hash},asteriaHardHome:()=>homes++,AsteriaAuthBridge:{setSession:()=>sessions++}};
    vm.runInNewContext(`${loginHome};openAccountHome({},{});`,{window,$:()=>({classList:{remove:()=>closed++}})});
    assert.equal(homes,['','#','#/'].includes(hash)?1:0);
    assert.equal(window.location.hash,hash);
    assert.equal(sessions,1);
    assert.equal(closed,1);
  });
}
