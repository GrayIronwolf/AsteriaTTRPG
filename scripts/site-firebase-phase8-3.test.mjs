import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConnectionMonitor} from '../frontend/src/runtime/connectionMonitor.mjs';
import {createVerifiedServerReads} from '../frontend/src/runtime/verifiedServerReads.mjs';
import {createRealtimeSubscriptionHub} from '../frontend/src/runtime/realtimeSubscriptions.mjs';

function environment(initial=true){
  const handlers=new Map();
  const navigator={onLine:initial};
  const target={
    navigator,
    addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn);},
    removeEventListener(name,fn){handlers.get(name)?.delete(fn);},
    emit(name){for(const fn of [...(handlers.get(name)||[])])fn();}
  };
  return target;
}
function setup(){
  const window=environment();
  const monitor=createConnectionMonitor({environment:window});
  const auth={currentUser:{uid:'gm'}};
  let count=0;
  const sdk={
    async getDocFromServer(ref){count++;return {id:ref.path,metadata:{fromCache:false,hasPendingWrites:false}};},
    async getDocsFromServer(ref){count++;return {id:ref.path,metadata:{fromCache:false,hasPendingWrites:false}};},
    onSnapshot(){}
  };
  return {window,monitor,auth,sdk,get count(){return count;}};
}
const doc=path=>({type:'document',path});
test('offline changes are observed, deduplicated and disposable',()=>{
  const x=setup(),states=[];
  const stop=x.monitor.subscribe(s=>states.push([s.state,s.epoch]));
  assert.deepEqual(states,[['online',0]]);
  x.window.navigator.onLine=false;x.window.emit('offline');
  assert.equal(x.monitor.canAttempt(),false);
  assert.equal(x.monitor.retry(),false);
  x.window.navigator.onLine=true;x.window.emit('online');
  assert.equal(x.monitor.snapshot().state,'reconnecting');
  x.monitor.reportSuccess();
  assert.equal(x.monitor.snapshot().state,'online');
  stop();x.monitor.dispose();
  x.window.emit('offline');
  assert.equal(states.at(-1)[0],'online');
});
test('identical document reads share an in-flight promise; queries remain independent',async()=>{
  const x=setup();
  let release;
  x.sdk.getDocFromServer=async()=>{x.sdk.hits=(x.sdk.hits||0)+1;return new Promise(r=>{release=r;});};
  const reads=createVerifiedServerReads({auth:x.auth,firestoreSdk:x.sdk,connection:x.monitor,delay:async()=>{}});
  const first=reads.getDocFromServer(doc('users/gm'));
  const second=reads.getDocFromServer(doc('users/gm'));
  assert.equal(x.sdk.hits,1);
  release({metadata:{fromCache:false,hasPendingWrites:false}});
  await Promise.all([first,second]);
  await Promise.all([reads.getDocsFromServer({type:'query',path:'campaigns',filter:'gm'}),
    reads.getDocsFromServer({type:'query',path:'campaigns',filter:'player'})]);
  assert.equal(x.count,2);
  x.monitor.dispose();
});
test('transient read failures have bounded delays, then explicit retry',async()=>{
  const x=setup(),delays=[];
  let attempts=0;
  x.sdk.getDocFromServer=async()=>{
    attempts++;
    if(attempts<3)throw Object.assign(Error('temporary'),{code:'unavailable'});
    return {metadata:{fromCache:false,hasPendingWrites:false}};
  };
  const reads=createVerifiedServerReads({auth:x.auth,firestoreSdk:x.sdk,connection:x.monitor,delay:async ms=>delays.push(ms)});
  await reads.getDocFromServer(doc('users/gm'));
  assert.deepEqual(delays,[150,450]);
  assert.equal(attempts,3);
  x.sdk.getDocFromServer=async()=>{throw Object.assign(Error('temporary'),{code:'unavailable'});};
  await assert.rejects(reads.getDocFromServer(doc('users/gm')),/server could not verify/i);
  assert.equal(x.monitor.snapshot().state,'unavailable');
  assert.equal(x.monitor.canAttempt(),false);
  assert.equal(x.monitor.retry(),true);
  assert.equal(x.monitor.snapshot().state,'reconnecting');
});
test('permission errors and invalid snapshots never retry or prove access',async()=>{
  const x=setup();let hits=0;
  x.sdk.getDocFromServer=async()=>{hits++;throw Object.assign(Error('blocked'),{code:'permission-denied'});};
  const reads=createVerifiedServerReads({auth:x.auth,firestoreSdk:x.sdk,connection:x.monitor,delay:async()=>{}});
  await assert.rejects(reads.getDocFromServer(doc('users/gm')),/blocked/);
  assert.equal(hits,1);
  assert.equal(x.monitor.snapshot().state,'online');
  x.sdk.getDocFromServer=async()=>({metadata:{fromCache:true,hasPendingWrites:false}});
  await assert.rejects(reads.getDocFromServer(doc('users/gm')),/server-confirmed/);
  assert.equal(x.monitor.snapshot().state,'online');
});
test('offline prevents private reads and identity changes invalidate in-flight data',async()=>{
  const x=setup();
  x.window.navigator.onLine=false;x.window.emit('offline');
  const reads=createVerifiedServerReads({auth:x.auth,firestoreSdk:x.sdk,connection:x.monitor,delay:async()=>{}});
  await assert.rejects(reads.getDocFromServer(doc('users/gm')),/could not verify/);
  assert.equal(x.count,0);
  x.window.navigator.onLine=true;x.window.emit('online');
  let release;
  x.sdk.getDocFromServer=()=>new Promise(resolve=>{release=resolve;});
  const pending=reads.getDocFromServer(doc('users/gm'));
  x.auth.currentUser={uid:'player'};x.monitor.identityChanged('player');
  release({metadata:{fromCache:false,hasPendingWrites:false}});
  await assert.rejects(pending,/account changed/);
});
test('online/offline invalidates existing realtime scopes and ignores delayed snapshots',()=>{
  const x=setup(),handlers=[],errors=[],seen=[];
  const firestoreSdk={onSnapshot(ref,opts,cb,fail){
    handlers.push({cb,fail});
    return()=>{};
  }};
  const hub=createRealtimeSubscriptionHub({auth:x.auth,firestoreSdk,connection:x.monitor});
  hub.identityChanged('gm');
  const scope=hub.scope('gm',e=>errors.push(e.message));
  scope.watch(doc('users/gm'),snap=>seen.push(snap.payload));
  handlers[0].cb({payload:'verified',metadata:{fromCache:false,hasPendingWrites:false}});
  assert.deepEqual(seen,['verified']);
  x.window.navigator.onLine=false;x.window.emit('offline');
  handlers[0].cb({payload:'stale',metadata:{fromCache:false,hasPendingWrites:false}});
  assert.deepEqual(seen,['verified']);
  assert.equal(hub.stats().scopes,0);
  assert.equal(errors.length,1);
  x.window.navigator.onLine=true;x.window.emit('online');
  hub.dispose();
  x.monitor.dispose();
});
test('account, read and UI wiring preserve existing runtime, privacy and no offline persistence',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  const auth=read('frontend/src/auth/AuthBootstrap.jsx');
  const monitor=read('frontend/src/runtime/connectionMonitor.mjs');
  const verified=read('frontend/src/runtime/verifiedServerReads.mjs');
  const view=read('frontend/src/runtime/ConnectionBoundary.jsx');
  assert.match(adapter,/createVerifiedServerReads/);
  assert.match(adapter,/connection\.identityChanged\(user\?\.uid\|\|null\)/);
  assert.match(auth,/ConnectionBoundary/);
  assert.match(view,/site-connection-suspended/);
  assert.match(view,/signOut/);
  assert.doesNotMatch(monitor+verified,/localStorage|indexedDB|enableIndexedDbPersistence|persistLocalCache|caches\.open|serviceWorker/);
  assert.equal((adapter.match(/onAuthStateChanged\(/g)||[]).length,1);
});
