import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gmCampaignAccess} from '../frontend/src/dashboard/gmDashboardModel.mjs';
import {playerCampaignAccess,linkedCharacterAccess,matchesOwnedSource} from '../frontend/src/player/playerDashboardModel.mjs';
import {checkProjection} from '../frontend/src/progression/progressionModel.mjs';
import {createConnectionMonitor} from '../frontend/src/runtime/connectionMonitor.mjs';
import {captureAccountSession,isConfirmedServerSnapshot} from '../frontend/src/runtime/sessionIntegrity.mjs';
import {createVerifiedServerReads} from '../frontend/src/runtime/verifiedServerReads.mjs';
import {createRealtimeSubscriptionHub} from '../frontend/src/runtime/realtimeSubscriptions.mjs';
import {createGuardedFunctionsSdk} from '../frontend/src/runtime/guardedFunctionsSdk.mjs';
import {createGuardedStorageSdk} from '../frontend/src/runtime/guardedStorageSdk.mjs';

const doc=path=>({type:'document',path});
const confirmed=data=>({data:()=>data,metadata:{fromCache:false,hasPendingWrites:false}});
const delayed=()=>{
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
function env(){
  const listeners=new Map(),navigator={onLine:true};
  return {navigator,
    addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
    offline(){navigator.onLine=false;for(const fn of listeners.get('offline')||[])fn();},
    online(){navigator.onLine=true;for(const fn of listeners.get('online')||[])fn();}
  };
}
function fixture(){
  const auth={currentUser:{uid:'owner'}};
  const connection=createConnectionMonitor({environment:env()});
  connection.identityChanged('owner');
  const switchTo=uid=>{auth.currentUser=uid?{uid}:null;connection.identityChanged(uid);};
  return {auth,connection,switchTo};
}
const campaign=Object.freeze({
  id:'camp-8',ownerUid:'owner',membershipSchemaVersion:2,
  party:['hero-8'],playerCharacterLinks:{'hero-8':'player'},
  characters:{'hero-8':{ownerUid:'player'}}
});
const member=(uid,role,status='active')=>({uid,role,status,campaignId:campaign.id});
test('v2 membership and GM role never derive from a browser-supplied role',()=>{
  assert.equal(gmCampaignAccess(campaign,null,'owner',campaign.id).allowed,true);
  assert.equal(playerCampaignAccess(campaign,null,'owner',campaign.id).allowed,true);
  assert.equal(gmCampaignAccess(campaign,member('gm','co-gm'),'gm',campaign.id).allowed,true);
  assert.equal(gmCampaignAccess(campaign,member('player','player'),'player',campaign.id).allowed,false);
  assert.equal(playerCampaignAccess(campaign,member('player','player'),'player',campaign.id).allowed,true);
  assert.equal(gmCampaignAccess(campaign,member('gm','co-gm','revoked'),'gm',campaign.id).allowed,false);
  assert.equal(playerCampaignAccess(campaign,member('player','player','suspended'),'player',campaign.id).allowed,false);
  assert.equal(playerCampaignAccess(campaign,member('intruder','player'),'player',campaign.id).allowed,false);
  assert.equal(gmCampaignAccess({...campaign,membershipSchemaVersion:99},null,'owner',campaign.id).allowed,false);
});
test('v2 character ownership must match campaign links and canonical owner source',()=>{
  const shared={id:'hero-8',ownerUid:'player',sourceCharacterId:'sheet-8',
    sharedCampaignId:campaign.id,status:'linked'};
  const player=playerCampaignAccess(campaign,member('player','player'),'player',campaign.id);
  const gm=playerCampaignAccess(campaign,member('gm','co-gm'),'gm',campaign.id);
  assert.deepEqual(linkedCharacterAccess(campaign,shared,'player',player),{allowed:true,owned:true});
  assert.deepEqual(linkedCharacterAccess(campaign,shared,'gm',gm),{allowed:true,owned:false});
  assert.equal(linkedCharacterAccess(campaign,shared,'outsider',{allowed:false,isGM:false}).allowed,false);
  assert.equal(linkedCharacterAccess(campaign,{...shared,ownerUid:'outsider'},'player',player).allowed,false);
  assert.equal(linkedCharacterAccess(campaign,{...shared,status:'archived'},'player',player).allowed,false);
  const own={id:'sheet-8',ownerUid:'player',linkedCampaignIds:[campaign.id],
    campaignCharacterIds:{[campaign.id]:'hero-8'}};
  assert.equal(matchesOwnedSource(own,shared,campaign.id,'player',2),true);
  assert.equal(matchesOwnedSource({...own,campaignCharacterIds:{[campaign.id]:'different'}},
    shared,campaign.id,'player',2),false);
});
test('player universal-check projection isolates other characters',()=>{
  const rows=[
    {id:'c-1',characterId:'hero-8',ownerUid:'player',description:'Private check'},
    {id:'c-2',characterId:'other-8',ownerUid:'other',description:'Other check'}
  ];
  const player=checkProjection(rows,'player','hero-8');
  assert.deepEqual(player.map(row=>row.id),['c-1']);
  assert.deepEqual(checkProjection(rows,'gm').map(row=>row.id),['c-1','c-2']);
});
test('missing metadata, local cache and optimistic data cannot confirm private ownership',()=>{
  for(const metadata of [undefined,{fromCache:true,hasPendingWrites:false},
    {fromCache:false,hasPendingWrites:true},{fromCache:undefined,hasPendingWrites:false}])
    assert.equal(isConfirmedServerSnapshot({metadata}),false);
  assert.equal(isConfirmedServerSnapshot(confirmed({uid:'owner'})),true);
  assert.equal(isConfirmedServerSnapshot(null),false);
});
test('UID-reuse after logout invalidates all earlier account sessions',()=>{
  const x=fixture(),held=captureAccountSession(x);
  held.assertCurrent();
  x.switchTo(null);
  x.switchTo('owner');
  assert.throws(()=>held.assertCurrent(),/account changed/i);
  const now=captureAccountSession(x);
  now.assertCurrent();
  assert.notEqual(now.generation,held.generation);
});
test('same UID re-login cannot re-use or publish an earlier in-flight Firestore response',async()=>{
  const x=fixture(),first=delayed();let requests=0;
  const sdk={
    getDocFromServer(){requests++;return requests===1?first.promise:
      Promise.resolve(confirmed({uid:'owner'}));},
    async getDocsFromServer(){return confirmed({})}
  };
  const api=createVerifiedServerReads({auth:x.auth,firestoreSdk:sdk,connection:x.connection});
  const old=api.getDocFromServer(doc('users/owner'));
  x.switchTo(null);x.switchTo('owner');
  const next=api.getDocFromServer(doc('users/owner'));
  first.resolve(confirmed({uid:'owner',private:'old'}));
  await assert.rejects(old,/account changed/i);
  assert.deepEqual((await next).data(),{uid:'owner'});
  assert.equal(requests,2);
});
test('stale authenticated callable receipts cannot cross logout, and are never retried',async()=>{
  const x=fixture(),pending=delayed();let calls=0;
  const sdk={httpsCallable:()=>()=>{calls++;return pending.promise;}};
  const guarded=createGuardedFunctionsSdk({auth:x.auth,functionsSdk:sdk,connection:x.connection});
  const command=guarded.httpsCallable({},'asteriaAction');
  const old=command({action:'combatCommand'});
  x.switchTo(null);x.switchTo('owner');
  pending.resolve({data:{ok:true,private:'old-receipt'}});
  await assert.rejects(old,/account changed/i);
  assert.equal(calls,1);
  x.connection.retry(); // retry only connection, never the mutation
  assert.equal(calls,1);
  x.switchTo(null);
  await assert.rejects(command({action:'combatCommand'}),/Sign in/i);
});
test('private Storage responses cannot cross a session switch',async()=>{
  const x=fixture(),pending=delayed();
  const storage=createGuardedStorageSdk({
    auth:x.auth,connection:x.connection,
    storageSdk:{ref:(_storage,path)=>({path}),getBlob:()=>pending.promise}
  });
  const old=storage.getBlob(storage.ref(null,'campaigns/camp-8/battleMaps/one/scene.png'));
  x.switchTo('other');
  pending.resolve(new Blob(['secret']));
  await assert.rejects(old,/account changed/i);
});
test('a queued transaction callback is blocked after Auth generation changes',async()=>{
  const x=fixture(),pending=delayed();
  let wrote=false;
  const firestoreSdk={
    async getDocFromServer(){return confirmed({uid:'owner'});},
    async getDocsFromServer(){return confirmed({})},
    async runTransaction(_db,fn){
      return fn({set:()=>{wrote=true;}}); 
    }
  };
  const api=createVerifiedServerReads({auth:x.auth,firestoreSdk,connection:x.connection});
  const transaction=api.runTransaction({},async tx=>{
    await pending.promise;
    tx.set(doc('users/owner'),{name:'updated'});
  });
  x.switchTo(null);x.switchTo('owner');pending.resolve();
  await assert.rejects(transaction,/account changed/i);
});
test('a write batch created by the old session cannot commit after same UID returns',()=>{
  const x=fixture();let committed=0;
  const sdk={
    async getDocFromServer(){return confirmed({});},
    async getDocsFromServer(){return confirmed({});},
    writeBatch(){return {set(){return this;},commit(){committed++;}};}
  };
  const api=createVerifiedServerReads({auth:x.auth,firestoreSdk:sdk,connection:x.connection});
  const batch=api.writeBatch({});batch.set(doc('users/owner'),{});
  x.switchTo(null);x.switchTo('owner');
  assert.throws(()=>batch.commit(),/account changed/i);
  assert.equal(committed,0);
});
test('shared streams never publish metadata-absent data or replay stale data after offline',async()=>{
  const x=fixture(),callbacks=[],seen=[];
  const hub=createRealtimeSubscriptionHub({auth:x.auth,connection:x.connection,
    firestoreSdk:{onSnapshot(_ref,_options,onValue){callbacks.push(onValue);return()=>{};}}});
  hub.identityChanged('owner');
  const scope=hub.scope('owner');
  scope.watch(doc('users/owner'),snapshot=>seen.push(snapshot.payload));
  callbacks[0]({payload:'missing-metadata'});
  callbacks[0]({payload:'cached',metadata:{fromCache:true,hasPendingWrites:false}});
  assert.deepEqual(seen,[]);
  callbacks[0]({payload:'confirmed',metadata:{fromCache:false,hasPendingWrites:false}});
  assert.deepEqual(seen,['confirmed']);
  x.connection.identityChanged(null);hub.identityChanged(null);
  x.switchTo('owner');hub.identityChanged('owner');
  callbacks[0]({payload:'stale',metadata:{fromCache:false,hasPendingWrites:false}});
  assert.deepEqual(seen,['confirmed']);
  hub.dispose();
});
test('Firestore and Storage policy keeps GM secrets and player shares separate',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const rules=read('firestore.rules');
  const storage=read('storage.rules');
  for(const path of ['presentationControl','checkGroups','partyLootDrafts',
    'worldAtlas','sessionNotes','sessionPdfs','recordingControl'])
    assert.ok(rules.includes('match /'+path+'/'),path+' must have an explicit scope');
  assert.match(rules,/systemId == 'itemEcosystem' \|\| systemId == 'gmWorkspace'/);
  assert.match(rules,/match \/checkRequests\/\{checkId\}/);
  assert.match(rules,/resource\.data\.ownerUid == request\.auth\.uid/);
  assert.match(storage,/function campaignMember\(campaignId\)/);
  assert.match(storage,/function campaignGM\(campaignId\)/);
  assert.match(storage,/allow list: if false;/);
  assert.doesNotMatch(read('frontend/src/runtime/sessionIntegrity.mjs'),
    /localStorage\.setItem|sessionStorage\.setItem/);
});
test('all migrated privacy-sensitive services use canonical Auth, server reads and managed listeners',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const roots=['combat','progression','economy','digitalGM','dashboard','player'];
  const files={
    combat:'firebaseCombatService.mjs',
    progression:'firebaseProgressionService.mjs',
    economy:'firebaseEconomyService.mjs',
    digitalGM:'firebaseDigitalGMService.mjs',
    dashboard:'firebaseGMDashboardService.mjs',
    player:'firebasePlayerDashboardService.mjs'
  };
  for(const area of roots){
    const src=read('frontend/src/'+area+'/'+files[area]);
    assert.match(src,/readCanonical/);
    assert.match(src,/getDocFromServer/);
    assert.match(src,/onSnapshot/);
    assert.match(src,/includeMetadataChanges:true/);
    assert.doesNotMatch(src,/initializeApp\(|getFirestore\(|getAuth\(/);
  }
  const auth=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  assert.match(auth,/createGuardedFunctionsSdk/);
  assert.match(auth,/createGuardedStorageSdk/);
  assert.equal((auth.match(/onAuthStateChanged\(/g)||[]).length,1);
});
