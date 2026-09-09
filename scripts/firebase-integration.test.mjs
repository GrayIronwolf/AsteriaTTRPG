import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {ref,uploadBytes,getBytes,deleteObject} from 'firebase/storage';
import {doc,setDoc,getDoc,updateDoc,getDocs,collection,onSnapshot,writeBatch,Timestamp,deleteDoc,query,where} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {executeAction} from '../functions/handler.mjs';
import {accessInvite} from '../functions/invitations.mjs';
const projectId='demo-asteria';
let env,adminApp,db;
const campaign={ownerUid:'gm',gmUids:['gm'],playerUids:['alice','bob'],roles:{gm:'gm',alice:'player',bob:'player'},players:{alice:{uid:'alice',role:'player',characterIds:['a']},bob:{uid:'bob',role:'player',characterIds:['b']}},party:['a','b'],characters:{a:{ownerUid:'alice'},b:{ownerUid:'bob'}},playerCharacterLinks:{a:'alice',b:'bob'},ucn:'123456789012'};
const sheet=(id,uid)=>({id,ownerUid:uid,sourceCharacterId:id,sharedCampaignId:'c',linkedCampaignIds:['c'],name:id,level:1,xp:0,cp:2,tp:2,hp:[8,10],mp:[10,10],sp:[10,10],bp:[0,5],coins:{copper:100},inventory:[{id:'sword',instanceId:'sword',name:'Sword',qty:2,marketPrice:50,marketValue:20,storageId:'bag',storageSlot:0}],storages:[{id:'bag',name:'Bag',rows:4,cols:4,maxSlots:16}],spells:[{name:'Spark',cost:'3 MP'}],skills:[{name:'Perception',rank:1}]});
const user=uid=>env.authenticatedContext(uid).firestore();
const action=(uid,name,args,requestId=crypto.randomUUID())=>executeAction(db,uid,{action:name,args,requestId},()=>FieldValue.serverTimestamp());
before(async()=>{
  env=await initializeTestEnvironment({projectId,firestore:{rules:fs.readFileSync('firestore.rules','utf8')},storage:{rules:fs.readFileSync('storage.rules','utf8')}});
  adminApp=initializeApp({projectId});db=getFirestore(adminApp);
});
after(async()=>{await env?.cleanup();await deleteApp(adminApp);});
beforeEach(async()=>{
  await env.clearFirestore();
  const batch=db.batch();batch.set(db.doc('campaigns/c'),campaign);
  for(const [id,uid] of [['a','alice'],['b','bob']]) {batch.set(db.doc(`campaigns/c/characters/${id}`),sheet(id,uid));batch.set(db.doc(`users/${uid}/characters/${id}`),sheet(id,uid));}
  batch.set(db.doc('campaigns/c/liveSession/current'),{id:'s',status:'active',expiresAt:new Date(Date.now()+3600000)});
  batch.set(db.doc('campaigns/c/systems/gmWorkspace'),{privateNotes:'GM only'});
  batch.set(db.doc('campaigns/c/systems/itemEcosystem'),{shops:[],playerItemRequests:[]});
  batch.set(db.doc('campaignInvites/123456789012'),{campaignId:'c',ownerUid:'gm',status:'active'});
  await batch.commit();
});
test('members read characters; outsiders and signed-out visitors cannot',async()=>{
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/characters/b')));
  await assertFails(getDoc(doc(user('eve'),'campaigns/c/characters/a')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'campaigns/c')));
  await assertFails(getDoc(doc(user('eve'),'campaigns/c')));
});
test('private GM notes are inaccessible to players',async()=>{
  await assertSucceeds(getDoc(doc(user('gm'),'campaigns/c/systems/gmWorkspace')));
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/systems/gmWorkspace')));
});
test('public username email enumeration is denied',async()=>{
  await db.doc('usernames/alice').set({uid:'alice',email:'private@example.test'});
  await assertFails(getDoc(doc(user('bob'),'usernames/alice')));
  await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(),'usernames')));
});
test('players cannot forge progression, inventory or trade state directly',async()=>{
  for(const patch of [{xp:99999},{inventory:[]},{coins:{gold:999}},{ownerUid:'alice'}]) await assertFails(updateDoc(doc(user('alice'),'campaigns/c/characters/b'),patch));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/characters/a'),{xp:99999}));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/systems/itemEcosystem'),{shops:[{id:'free'}]}));
  await assertSucceeds(updateDoc(doc(user('gm'),'campaigns/c/characters/a'),{xp:100}));
});
test('cosmetic owner edits work but cannot change ownership or class',async()=>{
  await assertSucceeds(updateDoc(doc(user('alice'),'campaigns/c/characters/a'),{name:'Aster'}));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/characters/a'),{ownerUid:'bob'}));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/characters/a'),{klass:'Mage'}));
});
test('character-link hijacking is denied even with a forged private copy',async()=>{
  await assertFails(setDoc(doc(user('alice'),'users/alice/characters/b'),sheet('b','alice')));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c'),{lastLinkedCharacterId:'b','playerCharacterLinks.b':'alice','characters.b.ownerUid':'alice','players.alice.characterIds':['a','b']}));
  await assertFails(setDoc(doc(user('eve'),'campaigns/c/characters/evil'),sheet('evil','eve')));
});
test('presence requires campaign membership',async()=>{
  await assertSucceeds(setDoc(doc(user('alice'),'campaigns/c/sessions/s/presence/alice'),{state:'online'}));
  await assertFails(setDoc(doc(user('eve'),'campaigns/c/sessions/s/presence/eve'),{state:'online'}));
});
test('shared notes work during active sessions, but cannot overwrite organizations',async()=>{
  const ref=doc(user('alice'),'campaigns/c/systems/party-workspace');
  await assertSucceeds(setDoc(ref,{sharedNotes:'Hello',sessionId:'s',updatedBy:'alice',updatedAt:Timestamp.now()}));
  await assertFails(updateDoc(ref,{organizations:[{owner:'alice'}]}));
  await db.doc('campaigns/c/liveSession/current').update({status:'paused'});
  await assertFails(updateDoc(ref,{sharedNotes:'paused change'}));
});
test('authenticated resource action writes character, private mirror and event atomically',async()=>{
  const result=await action('alice','updateCampaignCharacterResource',['c','a','hp',-2]);assert.equal(result.ok,true,result.error);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data().hp,[6,10]);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().hp,[6,10]);
  assert.equal((await db.collection('campaigns/c/events').get()).size,1);
});
test('same request ID cannot duplicate a resource charge',async()=>{
  const args=['c','a','hp',-2];const results=await Promise.all([action('alice','updateCampaignCharacterResource',args,'once'),action('alice','updateCampaignCharacterResource',args,'once')]);
  for(const result of results) assert.equal(result.ok,true,result.error);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data().hp,[6,10]);
  assert.equal((await db.collection('campaigns/c/events').get()).size,1);
});
test('actions reject outsiders, other characters, expired sessions and malformed values',async()=>{
  for(const uid of ['bob','eve']) assert.equal((await action(uid,'updateCampaignCharacterResource',['c','a','hp',2])).ok,false);
  await assert.rejects(action('','updateCampaignCharacterResource',['c','a','hp',2]));
  await assert.rejects(action('alice','updateCampaignCharacterResource',['c','a','hp',Infinity]));
  await db.doc('campaigns/c/liveSession/current').update({expiresAt:new Date(Date.now()-1000)});
  assert.equal((await action('alice','updateCampaignCharacterResource',['c','a','hp',2])).ok,false);
});
test('spell charges use saved costs, not client supplied costs',async()=>{
  const result=await action('alice','castCharacterSpell',['c','a',{name:'Spark',cost:0},{mp:0}]);assert.equal(result.ok,true,result.error);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data().mp,[7,10]);
  assert.equal((await action('alice','castCharacterSpell',['c','a',{name:'Unknown'},{}])).ok,false);
});
test('players cannot create arbitrary items or seed arbitrary skill ranks',async()=>{
  assert.equal((await action('alice','updateCharacterInventory',['c','a',{type:'add-item',item:{name:'Free gold'}}])).ok,false);
  const result=await action('alice','recordSkillSuccess',['c','a',{name:'Perception',rank:6}]);assert.equal(result.ok,true,result.error);
  assert.equal((await action('alice','recordSkillSuccess',['c','a',{name:'Invented',rank:6}])).ok,false);
});
test('give requests escrow once, require intended recipient and resolve once',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);assert.equal(created.ok,true,created.error);
  const id=created.request.id;
  assert.equal((await action('alice','respondLiveItemRequest',['c','b',id,true,{}])).ok,false);
  const accepted=await action('bob','respondLiveItemRequest',['c','b',id,true,{}]);assert.equal(accepted.ok,true,accepted.error);
  assert.equal((await action('bob','respondLiveItemRequest',['c','b',id,true,{}])).ok,false);
  const a=(await db.doc('campaigns/c/characters/a').get()).data();const b=(await db.doc('campaigns/c/characters/b').get()).data();
  assert.equal(a.inventory.reduce((n,i)=>n+i.qty,0),1);assert.equal(b.inventory.reduce((n,i)=>n+i.qty,0),3);
});
test('invitation preview discloses a summary; valid join grants membership',async()=>{
  const preview=await accessInvite(db,'eve','123456789012',false);assert.deepEqual(Object.keys(preview).sort(),['id','name','ucn']);
  assert.equal((await db.doc('campaigns/c').get()).data().playerUids.includes('eve'),false);
  await accessInvite(db,'eve','123456789012',true);
  await assertSucceeds(getDoc(doc(user('eve'),'campaigns/c')));
  assert.equal((await db.doc('campaigns/c').get()).data().roles.eve,'player');
});
test('forged invites cannot grant campaign membership',async()=>{
  await db.doc('campaignInvites/999999999999').set({campaignId:'c',ownerUid:'eve',status:'active'});
  assert.equal(await accessInvite(db,'eve','999999999999',true),null);
});
test('two clients receive an update and unsubscribed clients stop receiving',async()=>{
  const first=user('alice'),second=user('bob');const values=[];
  let unsubscribe;
  const changed=new Promise((resolve,reject)=>{
    unsubscribe=onSnapshot(doc(second,'campaigns/c/characters/a'),snapshot=>{values.push(snapshot.data().name);if(snapshot.data().name==='Updated')resolve();},reject);
  });
  await updateDoc(doc(first,'campaigns/c/characters/a'),{name:'Updated'});
  await Promise.race([changed,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Listener timed out')),5000))]);
  unsubscribe();const count=values.length;
  await updateDoc(doc(first,'campaigns/c/characters/a'),{name:'Later'});
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(values.length,count);
});

test('gallery reads require ownership or campaign membership; uploads enforce MIME',async()=>{
  const path='users/alice/characters/a/gallery/photo.png';
  const owner=env.authenticatedContext('alice').storage();
  await assertSucceeds(uploadBytes(ref(owner,path),new Uint8Array([137,80,78,71]),{contentType:'image/png',customMetadata:{campaignId:'c'}}));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('bob').storage(),path)));
  await assertFails(getBytes(ref(env.authenticatedContext('eve').storage(),path)));
  await assertFails(uploadBytes(ref(env.authenticatedContext('bob').storage(),path),new Uint8Array([1]),{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(owner,'users/alice/characters/a/gallery/file.html'),new Uint8Array([1]),{contentType:'text/html'}));
  await deleteObject(ref(owner,path));
});
test('owner can link a new private character atomically; cannot delete and reimport live state',async()=>{
  const own=user('alice');await setDoc(doc(own,'users/alice/characters/new'),sheet('new','alice'));
  const batch=writeBatch(own);batch.set(doc(own,'campaigns/c/characters/new'),sheet('new','alice'));
  batch.update(doc(own,'campaigns/c'),{lastLinkedCharacterId:'new',party:['a','b','new'],'players.alice.characterIds':['a','new'],'characters.new':{ownerUid:'alice'},'playerCharacterLinks.new':'alice'});
  await assertSucceeds(batch.commit());
  const deletion=writeBatch(own);deletion.delete(doc(own,'campaigns/c/characters/new'));await assertFails(deletion.commit());
});
test('loot rewards cannot be acknowledged or claimed twice directly',async()=>{
  await db.doc('campaigns/c/events/loot').set({type:'loot-reward',targetCharacterId:'a',targetOwnerUid:'alice',acknowledged:false,status:'delivered',payload:{item:{name:'Gem',qty:1,marketPrice:100,marketValue:50}}});
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/events/loot'),{status:'accepted',acknowledged:true,acknowledgedBy:'alice'}));
  const first=await action('alice','resolveLootReward',['c','a','loot','inventory','bag']);assert.equal(first.ok,true,first.error);
  const second=await action('alice','resolveLootReward',['c','a','loot','inventory','bag']);assert.equal(second.applied,false);
});

test('callable transport rejects unauthenticated callers and accepts Firebase Auth users',async()=>{
  const {initializeApp:clientApp,deleteApp:deleteClient}=await import('firebase/app');
  const {getAuth,connectAuthEmulator,signInAnonymously,signOut}=await import('firebase/auth');
  const {getFunctions,connectFunctionsEmulator,httpsCallable}=await import('firebase/functions');
  // Exercise the production onCall wrapper over local TCP. The full Functions
  // emulator uses Unix sockets unavailable in some hosted development sandboxes.
  const {default:express}=await import('express');
  const {asteriaAction}=await import('../functions/index.mjs');
  const http=express();http.use(express.json());
  http.post('/demo-asteria/us-central1/asteriaAction',asteriaAction);
  const server=await new Promise(resolve=>{const value=http.listen(0,'127.0.0.1',()=>resolve(value));});
  const app=clientApp({projectId,apiKey:'demo-key',appId:'demo-app'},'callable-test');
  try {
    const auth=getAuth(app);connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
    const functions=getFunctions(app,'us-central1');connectFunctionsEmulator(functions,'127.0.0.1',server.address().port);
    const call=httpsCallable(functions,'asteriaAction');
    await assert.rejects(call({action:'updateCampaignCharacterResource',args:['c','a','hp',-1],requestId:'unauth'}),error=>error.code==='functions/unauthenticated');
    const {user:authed}=await signInAnonymously(auth);
    await db.doc('campaigns/c').update({playerUids:['alice','bob',authed.uid]});
    await db.doc('campaigns/c/characters/authed').set(sheet('authed',authed.uid));
    const result=await call({action:'updateCampaignCharacterResource',args:['c','authed','hp',-1],requestId:'transport'});
    assert.equal(result.data.ok,true,result.data.error);
    assert.deepEqual((await db.doc('campaigns/c/characters/authed').get()).data().hp,[7,10]);
    await signOut(auth);
  } finally {await deleteClient(app);await new Promise(resolve=>server.close(resolve));}
});

test('shop purchase updates stock and currency and rejects exhausted stock',async()=>{
  await db.doc('campaigns/c/systems/itemEcosystem').set({shops:[{id:'shop',status:'open',buyModifier:1,currencyCopper:1000,stock:[{qty:1,item:{name:'Gem',marketPrice:0.1,marketValue:0.05}}]}]});
  const first=await action('alice','buyLiveShopItem',['c','a','shop',0,1]);assert.equal(first.ok,true,first.error);
  assert.equal((await action('alice','buyLiveShopItem',['c','a','shop',0,1])).ok,false);
  const sheet=(await db.doc('campaigns/c/characters/a').get()).data();assert.equal(sheet.coins.copper,90);
});
test('CP, talents, currency, rest, and organization commands execute against canonical state',async()=>{
  await db.doc('campaigns/c/characters/a').update({klass:'Ranger',tp:20,cp:4,characteristics:{strength:1,wisdom:1}});
  for(const [name,args] of [
    ['spendCharacteristicPoints',['c','a','strength',1]],
    ['spendCharacteristicAllocations',['c','a',{wisdom:1}]],
    ['purchaseTalentRank',['c','a',{name:'Animal Companion',tier:5,maxRank:100}]],
    ['updateCampaignCharacterCurrency',['c','a','copper',5]],
    ['takeCampaignCharacterRest',['c','a','short',{}]],
    ['createPartyOrganization',['c','a',{name:'Party'}]],
    ['updateCharacterInventory',['c','a',{type:'create-storage',name:'Pack',rows:2,cols:2}]]
  ]) {const result=await action('alice',name,args);assert.equal(result.ok,true,name+': '+result.error);}
});


test('Forge owner query returns own sheet while GM retains linked campaign access',async()=>{
  await db.doc('users/gm/characters/own').set({id:'own',ownerUid:'gm'});
  await db.doc('users/gm/characters/stale').set({id:'stale',ownerUid:'alice'});
  const own=await assertSucceeds(getDocs(query(collection(user('gm'),'users/gm/characters'),where('ownerUid','==','gm'))));
  assert.deepEqual(own.docs.map(record=>record.id),['own']);
  await assertSucceeds(getDoc(doc(user('gm'),'campaigns/c/characters/a')));
  await assertFails(getDoc(doc(user('gm'),'users/alice/characters/a')));
  const player=await assertSucceeds(getDocs(query(collection(user('alice'),'users/alice/characters'),where('ownerUid','==','alice'))));
  assert.deepEqual(player.docs.map(record=>record.id),['a']);
});
test('GM cannot read an unrelated character using either private or campaign path',async()=>{
  await db.doc('campaigns/other').set({...campaign,ownerUid:'other-gm',gmUids:[],roles:{eve:'player'},playerUids:['eve']});
  await db.doc('campaigns/other/characters/e').set(sheet('e','eve'));
  await db.doc('users/eve/characters/e').set(sheet('e','eve'));
  await assertFails(getDoc(doc(user('gm'),'campaigns/other/characters/e')));
  await assertFails(getDoc(doc(user('gm'),'users/eve/characters/e')));
});
test('private Forge writes and deletion are owner only; recursive rules cannot bypass owner validation',async()=>{
  await assertFails(setDoc(doc(user('gm'),'users/gm/characters/foreign'),{id:'foreign',ownerUid:'alice'}));
  await assertFails(setDoc(doc(user('gm'),'users/gm/characters/a'),sheet('a','gm')));
  await assertFails(updateDoc(doc(user('gm'),'users/alice/characters/a'),{name:'Hijacked'}));
  await assertFails(deleteDoc(doc(user('gm'),'users/alice/characters/a')));
  await assertSucceeds(updateDoc(doc(user('alice'),'users/alice/characters/a'),{name:'My character'}));
  await assertFails(updateDoc(doc(user('alice'),'users/alice/characters/a'),{ownerUid:'gm'}));
  await assertSucceeds(deleteDoc(doc(user('alice'),'users/alice/characters/a')));
});
test('GM campaign edits preserve ownership and callable actions cannot impersonate a player',async()=>{
  await assertSucceeds(updateDoc(doc(user('gm'),'campaigns/c/characters/a'),{hp:[9,10]}));
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c/characters/a'),{ownerUid:'gm'}));
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c/characters/a'),{sourceCharacterId:'other'}));
  assert.equal((await action('gm','updateCampaignCharacterResource',['c','a','hp',1])).ok,false);
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().ownerUid,'alice');
});


test('unlinked owner sheets and existing account settings still save normally',async()=>{
  const own=user('gm');
  await assertSucceeds(setDoc(doc(own,'users/gm/characters/own'),{id:'own',ownerUid:'gm',name:'New Character'}));
  await assertSucceeds(updateDoc(doc(own,'users/gm/characters/own'),{name:'Updated'}));
  await assertSucceeds(setDoc(doc(own,'users/gm/settings/appState'),{selected:'own'}));
  await assertSucceeds(setDoc(doc(own,'users/gm'),{characters:['own']}));
});
