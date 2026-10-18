import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseReactRoute,navigateReactRoute} from '../src/app/asteriaRoutes.mjs';

// Exercise the actual bootstrap with only its module/network boundary replaced.
function runtime(hash='') {
  let resolve, reject, loads=0, mounts=0, activations=0, reloads=0;
  const pending=new Promise((ok,fail)=>{resolve=ok;reject=fail;});
  const listeners=new Map(),buttons=new Map();
  const host={innerHTML:'',querySelector:()=>({addEventListener:(event,callback)=>buttons.set(event,callback)})};
  const window={location:{hash,reload(){reloads++;}},history:{state:null},setView(){},
    addEventListener(name,callback){listeners.set(name,callback);},dispatchEvent(){}};
  const context={window,document:{getElementById:()=>host,documentElement:{dataset:{}}},
    talentSystem:{},armourSystem:{},parseReactRoute,navigateReactRoute:route=>navigateReactRoute(route,window.location),
    activateReactDashboard(){activations++;},openLegacyView(){window.location.hash='';},
    CustomEvent:class {},console:{warn(){}},loadDashboard(){loads++;return pending;}};
  const source=fs.readFileSync('src/main.jsx','utf8').replace(/^import .*;\n/gm,'').replace("import('./app/mountDashboard.jsx')",'loadDashboard()');
  vm.runInNewContext(source,context);
  return {window,host,buttons,listeners,stats:()=>({loads,mounts,activations,reloads}),
    async finish(){resolve({mountDashboard(){mounts++;}});await pending;await new Promise(ok=>setImmediate(ok));},
    async fail(){reject(new Error('Network unavailable'));await new Promise(ok=>setImmediate(ok));}};
}

test('Home exposes navigation and gameplay helpers without loading the React dashboard runtime',()=>{
  const r=runtime();
  assert.equal(r.stats().loads,0);
  assert.equal(r.window.AsteriaReactMigration.available,true);
  assert.ok(r.window.AsteriaArmour);
  assert.ok(r.window.AsteriaTalents);
});

test('dashboard navigation loads once and keeps the latest requested route',async()=>{
  const r=runtime();
  const api=r.window.AsteriaReactMigration;
  assert.equal(api.openGM('campaign'),'#/react/gm/campaign');
  api.openCharacter('campaign','character');
  assert.equal(r.stats().loads,1);
  assert.match(r.host.innerHTML,/role="status"/);
  await r.finish();
  assert.equal(r.stats().mounts,1);
  assert.equal(r.window.location.hash,'#/react/character/campaign/character');
  api.openGM('another');
  assert.equal(r.stats().loads,1);
});

test('direct dashboard bookmarks load the runtime immediately',async()=>{
  const r=runtime('#/react/owned-character/my-character');
  assert.equal(r.stats().loads,1);
  await r.finish();
  assert.equal(r.stats().mounts,1);
  assert.equal(r.window.AsteriaReactMigration.isDashboardActive(),true);
});

test('returning Home while the dashboard downloads does not reopen its old route',async()=>{
  const r=runtime();
  r.window.AsteriaReactMigration.openGM('campaign');
  r.window.location.hash='';
  const before=r.stats().activations;
  await r.finish();
  assert.equal(r.window.location.hash,'');
  assert.equal(r.stats().activations,before);
});

test('failed dashboard downloads provide a working reload action',async()=>{
  const r=runtime('#/react/gm/campaign');
  await r.fail();
  assert.match(r.host.innerHTML,/role="alert"/);
  assert.match(r.host.innerHTML,/Reload dashboard/);
  r.buttons.get('click')();
  assert.equal(r.stats().reloads,1);
});

test('a load failure after leaving the dashboard does not replace the Home screen',async()=>{
  const r=runtime('#/react/gm/campaign');
  r.window.location.hash='';
  await r.fail();
  assert.doesNotMatch(r.host.innerHTML,/role="alert"/);
  assert.equal(r.window.location.hash,'');
});
