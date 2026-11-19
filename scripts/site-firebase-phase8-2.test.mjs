import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createRealtimeSubscriptionHub,createSharedFirestoreSdk}
  from '../frontend/src/runtime/realtimeSubscriptions.mjs';

const document=path=>({type:'document',path});
const collection=path=>({type:'collection',path});
const query=(path,where)=>({type:'query',path,where});
const verified=payload=>({payload,metadata:{fromCache:false,hasPendingWrites:false}});
const cached=payload=>({payload,metadata:{fromCache:true,hasPendingWrites:false}});
const pending=payload=>({payload,metadata:{fromCache:false,hasPendingWrites:true}});

function setup(){
  const auth={currentUser:{uid:'first'}};
  const listeners=new Map(),counts={created:0,closed:0};
  const firestoreSdk={
    onSnapshot(reference,options,onValue,onError){
      assert.equal(options.includeMetadataChanges,true);
      const key=counts.created++;
      listeners.set(key,{reference,onValue,onError});
      return ()=>{if(listeners.delete(key))counts.closed++;};
    },
    doc:(_db,...parts)=>document(parts.join('/')),
    collection:(_db,...parts)=>collection(parts.join('/')),
    query:(ref,filter)=>query(ref.path,filter),
    limit:n=>({limit:n})
  };
  const hub=createRealtimeSubscriptionHub({auth,firestoreSdk});
  const sdk=createSharedFirestoreSdk({auth,firestoreSdk,hub});
  const emit=(path,value)=>{for(const x of [...listeners.values()])
    if(x.reference.path===path)x.onValue(value);
  };
  const error=(path,failure)=>{for(const x of [...listeners.values()])
    if(x.reference.path===path)x.onError(failure);
  };
  return {auth,hub,sdk,firestoreSdk,listeners,counts,emit,error};
}
const ready=x=>{x.hub.identityChanged(x.auth.currentUser?.uid||null);return x;};
test('two panels reading the same document share one verified onSnapshot transport',()=>{
  const x=ready(setup()),first=[],second=[];
  const a=x.hub.scope('first',e=>{throw e});
  const b=x.hub.scope('first',e=>{throw e});
  a.watch(document('campaigns/one'),s=>first.push(s.payload));
  b.watch(document('campaigns/one'),s=>second.push(s.payload));
  assert.equal(x.counts.created,1);
  assert.deepEqual(x.hub.stats(),{streams:1,scopes:2,subscribers:2});
  x.emit('campaigns/one',verified(10));
  assert.deepEqual(first,[10]);assert.deepEqual(second,[10]);
  a.close();assert.equal(x.counts.closed,0);
  x.emit('campaigns/one',verified(20));
  assert.deepEqual(first,[10]);assert.deepEqual(second,[10,20]);
  b.close();b.close();
  assert.equal(x.counts.closed,1);
  assert.equal(x.hub.stats().streams,0);
});
test('filtered queries never share a transport, even with identical collection path',()=>{
  const x=ready(setup()),scopeA=x.hub.scope('first'),scopeB=x.hub.scope('first');
  scopeA.watch(query('campaigns/one/checkRequests','ownerUid==first'),()=>{});
  scopeB.watch(query('campaigns/one/checkRequests','status==published'),()=>{});
  assert.equal(x.counts.created,2);
  scopeA.close();scopeB.close();
  assert.equal(x.counts.closed,2);
});
test('ignore cache-only and pending-write snapshots; allow only server-confirmed values',()=>{
  const x=ready(setup()),received=[],s=x.hub.scope('first');
  s.watch(document('users/first'),snap=>received.push(snap.payload));
  x.emit('users/first',cached('old'));
  x.emit('users/first',pending('optimistic'));
  assert.deepEqual(received,[]);
  x.emit('users/first',verified('trusted'));
  assert.deepEqual(received,['trusted']);
  s.close();
});
test('late component joining a shared stream receives last server-confirmed snapshot once',async()=>{
  const x=ready(setup()),a=x.hub.scope('first'),b=x.hub.scope('first'),
    seen=[];
  a.watch(document('campaigns/one'),()=>{});
  x.emit('campaigns/one',verified('confirmed'));
  b.watch(document('campaigns/one'),snap=>seen.push(snap.payload));
  await Promise.resolve();
  assert.deepEqual(seen,['confirmed']);
  x.emit('campaigns/one',verified('next'));
  assert.deepEqual(seen,['confirmed','next']);
  a.close();b.close();
});
test('logout or account switch revokes all scopes and removes every live transport',()=>{
  const x=ready(setup()),errors=[],values=[];
  const a=x.hub.scope('first',e=>errors.push(e.message));
  const b=x.hub.scope('first',e=>errors.push(e.message));
  a.watch(document('campaigns/one'),snap=>values.push(snap.payload));
  b.watch(query('campaigns/one/characters','ownerUid==first'),()=>{});
  assert.equal(x.listeners.size,2);
  x.auth.currentUser={uid:'other'};
  x.hub.identityChanged('other');
  assert.equal(x.listeners.size,0);
  assert.equal(x.hub.stats().scopes,0);
  assert.equal(errors.length,2);
  assert.throws(()=>x.hub.scope('first'),/another account/);
  assert.throws(()=>a.assertActive(),/no longer authorized/);
  x.emit('campaigns/one',verified('leak'));
  assert.deepEqual(values,[]);
  const other=x.hub.scope('other');
  other.watch(document('campaigns/one'),()=>{});
  assert.equal(x.counts.created,3);
  other.close();
});
test('stale callbacks from a previously unsubscribed transport cannot emit to another account',()=>{
  const x=ready(setup()),seen=[];
  const a=x.hub.scope('first');
  a.watch(document('campaigns/one'),s=>seen.push(s.payload));
  const stale=[...x.listeners.values()][0].onValue;
  x.auth.currentUser={uid:'second'};
  // Delayed Auth event: check the actual Firebase currentUser on every delivery.
  stale(verified('private'));
  assert.deepEqual(seen,[]);
  assert.equal(x.hub.stats().scopes,0);
  x.hub.identityChanged('second');
  stale(verified('private2'));
  assert.deepEqual(seen,[]);
});
test('revoked permissions propagate exactly once to the affected scope',()=>{
  const x=ready(setup()),errors=[],a=x.hub.scope('first',e=>errors.push(e.message));
  a.watch(document('campaigns/one'),()=>{});
  x.error('campaigns/one',Error('permission-denied'));
  x.error('campaigns/one',Error('late error'));
  assert.deepEqual(errors,['permission-denied']);
  assert.equal(x.hub.stats().scopes,0);
});
test('a failing consumer never suppresses another dashboard subscriber',()=>{
  const x=ready(setup()),seen=[],errors=[];
  const a=x.hub.scope('first',err=>errors.push(err.message));
  const b=x.hub.scope('first');
  a.watch(document('campaigns/one'),()=>{throw Error('access revoked');});
  b.watch(document('campaigns/one'),snap=>seen.push(snap.payload));
  x.emit('campaigns/one',verified('secure'));
  assert.deepEqual(errors,['access revoked']);
  assert.deepEqual(seen,['secure']);
  assert.equal(x.counts.closed,0);
  b.close();assert.equal(x.counts.closed,1);
});
test('SDK wrapper preserves existing Firestore functions and rejects unauthorized unscoped subscriptions',()=>{
  const x=ready(setup()),updates=[],errors=[];
  assert.equal(x.sdk.doc({},'campaigns','one').path,'campaigns/one');
  const stopA=x.sdk.onSnapshot(document('campaigns/one'),
    {includeMetadataChanges:true},s=>updates.push(s.payload),e=>errors.push(e));
  const stopB=x.sdk.onSnapshot(document('campaigns/one'),
    {includeMetadataChanges:true},s=>updates.push('other:'+s.payload),e=>errors.push(e));
  assert.equal(x.counts.created,1);
  x.emit('campaigns/one',verified('v1'));
  assert.deepEqual(updates,['v1','other:v1']);
  stopA();stopB();stopA();
  assert.equal(x.counts.closed,1);
  assert.throws(()=>x.sdk.onSnapshot(document('a'),{},()=>{}),/metadata changes/);
  x.auth.currentUser=null;x.hub.identityChanged(null);
  assert.throws(()=>x.sdk.onSnapshot(document('a'),{includeMetadataChanges:true},()=>{}),/Sign in/);
});
test('closing before late async delivery and repeated StrictMode mount/unmount leaks nothing',()=>{
  const x=ready(setup());
  for(let i=0;i<10;i++){
    const s=x.hub.scope('first');
    s.watch(document('campaigns/one'),()=>{throw Error('should not publish');});
    s.close();s.close();
  }
  assert.equal(x.counts.created,10);
  assert.equal(x.counts.closed,10);
  assert.equal(x.hub.stats().scopes,0);
  assert.equal(x.listeners.size,0);
});
test('production React Auth observer is the only identity-change owner',()=>{
  const base=readFileSync(new URL('../frontend/src/auth/firebaseAuthAdapter.mjs',import.meta.url),'utf8');
  const hub=readFileSync(new URL('../frontend/src/runtime/realtimeSubscriptions.mjs',import.meta.url),'utf8');
  assert.match(base,/createRealtimeSubscriptionHub/);
  assert.match(base,/createSharedFirestoreSdk/);
  assert.match(base,/realtime\.identityChanged\(user\?\.uid\|\|null\)/);
  assert.equal((base.match(/onAuthStateChanged\(/g)||[]).length,1);
  assert.doesNotMatch(hub,/initializeApp\(|connectAuthEmulator\(|localStorage|window\.AsteriaFirebase/);
  for(const folder of ['dashboard','player','combat','progression','economy','digitalGM']){
    const names=readdirSync(new URL('../frontend/src/'+folder+'/',import.meta.url))
      .filter(n=>n.startsWith('firebase')&&n.endsWith('Service.mjs'));
    for(const name of names){
      const s=readFileSync(new URL('../frontend/src/'+folder+'/'+name,import.meta.url),'utf8');
      assert.match(s,/onSnapshot/);
      assert.doesNotMatch(s,/initializeApp\(|getFirestore\(|getAuth\(/);
    }
  }
});
