import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createLocationStore,sanitizeIncomingLocation} from '../frontend/src/router/locationStore.mjs';
import {parseSiteRoute} from '../frontend/src/router/siteRoutes.mjs';
import {getPendingSecureInvite,clearPendingSecureInvite} from '../frontend/src/campaigns/campaignConnectionModel.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const secret='A'.repeat(43),invite='a'.repeat(64);
const secure='#secure-campaign-invite=camp-1.'+invite+'.'+secret;
function browser(initial=''){
  const listeners=new Map(),adds=new Map(),removes=new Map();
  const location={pathname:'/asteria',search:'?mode=private',hash:initial};
  let lastUrl='';
  const history={state:{entry:true},replaceState(state,_title,url){
    assert.deepEqual(state,{entry:true});
    lastUrl=url;
    const where=url.indexOf('#');
    location.hash=where<0?'':url.slice(where);
  }};
  return {location,history,
    addEventListener(event,fn){
      if(!listeners.has(event))listeners.set(event,new Set());
      listeners.get(event).add(fn);adds.set(event,(adds.get(event)||0)+1);
    },
    removeEventListener(event,fn){
      listeners.get(event)?.delete(fn);
      removes.set(event,(removes.get(event)||0)+1);
    },
    emit(event){for(const fn of [...listeners.get(event)||[]])fn();},
    count(event){return listeners.get(event)?.size||0;},
    added(event){return adds.get(event)||0;},
    removed(event){return removes.get(event)||0;},
    get lastUrl(){return lastUrl;}
  };
}
test('router sanitizes secure tokens synchronously, preserves pathname/query, and never persists bearer tokens',()=>{
  clearPendingSecureInvite();
  const source=browser(secure);
  assert.equal(sanitizeIncomingLocation(source,{enabled:true}),true);
  assert.equal(source.location.hash,'#/campaign-invitation');
  assert.equal(source.lastUrl,'/asteria?mode=private#/campaign-invitation');
  assert.equal(getPendingSecureInvite()?.token,secret);
  assert.equal(parseSiteRoute({hash:source.location.hash}).id,'invitation');
  assert.ok(!source.lastUrl.includes(secret));
  assert.equal(sanitizeIncomingLocation(source,{enabled:true}),false);
  clearPendingSecureInvite();
  assert.equal(getPendingSecureInvite(),null);
});
test('guest/disabled routing never intercepts invitation links',()=>{
  clearPendingSecureInvite();
  const source=browser(secure);
  assert.equal(sanitizeIncomingLocation(source,{enabled:false}),false);
  assert.equal(source.location.hash,secure);
  assert.equal(getPendingSecureInvite(),null);
});
test('strict-mode subscribers install one hashchange and popstate listener each, then release both',()=>{
  const source=browser('#home'),store=createLocationStore(source);
  let updates=0;
  const off1=store.subscribe(()=>updates++);
  const off2=store.subscribe(()=>updates++);
  assert.equal(source.count('hashchange'),1);
  assert.equal(source.count('popstate'),1);
  source.location.hash='#/character-forge';
  source.emit('hashchange');
  source.emit('popstate');
  assert.equal(updates,2);
  off1();off2();off2();
  assert.equal(source.count('hashchange'),0);
  assert.equal(source.count('popstate'),0);
  assert.equal(source.added('hashchange'),1);
  assert.equal(source.removed('hashchange'),1);
  const off3=store.subscribe(()=>updates++);
  assert.equal(source.count('hashchange'),1);
  off3();
  assert.equal(source.added('hashchange'),source.removed('hashchange'));
});
test('secure invitation navigation uses the same single event owner without stale-token route leaks',()=>{
  clearPendingSecureInvite();
  const source=browser('#home');
  const store=createLocationStore(source,{
    sanitize:()=>sanitizeIncomingLocation(source,{enabled:true})
  });
  const snapshots=[];
  const unsubscribe=store.subscribe(()=>snapshots.push(store.getSnapshot()));
  source.location.hash=secure;
  source.emit('hashchange');
  assert.equal(snapshots.length,1);
  assert.ok(snapshots[0].endsWith('#/campaign-invitation'));
  assert.ok(!snapshots[0].includes(secret));
  assert.equal(getPendingSecureInvite()?.token,secret);
  assert.equal(store.getSnapshot(),source.location.search+'\u0000#/campaign-invitation');
  unsubscribe();clearPendingSecureInvite();
});
test('remove dormant template controller, preserve every active legacy route and script',()=>{
  assert.equal(existsSync(resolve(root,'js/asteria-page-template.js')),false);
  const html=read('index.html');
  assert.doesNotMatch(html,/src="js\/asteria-page-template\.js/);
  const loaded=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)]
    .map(x=>x[1].split(/[?#]/)[0]);
  assert.equal(new Set(loaded).size,loaded.length,'duplicate legacy script includes');
  for(const script of loaded)assert.ok(existsSync(resolve(root,script)),script);
  for(const controller of ['js/app.js','js/asteria-core-shell.js',
    'js/asteria-home-guard.js','js/asteria-navigation.js','js/asteria-menu-buttons.js'])
    assert.ok(loaded.includes(controller),controller+' must remain until final cutover');
});
test('React has no duplicate global route or legacy controllers',()=>{
  const main=read('frontend/src/main.jsx');
  const store=read('frontend/src/router/locationStore.mjs');
  const hook=read('frontend/src/router/useSiteRoute.js');
  assert.match(main,/sanitizeIncomingLocation\(window/);
  assert.doesNotMatch(main,/captureIncomingSecureInvite|window\.addEventListener\(/);
  assert.match(store,/captureIncomingSecureInvite/);
  assert.match(hook,/useSyncExternalStore/);
  assert.match(store,/listenerScope.listen\(source, 'hashchange', changed\)/);
  assert.match(store,/listenerScope.listen\(source, 'popstate', changed\)/);
  const walk=path=>readdirSync(resolve(root,path),{withFileTypes:true})
    .flatMap(entry=>entry.isDirectory()?walk(join(path,entry.name)):
      /\.(?:jsx|js|mjs)$/.test(entry.name)?[join(path,entry.name)]:[]);
  for(const path of walk('frontend/src')){
    const code=read(path).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
    assert.doesNotMatch(code,/window\.(?:setView|AsteriaReactMigration|AsteriaRouter|AsteriaState)\b/,path);
    if(!path.endsWith('locationStore.mjs'))
      assert.doesNotMatch(code,/(?:addEventListener|\.listen)\(['"](?:hashchange|popstate)['"]/,path);
  }
  assert.doesNotMatch(read('frontend/index.html'),/src="js\/|src="src\/dev-entry|react-dist/);
});
