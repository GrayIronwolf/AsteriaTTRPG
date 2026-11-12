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
import {createCampaignIdentity,previewCampaignUCN} from '../functions/campaignUCN.mjs';
import {stageLegacyMemberships} from '../functions/campaignMembership.mjs';
import {prepareCampaignCutover} from '../functions/campaignAccessCutover.mjs';
import {campaignJoinRequest} from '../functions/campaignJoinRequests.mjs';
import {listCampaignPlayerRoster} from '../functions/campaignPlayerRoster.mjs';
import {moderateCampaignMember} from '../functions/campaignMemberControls.mjs';
import {changeCampaignMemberRole,setCampaignCoGmPermission,listCampaignMembershipActivity} from '../functions/campaignRolePermissions.mjs';
import {listPendingCampaignJoinRequests,reviewCampaignJoinRequest,setCampaignJoinApprovalMode} from '../functions/campaignJoinApproval.mjs';
import {campaignCharacterLink} from '../functions/campaignCharacterLinks.mjs';
import {listPendingCampaignCharacterLinks,reviewCampaignCharacterLink} from '../functions/campaignCharacterApproval.mjs';
import {changeCampaignCharacterLifecycle,listCampaignCharacterLifecycle} from '../functions/campaignCharacterLifecycle.mjs';
import {issueSecureCampaignInvitation,assertSecureInvitationEligible} from '../functions/campaignSecureInvitations.mjs';
import {listSecureCampaignInvitations,changeSecureCampaignInvitation} from '../functions/campaignInvitationManager.mjs';
import {previewSecureCampaignInvitation,acceptSecureCampaignInvitation} from '../functions/campaignInvitationAcceptance.mjs';
import {sendCampaignEmailInvitations,resendCampaignEmailInvitation} from '../functions/campaignEmailInvitations.mjs';
import {listCampaignNotifications,markCampaignNotificationRead,notifyVerifiedEmailRecipient} from '../functions/campaignNotifications.mjs';
import {browserCampaignLink,browserOwnedSubscription,browserCampaignSubscription} from './helpers/campaign-link-harness.mjs';
import {encounterPlayerRoster} from '../src/state/campaignCharacterRecords.mjs';
import '../js/character-access.js';
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
test('player custom items are published and delivered together',async()=>{
  const result=await action('alice','updateCharacterInventory',['c','a',{type:'create-custom-item',storageId:'bag',item:{name:'Copper Lantern',type:'Equipment',marketValue:1,marketPrice:5}}]);
  assert.equal(result.ok,true,result.error);
  const catalog=await db.collection('customItems').get();
  assert.equal(catalog.size,1);
  const definition=catalog.docs[0].data();
  const inventory=(await db.doc('campaigns/c/characters/a').get()).data().inventory;
  const created=inventory.find(item=>item.definitionId===definition.definitionId);
  assert.ok(created);
  assert.equal(created.catalogId,definition.id);
  assert.notEqual(created.instanceId,definition.id);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().inventory,inventory);
});

test('failed custom item storage does not publish an orphan catalog entry',async()=>{
  await db.doc('campaigns/c/characters/a').update({storages:[{id:'bag',name:'Bag',rows:1,cols:1,maxSlots:1}]});
  const result=await action('alice','updateCharacterInventory',['c','a',{type:'create-custom-item',storageId:'bag',item:{name:'Blocked Lantern',marketValue:1,marketPrice:5}}]);
  assert.equal(result.ok,false);
  assert.equal((await db.collection('customItems').get()).size,0);
});

test('GM custom reward catalog and recipient reward appear atomically',async()=>{
  const result=await action('gm','createCustomLootReward',['c','a',{name:'Mystery Vial',type:'Potion',marketValue:1,marketPrice:5,qty:2},{message:'Found in the cellar'}]);
  assert.equal(result.ok,true,result.error);
  assert.equal((await db.collection('customItems').get()).size,1);
  const character=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(character.pendingItemRewards.length,1);
  assert.equal(character.pendingItemRewards[0].item.qty,2);
  assert.equal((await db.doc(`campaigns/c/events/${result.eventId}`).get()).data().type,'loot-reward');
});

test('GM custom spellbooks retain their compendium spell metadata',async()=>{
  const result=await action('gm','createCustomLootReward',['c','a',{
    name:'Spark Spellbook',type:'Spellbook',isSpellbook:true,
    marketValue:5,marketPrice:10,compendiumSpellId:'spell:spark',
    compendiumSpellRoute:'#spell-spark',spell:{id:'spell:spark',name:'Spark',rank:'Weak',element:'Fire',manaCost:'3 MP'}
  },{}]);
  assert.equal(result.ok,true,result.error);
  const reward=(await db.doc('campaigns/c/characters/a').get()).data().pendingItemRewards[0].item;
  assert.equal(reward.spell.id,'spell:spark');
  assert.equal(reward.spell.manaCost,'3 MP');
  assert.equal(reward.compendiumSpellId,'spell:spark');
});

test('non GM cannot create a custom reward for another character',async()=>{
  const result=await action('alice','createCustomLootReward',['c','b',{name:'Unapproved Item',marketValue:1,marketPrice:5}]);
  assert.equal(result.ok,false);
  assert.equal((await db.collection('customItems').get()).size,0);
});

test('members read characters; outsiders and signed-out visitors cannot',async()=>{
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/characters/b')));
  await assertFails(getDoc(doc(user('eve'),'campaigns/c/characters/a')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'campaigns/c')));
  await assertFails(getDoc(doc(user('eve'),'campaigns/c')));
});
test('dashboard layouts are private per account, persist across reads, and do not alter gameplay',async()=>{
 const key='gm-c',alice=doc(user('alice'),'users/alice/dashboardLayouts/'+key);
 const bob=doc(user('bob'),'users/bob/dashboardLayouts/'+key);
 const data={layout:{version:4,mode:'custom',order:['encounter','xp'],hidden:[],
   placements:{encounter:{x:0,y:0,w:6,h:5},xp:{x:6,y:0,w:4,h:4}},lockedPositions:['xp']}};
 await assertSucceeds(setDoc(alice,data));
 await assertSucceeds(setDoc(bob,{layout:{version:4,mode:'default'}}));
 const reopened=await assertSucceeds(getDoc(doc(user('alice'),'users/alice/dashboardLayouts/'+key)));
 assert.deepEqual(reopened.data().layout,data.layout);
 await assertFails(getDoc(doc(user('bob'),'users/alice/dashboardLayouts/'+key)));
 await assertFails(setDoc(doc(user('bob'),'users/alice/dashboardLayouts/'+key),data));
 assert.equal((await assertSucceeds(getDoc(bob))).data().layout.mode,'default');
 assert.equal((await db.doc('campaigns/c/characters/a').get()).data().ownerUid,'alice');
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
test('Phase 1.2: accepting an item gift updates both owner mirrors before acknowledgement',async()=>{
  await db.doc('users/alice/characters/a').update({journal:['Private sender journal']});
  await db.doc('users/bob/characters/b').update({journal:['Private recipient journal']});
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);
  assert.equal(created.ok,true,created.error);
  const done=await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{}]);
  assert.equal(done.ok,true,done.error);
  for(const [id,uid] of [['a','alice'],['b','bob']]){
    const campaign=(await db.doc(`campaigns/c/characters/${id}`).get()).data();
    const owner=(await db.doc(`users/${uid}/characters/${id}`).get()).data();
    assert.deepEqual(owner.inventory,campaign.inventory,`${id}: inventory mirrored`);
    assert.equal(owner.coreRevision,campaign.coreRevision,`${id}: revision mirrored`);
    assert.deepEqual(owner.journal,[`Private ${id==='a'?'sender':'recipient'} journal`]);
  }
  const second=await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{}]);
  assert.equal(second.ok,false);
});

test('Phase 1.2: trade finalize synchronizes both players and rejects replay',async()=>{
  const bob=(await db.doc('campaigns/c/characters/b').get()).data();
  bob.inventory.push({id:'token',instanceId:'token',name:'Moon Token',qty:1,marketValue:2,marketPrice:5,storageId:'bag',storageSlot:1});
  await db.doc('campaigns/c/characters/b').set(bob);
  await db.doc('users/bob/characters/b').set(bob);
  const offer=await action('alice','createLiveItemRequest',['c','a','b','sword','trade',{quantity:1}]);
  assert.equal(offer.ok,true,offer.error);
  const ready=await action('bob','respondLiveItemRequest',['c','b',offer.request.id,true,{exchangeItemId:'token',exchangeQuantity:1}]);
  assert.equal(ready.ok,true,ready.error);assert.equal(ready.awaitingSender,true);
  const afterReady=(await db.doc('campaigns/c/characters/b').get()).data();
  assert.deepEqual((await db.doc('users/bob/characters/b').get()).data().inventory,afterReady.inventory);
  const final=await action('alice','finalizeLiveItemTrade',['c','a',offer.request.id,true]);
  assert.equal(final.ok,true,final.error);
  for(const [id,uid] of [['a','alice'],['b','bob']]){
    const shared=(await db.doc(`campaigns/c/characters/${id}`).get()).data();
    const privateCopy=(await db.doc(`users/${uid}/characters/${id}`).get()).data();
    assert.deepEqual(privateCopy.inventory,shared.inventory);
    assert.equal(privateCopy.coreRevision,shared.coreRevision);
  }
  const sender=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(sender.inventory.some(item=>item.name==='Moon Token'),true);
  assert.equal((await action('alice','finalizeLiveItemTrade',['c','a',offer.request.id,true])).ok,false);
});

test('Phase 1.2: selling to another player moves currency and items in one transaction',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','sell',{quantity:1,priceCopper:50}]);
  assert.equal(created.ok,true,created.error);
  const result=await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{}]);
  assert.equal(result.ok,true,result.error);
  const total=coins=>Object.entries({royal_platinum:10000000000,royal_crown:100000000,platinum_crown:1000000,gold:10000,silver:100,copper:1}).reduce((sum,[unit,value])=>sum+Number(coins?.[unit]||0)*value,0);
  for(const [id,uid,wallet] of [['a','alice',150],['b','bob',50]]){
    const shared=(await db.doc(`campaigns/c/characters/${id}`).get()).data();
    const owner=(await db.doc(`users/${uid}/characters/${id}`).get()).data();
    assert.deepEqual(owner.inventory,shared.inventory);
    assert.deepEqual(owner.coins,shared.coins);
    assert.equal(total(shared.coins),wallet);
  }
});

test('Phase 1.2: full recipient storage rejects a gift without partial item or currency changes',async()=>{
  for(const id of ['campaigns/c/characters/b','users/bob/characters/b']){
    const stored=(await db.doc(id).get()).data();
    await db.doc(id).update({
      storages:[{id:'bag',name:'Bag',rows:1,cols:1,maxSlots:1}],
      inventory:stored.inventory.map(item=>({...item,stackable:false}))
    });
  }
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);
  assert.equal(created.ok,true,created.error);
  const before=[];
  for(const id of ['campaigns/c/characters/a','users/alice/characters/a','campaigns/c/characters/b','users/bob/characters/b'])
    before.push((await db.doc(id).get()).data());
  const response=await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{}]);
  assert.equal(response.ok,false);
  for(const [i,id] of ['campaigns/c/characters/a','users/alice/characters/a','campaigns/c/characters/b','users/bob/characters/b'].entries())
    assert.deepEqual((await db.doc(id).get()).data(),before[i],`untouched ${id}`);
  const request=(await db.doc('campaigns/c/itemRequests/'+created.request.id).get()).data();
  assert.equal(request.status,'pending');
});

test('Phase 1.2: missing or mismatched counterparty owner prevents cross-account transfer',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);
  assert.equal(created.ok,true,created.error);
  await db.doc('users/alice/characters/a').delete();
  const result=await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{}]);
  assert.equal(result.ok,false);
  assert.equal((await db.doc('campaigns/c/itemRequests/'+created.request.id).get()).data().status,'pending');
  assert.equal((await db.doc('campaigns/c/characters/b').get()).data().inventory.reduce((n,i)=>n+i.qty,0),2);
});

test('Phase 1.2: trade result acknowledgement never overwrites private character profile',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);
  assert.equal(created.ok,true,created.error);
  const received=await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{}]);
  assert.equal(received.ok,true,received.error);
  await db.doc('users/alice/characters/a').update({name:'Private Forge Name',journal:['Owner notes']});
  const acknowledgment=await action('alice','acknowledgeLiveItemRequest',['c','a',created.request.id]);
  assert.equal(acknowledgment.ok,true,acknowledgment.error);
  const owner=(await db.doc('users/alice/characters/a').get()).data();
  assert.equal(owner.name,'Private Forge Name');
  assert.deepEqual(owner.journal,['Owner notes']);
});

test('Phase 2.2: sender can withdraw a pending escrowed gift after the session ends',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);
  assert.equal(created.ok,true,created.error);
  await db.doc('campaigns/c/liveSession/current').update({status:'ended'});
  const cancelled=await action('alice','cancelLiveItemRequest',['c','a',created.request.id]);
  assert.equal(cancelled.ok,true,cancelled.error);
  assert.equal(cancelled.escrowReturned,true);
  const request=(await db.doc('campaigns/c/itemRequests/'+created.request.id).get()).data();
  assert.equal(request.status,'cancelled');
  assert.equal(request.recipientNotice,'unread');
  assert.equal(request.senderNotice,'acknowledged');
  const shared=(await db.doc('campaigns/c/characters/a').get()).data();
  const owner=(await db.doc('users/alice/characters/a').get()).data();
  assert.deepEqual(owner.inventory,shared.inventory);
  assert.equal(shared.inventory.reduce((n,item)=>n+item.qty,0),2);
  const again=await action('alice','cancelLiveItemRequest',['c','a',created.request.id]);
  assert.equal(again.ok,false);
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().inventory.reduce((n,item)=>n+item.qty,0),2);
  assert.equal((await action('bob','cancelLiveItemRequest',['c','b',created.request.id])).ok,false);
});

test('Phase 2.2: recipient can decline a pending request without a live session',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);
  assert.equal(created.ok,true,created.error);
  await db.doc('campaigns/c/liveSession/current').update({status:'ended'});
  const declined=await action('bob','respondLiveItemRequest',['c','b',created.request.id,false,{}]);
  assert.equal(declined.ok,true,declined.error);
  assert.equal((await db.doc('campaigns/c/itemRequests/'+created.request.id).get()).data().status,'declined');
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().inventory.reduce((n,item)=>n+item.qty,0),2);
  assert.equal((await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{}])).ok,false);
});

test('Phase 2.2: either trade participant can withdraw counteroffer outside session, restoring both escrow stacks',async()=>{
  for(const id of ['campaigns/c/characters/b','users/bob/characters/b']){
    const before=(await db.doc(id).get()).data();
    before.inventory.push({id:'token',instanceId:'token',name:'Moon Token',qty:1,storageId:'bag',storageSlot:1,stackable:false});
    await db.doc(id).update({inventory:before.inventory});
  }
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','trade',{quantity:1,requestedItem:'Moon Token'}]);
  assert.equal(created.ok,true,created.error);
  const ready=await action('bob','respondLiveItemRequest',['c','b',created.request.id,true,{exchangeItemId:'token',exchangeQuantity:1}]);
  assert.equal(ready.ok,true,ready.error);
  assert.equal(ready.awaitingSender,true);
  await db.doc('campaigns/c/liveSession/current').update({status:'ended'});
  assert.equal((await action('alice','finalizeLiveItemTrade',['c','a',created.request.id,true])).ok,false);
  const withdrawn=await action('bob','cancelLiveItemRequest',['c','b',created.request.id]);
  assert.equal(withdrawn.ok,true,withdrawn.error);
  for(const [id,uid,expectedName] of [['a','alice','Sword'],['b','bob','Moon Token']]){
    const shared=(await db.doc('campaigns/c/characters/'+id).get()).data();
    const owned=(await db.doc('users/'+uid+'/characters/'+id).get()).data();
    assert.deepEqual(owned.inventory,shared.inventory);
    assert.equal(shared.inventory.some(item=>item.name===expectedName),true);
  }
  const sender=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(sender.inventory.reduce((n,item)=>n+Number(item.qty||0),0),2);
  const recipient=(await db.doc('campaigns/c/characters/b').get()).data();
  assert.equal(recipient.inventory.some(item=>item.id==='token'||item.name==='Moon Token'),true);
  const result=(await db.doc('campaigns/c/itemRequests/'+created.request.id).get()).data();
  assert.equal(result.status,'cancelled');
  assert.equal(result.resolution.escrowReturned,true);
  assert.equal(result.senderNotice,'unread');
  assert.equal((await action('alice','cancelLiveItemRequest',['c','a',created.request.id])).ok,false);
  assert.equal((await action('bob','finalizeLiveItemTrade',['c','b',created.request.id,true])).ok,false);
});

test('Phase 2.2: fully occupied bags preserve both returned escrow items as overflow',async()=>{
  for(const id of ['campaigns/c/characters/a','users/alice/characters/a']){
    const before=(await db.doc(id).get()).data();
    await db.doc(id).update({inventory:before.inventory.map(item=>({...item,stackable:false}))});
  }
  for(const id of ['campaigns/c/characters/b','users/bob/characters/b']){
    const before=(await db.doc(id).get()).data();
    before.inventory.push({id:'token',instanceId:'token',name:'Moon Token',qty:1,storageId:'bag',storageSlot:1,stackable:false});
    await db.doc(id).update({inventory:before.inventory});
  }
  const made=await action('alice','createLiveItemRequest',['c','a','b','sword','trade',{quantity:1}]);
  assert.equal(made.ok,true,made.error);
  const ready=await action('bob','respondLiveItemRequest',['c','b',made.request.id,true,{exchangeItemId:'token',exchangeQuantity:1}]);
  assert.equal(ready.ok,true,ready.error);
  for(const id of ['campaigns/c/characters/a','users/alice/characters/a','campaigns/c/characters/b','users/bob/characters/b']){
    await db.doc(id).update({storages:[{id:'bag',name:'Bag',rows:1,cols:1,maxSlots:1}]});
  }
  await db.doc('campaigns/c/liveSession/current').update({status:'expired'});
  const withdrawn=await action('alice','cancelLiveItemRequest',['c','a',made.request.id]);
  assert.equal(withdrawn.ok,true,withdrawn.error);
  assert.equal(withdrawn.returnedToOverflow,true);
  const alice=(await db.doc('campaigns/c/characters/a').get()).data();
  const bob=(await db.doc('campaigns/c/characters/b').get()).data();
  assert.equal(alice.inventory.reduce((n,i)=>n+Number(i.qty||0),0),2);
  assert.equal(bob.inventory.some(i=>i.name==='Moon Token'),true);
  assert.equal(alice.inventory.some(i=>i.storageSlot===null||i.storageSlot===-1),true);
  assert.equal(bob.inventory.some(i=>i.storageSlot===null||i.storageSlot===-1),true);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().inventory,alice.inventory);
  assert.deepEqual((await db.doc('users/bob/characters/b').get()).data().inventory,bob.inventory);
  assert.equal((await db.doc('campaigns/c/itemRequests/'+made.request.id).get()).data().returnedToOverflow,true);
});

test('Phase 2.2: sender may reject a counteroffer after the session ends, acceptance remains blocked',async()=>{
  for(const id of ['campaigns/c/characters/b','users/bob/characters/b']){
    const data=(await db.doc(id).get()).data();
    data.inventory.push({id:'token',instanceId:'token',name:'Rune',qty:1,storageId:'bag',storageSlot:1});
    await db.doc(id).update({inventory:data.inventory});
  }
  const made=await action('alice','createLiveItemRequest',['c','a','b','sword','trade',{quantity:1}]);
  assert.equal(made.ok,true,made.error);
  assert.equal((await action('bob','respondLiveItemRequest',['c','b',made.request.id,true,{exchangeItemId:'token',exchangeQuantity:1}])).ok,true);
  await db.doc('campaigns/c/liveSession/current').update({status:'ended'});
  const rejected=await action('alice','finalizeLiveItemTrade',['c','a',made.request.id,false]);
  assert.equal(rejected.ok,true,rejected.error);
  assert.equal((await db.doc('campaigns/c/itemRequests/'+made.request.id).get()).data().status,'declined');
  const sender=(await db.doc('campaigns/c/characters/a').get()).data();
  const recipient=(await db.doc('campaigns/c/characters/b').get()).data();
  assert.equal(sender.inventory.reduce((n,item)=>n+item.qty,0),2);
  assert.equal(recipient.inventory.some(item=>item.name==='Rune'),true);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().inventory,sender.inventory);
  assert.deepEqual((await db.doc('users/bob/characters/b').get()).data().inventory,recipient.inventory);
});

test('Phase 1.3: trades are invisible to other campaign members but available to both players and GM',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1,note:'Private party handoff'}]);
  assert.equal(created.ok,true,created.error);
  const requestId=created.request.id;
  await db.doc('campaigns/c').update({
    playerUids:['alice','bob','eve'],roles:{gm:'gm',alice:'player',bob:'player',eve:'player'}
  });
  const path='campaigns/c/itemRequests/'+requestId;
  await assertSucceeds(getDoc(doc(user('alice'),path)));
  await assertSucceeds(getDoc(doc(user('bob'),path)));
  await assertSucceeds(getDoc(doc(user('gm'),path)));
  await assertFails(getDoc(doc(user('eve'),path)));
  const requests=collection(user('alice'),'campaigns/c/itemRequests');
  const mine=await assertSucceeds(getDocs(query(requests,where('fromOwnerUid','==','alice'))));
  assert.equal(mine.size,1);
  const theirs=await assertSucceeds(getDocs(query(collection(user('bob'),'campaigns/c/itemRequests'),where('toOwnerUid','==','bob'))));
  assert.equal(theirs.size,1);
  await assertFails(getDocs(collection(user('eve'),'campaigns/c/itemRequests')));
  await assertFails(getDoc(doc(user('eve'),'campaigns/c/systems/itemEcosystem')));
  await assertSucceeds(getDoc(doc(user('gm'),'campaigns/c/systems/itemEcosystem')));
  await assertFails(updateDoc(doc(user('alice'),path),{status:'accepted'}));
  await assertFails(setDoc(doc(user('bob'),'campaigns/c/itemRequests/fake'),{id:'fake'}));
  const saved=(await db.doc(path).get()).data();
  assert.equal(saved.status,'pending');
  assert.equal(saved.note,'Private party handoff');
});

test('Phase 1.3: request receipt replay neither re-escrows items nor duplicates private trades',async()=>{
  const args=['c','a','b','sword','give',{quantity:1}];
  const [first,again]=await Promise.all([
    action('alice','createLiveItemRequest',args,'trade-exactly-once'),
    action('alice','createLiveItemRequest',args,'trade-exactly-once')
  ]);
  assert.equal(first.ok,true,first.error);
  assert.deepEqual(again,first);
  assert.equal((await db.collection('campaigns/c/itemRequests').get()).size,1);
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().inventory.reduce((n,item)=>n+item.qty,0),1);
  const conflict=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:2}],'trade-exactly-once');
  assert.equal(conflict.ok,false);
  assert.match(conflict.error||'',/Request ID has already been used/);
});

test('Phase 1.3: legacy GM migration protects private trades and preserves public shops',async()=>{
  const legacy={
    id:'item-request-historic',version:2,fromOwnerUid:'alice',toOwnerUid:'bob',
    fromCharacterId:'a',toCharacterId:'b',mode:'trade',item:{name:'Ancient Ring',qty:1},
    note:'Secret bargaining',status:'pending',createdAt:new Date().toISOString()
  };
  await db.doc('campaigns/c/systems/itemEcosystem').set({
    shops:[{id:'market',name:'Market',status:'open',stock:[]}],
    playerItemRequests:[legacy],directTrades:[]
  });
  assert.equal((await action('alice','syncCampaignItemPrivacy',['c','a'])).ok,false);
  const migrated=await action('gm','syncCampaignItemPrivacy',['c','a']);
  assert.equal(migrated.ok,true,migrated.error);
  assert.equal(migrated.migrated,1);
  assert.deepEqual((await db.doc('campaigns/c/systems/itemEcosystem').get()).data().playerItemRequests,[]);
  const row=(await db.doc('campaigns/c/itemRequests/item-request-historic').get()).data();
  assert.equal(row.note,'Secret bargaining');
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/systems/itemEcosystem')));
  await assertSucceeds(getDoc(doc(user('bob'),'campaigns/c/itemRequests/item-request-historic')));
  const shop=(await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/systems/itemPublic')))).data().shops[0];
  assert.equal(shop.name,'Market');
  const retry=await action('gm','syncCampaignItemPrivacy',['c','a']);
  assert.equal(retry.ok,true,retry.error);
  assert.equal(retry.migrated,0);
  assert.equal((await db.collection('campaigns/c/itemRequests').get()).size,1);
});

test('Phase 1.3: no browser may inject private details into public shop records',async()=>{
  await assertFails(setDoc(doc(user('alice'),'campaigns/c/systems/itemPublic'),{shops:[],playerItemRequests:[]}));
  await assertFails(setDoc(doc(user('gm'),'campaigns/c/systems/itemPublic'),{shops:[],playerItemRequests:[]}));
  await assertSucceeds(setDoc(doc(user('gm'),'campaigns/c/systems/itemPublic'),{
    version:'asteria-item-public-v1',shops:[],partyLoot:[],sharedStorages:[]
  }));
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c/systems/itemPublic'),{directTrades:[{note:'secret'}]}));
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/systems/itemPublic')));
});

test('Phase 1.3: failed trade acknowledgement cannot rewrite a settled request',async()=>{
  const created=await action('alice','createLiveItemRequest',['c','a','b','sword','give',{quantity:1}]);
  assert.equal(created.ok,true,created.error);
  const id=created.request.id;
  assert.equal((await action('bob','respondLiveItemRequest',['c','b',id,true,{}])).ok,true);
  const sent=await action('alice','acknowledgeLiveItemRequest',['c','a',id]);
  assert.equal(sent.ok,true,sent.error);
  const request=(await db.doc('campaigns/c/itemRequests/'+id).get()).data();
  assert.equal(request.senderNotice,'acknowledged');
  assert.equal((await action('bob','respondLiveItemRequest',['c','b',id,true,{}])).ok,false);
  assert.equal((await db.collection('campaigns/c/itemRequests').get()).size,1);
});

test('invitation preview discloses a summary; valid join grants membership',async()=>{
  const preview=await accessInvite(db,'eve','123456789012',false);assert.deepEqual(Object.keys(preview).sort(),['id','name','ucn']);
  assert.equal((await db.doc('campaigns/c').get()).data().playerUids.includes('eve'),false);
  await accessInvite(db,'eve','123456789012',true);
  await assertSucceeds(getDoc(doc(user('eve'),'campaigns/c')));
  assert.equal((await db.doc('campaigns/c').get()).data().roles.eve,'player');
});
test('server-owned staged membership is separate from legacy access',async()=>{
  const before=await db.doc('campaigns/c').get();
  const report=await stageLegacyMemberships(db,'gm','c',{write:true});
  assert.equal(report.staged,3);
  assert.equal((await db.doc('campaigns/c/members/gm').get()).data().role,'owner');
  assert.equal((await db.doc('campaigns/c/members/alice').get()).data().role,'player');
  assert.equal((await db.doc('campaigns/c/members/bob').get()).data().role,'player');
  assert.equal((await db.doc('campaigns/c').get()).data().membershipSchemaVersion,undefined);
  assert.deepEqual((await db.doc('campaigns/c').get()).data(),before.data());
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/members/alice')));
  await assertFails(getDoc(doc(user('gm'),'campaigns/c/members/alice')));
  await assertFails(setDoc(doc(user('alice'),'campaigns/c/members/alice'),{uid:'alice',role:'owner',status:'active'}));
  await assertFails(setDoc(doc(user('gm'),'campaigns/c/members/alice'),{uid:'alice',role:'owner',status:'active'}));
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/characters/a')));
  const again=await stageLegacyMemberships(db,'gm','c',{write:true});
  assert.equal(again.staged,0);
});
test('membership staging fails closed for nonowners and banned-user conflicts',async()=>{
  await assert.rejects(stageLegacyMemberships(db,'alice','c',{write:true}),/Only the campaign owner/);
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'banned',revision:5});
  const report=await stageLegacyMemberships(db,'gm','c');
  assert.equal(report.canStage,false);
  await assert.rejects(stageLegacyMemberships(db,'gm','c',{write:true}),/blocked/);
  assert.equal((await db.doc('campaigns/c/members/alice').get()).data().status,'banned');
  assert.equal((await db.doc('campaigns/c/members/gm').get()).exists,false);
});
test('server UCN allocation reserves both identities and preserves legacy join',async()=>{
  const code='000000000789';
  const identity=await createCampaignIdentity(db,'gm','Test Citadel',{
    nextCode:()=>code,nextId:()=> 'camp-server-allocated'
  });
  assert.deepEqual(identity,{id:'camp-server-allocated',name:'Test Citadel',ucn:code});
  assert.equal((await db.doc('campaignDirectory/'+code).get()).data().campaignId,identity.id);
  assert.equal((await db.doc('campaignInvites/'+code).get()).data().ownerUid,'gm');
  await assertSucceeds(getDoc(doc(user('gm'),'campaigns/camp-server-allocated')));
  await assertFails(getDoc(doc(user('alice'),'campaigns/camp-server-allocated')));
  await assertFails(getDoc(doc(user('alice'),'campaignDirectory/'+code)));
  await assertFails(setDoc(doc(user('alice'),'campaignDirectory/000000001234'),{campaignId:'fake'}));
  assert.deepEqual(await previewCampaignUCN(db,'alice',code),{...identity,joinMode:'legacy'});
  const joined=await accessInvite(db,'alice',code,true);
  assert.equal(joined.roles.alice,'player');
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/camp-server-allocated')));
});
test('campaign UCN cannot be modified by owner or players after allocation',async()=>{
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c'),{ucn:'000000000000'}));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c'),{ucn:'000000000001'}));
  await assertSucceeds(updateDoc(doc(user('gm'),'campaigns/c'),{name:'Safe rename'}));
  assert.equal((await db.doc('campaigns/c').get()).data().ucn,'123456789012');
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

test('private Account avatars are owner-only, size and MIME restricted',async()=>{
  const path='users/alice/profile/avatar';
  const alice=env.authenticatedContext('alice').storage();
  const bob=env.authenticatedContext('bob').storage();
  await assertFails(getBytes(ref(bob,path)));
  await assertFails(uploadBytes(ref(bob,path),new Uint8Array([1,2,3]),{contentType:'image/webp'}));
  await assertFails(uploadBytes(ref(alice,path),new Uint8Array([1]),{contentType:'image/svg+xml'}));
  await assertFails(uploadBytes(ref(alice,path),new Uint8Array(2*1024*1024+1),{contentType:'image/webp'}));
  await assertSucceeds(uploadBytes(ref(alice,path),new Uint8Array([1,2,3]),{contentType:'image/webp'}));
  await assertSucceeds(getBytes(ref(alice,path)));
  await assertFails(getBytes(ref(bob,path)));
  await assertFails(deleteObject(ref(bob,path)));
  await assertSucceeds(deleteObject(ref(alice,path)));
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
test('campaign artwork permissions allow GM upload and member read only',async()=>{
  const path='campaigns/c/artwork/cover.png';
  const gm=env.authenticatedContext('gm').storage();
  await assertSucceeds(uploadBytes(ref(gm,path),new Uint8Array([137,80,78,71]),{contentType:'image/png'}));
  await assertSucceeds(getBytes(ref(env.authenticatedContext('alice').storage(),path)));
  await assertFails(getBytes(ref(env.authenticatedContext('eve').storage(),path)));
  await assertFails(uploadBytes(ref(env.authenticatedContext('alice').storage(),'campaigns/c/artwork/player.png'),new Uint8Array([1]),{contentType:'image/png'}));
  await assertFails(uploadBytes(ref(gm,'campaigns/c/artwork/unsafe.svg'),new Uint8Array([1]),{contentType:'image/svg+xml'}));
  await assertSucceeds(deleteObject(ref(gm,path)));
});
test('GM campaign artwork updates cannot alter gameplay or owner fields',async()=>{
  const gm=user('gm');
  const image='https://example.org/campaign.webp';
  await assertSucceeds(updateDoc(doc(gm,'campaigns/c'),{image,imagePath:'campaigns/c/artwork/cover.webp'}));
  const newImage='https://example.org/other.webp';
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c'),{image:newImage,imagePath:'campaigns/c/artwork/player.webp'}));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c'),{ownerUid:'alice'}));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c'),{party:['hijacked']}));
});
test('owner can link a new private character atomically; cannot delete and reimport live state',async()=>{
  const own=user('alice');await setDoc(doc(own,'users/alice/characters/new'),sheet('new','alice'));
  const batch=writeBatch(own);batch.set(doc(own,'campaigns/c/characters/new'),sheet('new','alice'));
  batch.update(doc(own,'campaigns/c'),{lastLinkedCharacterId:'new',party:['a','b','new'],'players.alice.characterIds':['a','new'],'characters.new':{ownerUid:'alice'},'playerCharacterLinks.new':'alice'});
  await assertSucceeds(batch.commit());
  const deletion=writeBatch(own);deletion.delete(doc(own,'campaigns/c/characters/new'));await assertFails(deletion.commit());
});
test('browser link imports a newly forged second character for a player and a GM',async()=>{
  for(const uid of ['alice','gm']) {
    const own=user(uid),character={...sheet(`ty-${uid}`,uid),sharedCampaignId:'',linkedCampaignIds:[],name:'Ty',klass:'Artificer / Bloodhunter',campaign:'Unassigned'};
    await setDoc(doc(own,`users/${uid}/characters/${character.id}`),character);
    const linked=await browserCampaignLink(own,uid)('c',character);
    assert.ok(linked.party.includes(character.id));
    assert.equal((await getDoc(doc(own,`campaigns/c/characters/${character.id}`))).data().ownerUid,uid);
  }
});
test('browser link handles a Forge save still pending when campaign linking starts',async()=>{
  const own=user('alice'),character={...sheet('ty','alice'),sharedCampaignId:'',linkedCampaignIds:[],name:'Ty'};
  const linked=await browserCampaignLink(own,'alice')('c',character);
  assert.ok(linked.party.includes('ty'));
  assert.equal((await getDoc(doc(own,'users/alice/characters/ty'))).data().sharedCampaignId,'c');
});
test('browser link supports older campaigns without optional roster maps',async()=>{
  await db.doc('campaigns/c').update({players:FieldValue.delete(),characters:FieldValue.delete(),playerCharacterLinks:FieldValue.delete()});
  const own=user('alice'),character={...sheet('ty','alice'),sharedCampaignId:'',linkedCampaignIds:[],name:'Ty'};
  await setDoc(doc(own,'users/alice/characters/ty'),character);
  assert.ok((await browserCampaignLink(own,'alice')('c',character)).party.includes('ty'));
});
test('browser link is idempotent, preserves the first PC and refuses foreign ownership',async()=>{
  const own=user('alice'),link=browserCampaignLink(own,'alice');
  const before=(await db.doc('campaigns/c/characters/a').get()).data();
  const character={...sheet('ty','alice'),sharedCampaignId:'',linkedCampaignIds:[],name:'Ty'};
  await link('c',character);
  await db.doc('users/alice/characters/ty').update({hp:[4,10],inventory:[{id:'gift',qty:3}]});
  await link('c',character);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),before);
  assert.deepEqual((await db.doc('users/alice/characters/ty').get()).data().hp,[4,10]);
  assert.equal((await db.doc('users/alice/characters/ty').get()).data().inventory[0].id,'gift');
  assert.equal((await db.doc('campaigns/c').get()).data().party.filter(id=>id==='ty').length,1);
  await assert.rejects(browserCampaignLink(user('gm'),'gm')('c',character),/Only the character owner/);
  await assert.rejects(browserCampaignLink(user('eve'),'eve')('c',{...character,ownerUid:'eve'}));
});
test('unassigned dashboard subscription reads only its authenticated owner and rejects stale foreign mirrors',async()=>{
  await db.doc('users/alice/characters/ty').set({id:'ty',ownerUid:'alice',name:'Ty'});
  await db.doc('users/gm/characters/a').set({...sheet('a','gm')});
  const read=(uid,id)=>new Promise((resolve,reject)=>{
    let stop=()=>{};
    const timeout=setTimeout(()=>{stop();reject(new Error('Owner subscription timed out'));},5000);
    stop=browserOwnedSubscription(user(uid),uid)(id,value=>{stop();clearTimeout(timeout);resolve(value);},error=>{stop();clearTimeout(timeout);reject(error);});
  });
  assert.equal((await read('alice','ty')).name,'Ty');
  assert.equal(await read('bob','ty'),null);
  assert.equal(await read('gm','ty'),null);
  assert.equal(await read('gm','a'),null);
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

test('Phase 2.3: shop checkout rejects partial fulfilment and stale quotes without charging the player',async()=>{
  await db.doc('campaigns/c/systems/itemEcosystem').set({
    shops:[{id:'merchant',status:'open',buyModifier:1,sellModifier:1,currencyCopper:500,stock:[
      {qty:2,item:{name:'Health Potion',definitionId:'base:potion',material:'Glass',marketPrice:0.3,marketValue:0.1}}
    ]}]
  });
  const before=(await db.doc('campaigns/c/characters/a').get()).data();
  const failed=await action('alice','buyLiveShopItem',['c','a','merchant',0,3]);
  assert.equal(failed.ok,false);assert.match(failed.error,/stock/i);
  const stale=await action('alice','buyLiveShopItem',['c','a','merchant',0,1,{unitPriceCopper:35}]);
  assert.equal(stale.ok,false);assert.match(stale.error,/price changed/i);
  const variant=await action('alice','buyLiveShopItem',['c','a','merchant',0,1,{variantKey:'not-the-item'}]);
  assert.equal(variant.ok,false);assert.match(variant.error,/item changed/i);
  const unchanged=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.deepEqual(unchanged.coins,before.coins);
  assert.deepEqual(unchanged.inventory,before.inventory);
  assert.equal((await db.doc('campaigns/c/systems/itemEcosystem').get()).data().shops[0].stock[0].qty,2);
  const success=await action('alice','buyLiveShopItem',['c','a','merchant',0,2,{unitPriceCopper:30}]);
  assert.equal(success.ok,true,success.error);
  assert.equal(success.quantity,2);assert.equal(success.cost,60);
  const after=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(after.coins.copper,40);
  assert.equal((await db.doc('campaigns/c/systems/itemEcosystem').get()).data().shops[0].stock[0].qty,0);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().inventory,after.inventory);
  assert.equal((await db.doc('campaigns/c/systems/itemPublic').get()).data().shops[0].stock[0].qty,0);
  assert.equal((await action('alice','buyLiveShopItem',['c','a','merchant',0,1])).ok,false);
});

test('Phase 2.3: shop sale never combines the same named item with different quality or material',async()=>{
  const item={id:'sword',instanceId:'sword',name:'Sword',definitionId:'base:sword',
    qty:2,material:'Mithril',quality:'Superior',enchantments:[{name:'Winterbite',rank:2}],
    marketValue:0.1,marketPrice:0.5,storageId:'bag',storageSlot:0};
  for(const path of ['campaigns/c/characters/a','users/alice/characters/a'])
    await db.doc(path).update({inventory:[item]});
  await db.doc('campaigns/c/systems/itemEcosystem').set({shops:[{
    id:'smith',status:'open',buyModifier:1,sellModifier:1,currencyCopper:200,
    stock:[{qty:4,item:{name:'Sword',definitionId:'base:sword',material:'Iron',
      quality:'Common',marketValue:0.1,marketPrice:0.5}}]
  }]});
  const sold=await action('alice','sellLiveShopItem',['c','a','smith','sword',2,{unitPriceCopper:10}]);
  assert.equal(sold.ok,true,sold.error);assert.equal(sold.quantity,2);assert.equal(sold.value,20);
  const shop=(await db.doc('campaigns/c/systems/itemEcosystem').get()).data().shops[0];
  assert.equal(shop.stock.length,2);
  assert.equal(shop.stock[0].qty,4);
  assert.equal(shop.stock[1].qty,2);
  assert.equal(shop.stock[1].item.material,'Mithril');
  assert.equal(shop.stock[1].item.quality,'Superior');
  assert.deepEqual(shop.stock[1].item.enchantments,[{name:'Winterbite',rank:2}]);
  assert.equal(shop.stock[1].item.ownerUid,undefined);
  assert.equal(shop.stock[1].item.storageId,undefined);
  const shared=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(shared.inventory.length,0);
  assert.equal(Number(shared.coins.silver||0)*100+Number(shared.coins.copper||0),120);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().inventory,shared.inventory);
  assert.equal((await db.doc('campaigns/c/systems/itemPublic').get()).data().shops[0].stock.length,2);
  assert.equal((await action('alice','sellLiveShopItem',['c','a','smith','sword',1])).ok,false);
});

test('Phase 2.3: compatible shop variants stack while differing enchantments remain separate',async()=>{
  const sharedItem={id:'sword',instanceId:'sword',name:'Sword',definitionId:'base:sword',
    material:'Iron',quality:'Common',marketValue:0.1,marketPrice:0.5,qty:2,storageId:'bag',storageSlot:0};
  for(const path of ['campaigns/c/characters/a','users/alice/characters/a'])
    await db.doc(path).update({inventory:[sharedItem]});
  const stocked={...sharedItem,qty:1,location:'shop'};
  for(const key of ['instanceId','storageId','storageSlot'])delete stocked[key];
  await db.doc('campaigns/c/systems/itemEcosystem').set({shops:[{
    id:'smith',status:'open',buyModifier:1,sellModifier:1,currencyCopper:100,stock:[{qty:3,item:stocked}]
  }]});
  const one=await action('alice','sellLiveShopItem',['c','a','smith','sword',1]);
  assert.equal(one.ok,true,one.error);
  const stock=(await db.doc('campaigns/c/systems/itemEcosystem').get()).data().shops[0].stock;
  assert.equal(stock.length,1);
  assert.equal(stock[0].qty,4);
  const remaining=(await db.doc('campaigns/c/characters/a').get()).data().inventory[0];
  assert.equal(remaining.qty,1);
  assert.equal((await db.doc('users/alice/characters/a').get()).data().inventory[0].qty,1);
});

test('Phase 2.3: insufficient buyer funds, merchant funds and visitor restrictions roll back atomically',async()=>{
  const item={id:'sword',name:'Sword',definitionId:'base:sword',marketValue:1,marketPrice:2,qty:2,storageId:'bag',storageSlot:0};
  for(const path of ['campaigns/c/characters/a','users/alice/characters/a'])
    await db.doc(path).update({inventory:[item]});
  await db.doc('campaigns/c/systems/itemEcosystem').set({shops:[{
    id:'shop',status:'open',visitorCharacterIds:['b'],buyModifier:1,sellModifier:1,currencyCopper:5,
    stock:[{qty:1,item:{name:'Ring',marketValue:1,marketPrice:2}}]
  }]});
  const visitor=await action('alice','sellLiveShopItem',['c','a','shop','sword']);
  assert.equal(visitor.ok,false);assert.match(visitor.error,/visiting/i);
  const shopState=(await db.doc('campaigns/c/systems/itemEcosystem').get()).data();
  shopState.shops[0].visitorCharacterIds=[];
  await db.doc('campaigns/c/systems/itemEcosystem').set(shopState);
  const unaffordable=await action('alice','buyLiveShopItem',['c','a','shop',0,1]);
  assert.equal(unaffordable.ok,false);assert.match(unaffordable.error,/currency/i);
  const poorMerchant=await action('alice','sellLiveShopItem',['c','a','shop','sword',1]);
  assert.equal(poorMerchant.ok,false);assert.match(poorMerchant.error,/afford/i);
  const shop=(await db.doc('campaigns/c/systems/itemEcosystem').get()).data().shops[0];
  assert.equal(shop.currencyCopper,5);
  assert.equal(shop.stock[0].qty,1);
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().inventory[0].qty,2);
  assert.equal((await db.doc('users/alice/characters/a').get()).data().inventory[0].qty,2);
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

const reviewQuest=(patch={})=>({id:'rescue',title:'Rescue villagers',status:'Active',requiresGMApproval:true,objectives:[{id:'villagers',text:'Rescue villagers',target:3}],progress:{},reward:{xp:2000,currency:{key:'gold',amount:2},items:[{name:'Quest Potion',qty:1}]},...patch});
const seedQuest=async quest=>{
 await db.doc('campaigns/c/characters/a').update({quests:[quest]});
 await db.doc('users/alice/characters/a').update({quests:[quest]});
};
const liveSheet=async()=>(await db.doc('campaigns/c/characters/a').get()).data();
// A 2,000 XP reward takes the level-one fixture to level two with 0 XP remaining.
const assertQuestXP=character=>{assert.equal(character.level,2);assert.equal(character.xp,0);assert.equal(character.cp,5);assert.equal(character.tp,5);};
test('quest submission gives no rewards; concurrent GM approvals award once to the real owner and notify listeners',async()=>{
 await seedQuest(reviewQuest());
 assert.equal((await action('alice','updateCharacterQuest',['c','a','rescue','Completed'])).ok,false);
 assert.equal((await action('alice','updateCharacterQuest',['c','a','rescue','Awaiting Review'])).ok,false);
 assert.equal((await action('bob','updateQuestProgress',['c','a','rescue',{objectiveId:'villagers',current:3}])).ok,false);
 await assertFails(updateDoc(doc(user('alice'),'campaigns/c/characters/a'),{quests:[reviewQuest({status:'Completed'})]}));
 const progress=await action('alice','updateQuestProgress',['c','a','rescue',{objectiveId:'villagers',current:3}]);assert.equal(progress.ok,true,progress.error);
 const submit=await action('alice','updateCharacterQuest',['c','a','rescue','Awaiting Review']);assert.equal(submit.ok,true,submit.error);
 const submitted=await liveSheet();assert.equal(submitted.xp,0);assert.equal(submitted.coins.gold,undefined);assert.equal(submitted.inventory.length,1);
 const observed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{unsubscribe();reject(new Error('Quest snapshot timed out'));},10000);const unsubscribe=onSnapshot(doc(user('alice'),'campaigns/c/characters/a'),snapshot=>{if(snapshot.data()?.quests?.[0]?.status==='Completed'){clearTimeout(timer);unsubscribe();resolve(snapshot.data());}},reject);});
 const results=await Promise.all([action('gm','reviewCharacterQuest',['c','a','rescue','Completed','Village saved']),action('gm','reviewCharacterQuest',['c','a','rescue','Completed','Village saved'])]);
 assert.ok(results.every(result=>result.ok),JSON.stringify(results));assert.equal(results.filter(result=>result.rewardApplied).length,1);
 const live=await observed;const own=(await db.doc('users/alice/characters/a').get()).data();
 assertQuestXP(live);assert.equal(live.coins.gold,2);assert.equal(live.inventory.filter(item=>item.name==='Quest Potion').reduce((n,item)=>n+item.qty,0),1);
 assert.equal(live.quests[0].rewardStatus,'claimed');assert.equal(live.ownerUid,'alice');assert.deepEqual(own.quests,live.quests);assert.equal(own.xp,live.xp);
 assert.equal((await db.doc('users/gm/characters/a').get()).exists,false);
 const events=await db.collection('campaigns/c/events').where('type','==','quest-updated').get();assert.ok(events.size>0);assert.equal(events.docs[0].data().targetOwnerUid,'alice');
});
test('GM review requires an actual character link and never unlocks other player actions',async()=>{
 await seedQuest(reviewQuest({status:'Awaiting Review',progress:{villagers:3}}));
 for(const uid of ['alice','bob','eve'])assert.equal((await action(uid,'reviewCharacterQuest',['c','a','rescue','Completed'])).ok,false);
 assert.equal((await action('gm','updateCampaignCharacterResource',['c','a','hp',1])).ok,false);
 await db.doc('campaigns/c').update({'playerCharacterLinks.a':FieldValue.delete(),'characters.a':FieldValue.delete(),'players.alice.characterIds':[]});
 assert.equal((await action('gm','reviewCharacterQuest',['c','a','rescue','Completed'])).ok,false);assert.equal((await liveSheet()).xp,0);
 await db.doc('campaigns/c').update({'playerCharacterLinks.a':'bob','characters.a.ownerUid':'alice'});
 assert.equal((await action('gm','reviewCharacterQuest',['c','a','rescue','Completed'])).ok,false);
});
test('invalid progress, reward injection, closed edits and inactive-session player edits are rejected',async()=>{
 await seedQuest(reviewQuest());
 for(const patch of [{objectiveId:'villagers',current:4},{objectiveId:'villagers',current:1.5},{objectiveId:'villagers',current:3,reward:{xp:99999}},{tracked:true,status:'Completed'}])assert.equal((await action('alice','updateQuestProgress',['c','a','rescue',patch])).ok,false);
 await db.doc('campaigns/c/liveSession/current').update({status:'paused'});
 assert.equal((await action('alice','updateQuestProgress',['c','a','rescue',{tracked:true}])).ok,false);
 const fail=await action('gm','reviewCharacterQuest',['c','a','rescue','Failed','The second dawn has passed']);assert.equal(fail.ok,true,fail.error);assert.equal((await liveSheet()).xp,0);
 const reopen=await action('gm','reviewCharacterQuest',['c','a','rescue','Active','Try a different route']);assert.equal(reopen.ok,true,reopen.error);
});
test('legacy self completion still awards once, and tracking alone cannot claim an old reward',async()=>{
 await seedQuest(reviewQuest({requiresGMApproval:false,status:'Completed',objectives:[]}));
 const tracked=await action('alice','updateQuestProgress',['c','a','rescue',{tracked:true}]);assert.equal(tracked.ok,true,tracked.error);assert.equal((await liveSheet()).xp,0);
 const first=await action('alice','updateCharacterQuest',['c','a','rescue','Completed']);assert.equal(first.ok,true,first.error);assert.equal(first.rewardApplied,true);
 const second=await action('alice','updateCharacterQuest',['c','a','rescue','Completed']);assert.equal(second.ok,true,second.error);assert.equal(second.rewardApplied,false);assertQuestXP(await liveSheet());
});
test('full inventory aborts all quest rewards and approval; retry succeeds after making room',async()=>{
 await seedQuest(reviewQuest({status:'Awaiting Review',progress:{villagers:3}}));
 await db.doc('campaigns/c/characters/a').update({storages:[{id:'bag',name:'Bag',rows:1,cols:1,maxSlots:1}]});
 const failed=await action('gm','reviewCharacterQuest',['c','a','rescue','Completed']);assert.equal(failed.ok,false);assert.match(failed.error,/full|space/i);
 const unchanged=await liveSheet();assert.equal(unchanged.xp,0);assert.equal(unchanged.coins.gold,undefined);assert.equal(unchanged.quests[0].status,'Awaiting Review');assert.equal(unchanged.quests[0].rewardStatus,undefined);
 await db.doc('campaigns/c/characters/a').update({inventory:[]});
 const retry=await action('gm','reviewCharacterQuest',['c','a','rescue','Completed']);assert.equal(retry.ok,true,retry.error);assertQuestXP(await liveSheet());
});
test('GM review rejects a mismatched private owner and does not create deleted private characters',async()=>{
 await seedQuest(reviewQuest({status:'Awaiting Review',progress:{villagers:3}}));
 await db.doc('users/alice/characters/a').update({ownerUid:'bob'});
 assert.equal((await action('gm','reviewCharacterQuest',['c','a','rescue','Completed'])).ok,false);
 await db.doc('users/alice/characters/a').delete();
 const result=await action('gm','reviewCharacterQuest',['c','a','rescue','Completed']);assert.equal(result.ok,true,result.error);
 assert.equal((await db.doc('users/alice/characters/a').get()).exists,false);assert.equal((await db.doc('users/gm/characters/a').get()).exists,false);
});

test('class talent purchases normalize Forge classes, charge once under concurrency, and mirror Mana Well',async()=>{
  await db.doc('campaigns/c/characters/a').update({klass:{title:'Spellblade'},tp:50,mp:[50,100]});
  const args=['c','a',{id:'spellblade:mana-well',expectedRank:0,cost:0,maxRank:100}];
  const results=await Promise.all([action('alice','purchaseTalentRank',args,'talent-once'),action('alice','purchaseTalentRank',args,'talent-once')]);
  results.forEach(r=>assert.equal(r.ok,true,r.error));
  const saved=(await db.doc('campaigns/c/characters/a').get()).data(),mirror=(await db.doc('users/alice/characters/a').get()).data();
  assert.equal(saved.tp,47);assert.equal(saved.talents['Mana Well'].rank,1);assert.deepEqual(saved.mp,[250,300]);assert.deepEqual(mirror.mp,saved.mp);
  assert.equal((await action('alice','purchaseTalentRank',args,'stale-rank')).ok,false);
  await action('alice','refreshCharacterTalents',['c','a']);assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data().mp,[250,300]);
});
test('different simultaneous purchase requests cannot buy an unintended second rank',async()=>{
  await db.doc('campaigns/c/characters/a').update({classInfo:{classes:[{slug:'spellblade'}]},tp:50});
  const args=['c','a',{id:'spellblade:arcane-edge',expectedRank:0}];
  const results=await Promise.all([action('alice','purchaseTalentRank',args,'first-click'),action('alice','purchaseTalentRank',args,'second-click')]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal((await db.doc('campaigns/c/characters/a').get()).data().tp,47);
});
test('active talents debit trusted rank costs atomically and respect ownership, session and cooldown',async()=>{
  const ref=db.doc('campaigns/c/characters/a');
  await ref.update({klass:'Bloodhunter',talents:{'Blood Shield':{rank:2}},mp:[100,100],hp:[7,100],bp:[0,20]});
  await db.doc('campaigns/c/systems/encounter').set({status:'active',combatId:'fight',round:1});
  const args=['c','a',{id:'bloodhunter:blood-shield',expectedRank:2},{costs:{mp:0,hp:0}}];
  assert.equal((await action('alice','useCharacterTalent',args)).ok,false);assert.deepEqual((await ref.get()).data().mp,[100,100]);
  await ref.update({hp:[100,100]});assert.equal((await action('bob','useCharacterTalent',args)).ok,false);
  const used=await action('alice','useCharacterTalent',args,'shield-once');assert.equal(used.ok,true,used.error);
  assert.equal((await action('alice','useCharacterTalent',args,'shield-once')).ok,true);
  const saved=(await ref.get()).data();assert.deepEqual(saved.mp,[75,100]);assert.deepEqual(saved.hp,[92,100]);assert.deepEqual(saved.bp,[10,20]);assert.equal(saved.acModifiers[0].value,2);
  assert.equal((await action('alice','useCharacterTalent',args)).ok,false);
  await db.doc('campaigns/c/liveSession/current').update({status:'paused'});assert.equal((await action('alice','purchaseTalentRank',['c','a',{id:'bloodhunter:blood-control'}])).ok,false);
});
test('Sacred Aegis affects a linked ally and their private sheet without adding AC to the caster',async()=>{
  await db.doc('campaigns/c/characters/a').update({klass:'Cleric',mp:[100,100],talents:{'Sacred Aegis':{rank:1}}});
  await db.doc('campaigns/c/systems/encounter').set({status:'active',combatId:'fight',round:1});
  const used=await action('alice','useCharacterTalent',['c','a',{id:'cleric:sacred-aegis'},{targetId:'b'}]);assert.equal(used.ok,true,used.error);
  const caster=(await db.doc('campaigns/c/characters/a').get()).data(),target=(await db.doc('campaigns/c/characters/b').get()).data();
  assert.deepEqual(caster.mp,[80,100]);assert.equal(caster.acModifiers.length,0);assert.equal(target.acModifiers[0].value,2);
  assert.equal((await db.doc('users/bob/characters/b').get()).data().acModifiers[0].value,2);
  await db.doc('campaigns/c/systems/encounter').update({round:4});await action('bob','refreshCharacterTalents',['c','b']);assert.equal((await db.doc('campaigns/c/characters/b').get()).data().acModifiers.length,0);
});
test('unwritten and foreign-class talents cannot consume TP, and spell weaving requires a known spell',async()=>{
  const ref=db.doc('campaigns/c/characters/a');await ref.update({klass:'Fighter',tp:50});
  assert.equal((await action('alice','purchaseTalentRank',['c','a',{id:'fighter:guarded-stance'}])).ok,false);
  assert.equal((await action('alice','purchaseTalentRank',['c','a',{id:'cleric:mana-well'}])).ok,false);assert.equal((await ref.get()).data().tp,50);
  await ref.update({klass:'Spellblade',talents:{'Spell Weaving':{rank:1}},mp:[100,100]});
  assert.equal((await action('alice','useCharacterTalent',['c','a',{id:'spellblade:spell-weaving'},{spell:'Unknown'}])).ok,false);
  const result=await action('alice','useCharacterTalent',['c','a',{id:'spellblade:spell-weaving'},{spell:'Spark'}]);assert.equal(result.ok,true,result.error);assert.deepEqual((await ref.get()).data().mp,[87,100]);
});
test('targeted talent effects cannot overwrite a mismatched or deleted private character',async()=>{
  const ref=db.doc('campaigns/c/characters/a');await ref.update({klass:'Cleric',mp:[100,100],talents:{'Sacred Aegis':{rank:1}}});
  await db.doc('users/bob/characters/b').update({ownerUid:'eve'});
  const args=['c','a',{id:'cleric:sacred-aegis'},{targetId:'b'}];
  assert.equal((await action('alice','useCharacterTalent',args)).ok,false);assert.deepEqual((await ref.get()).data().mp,[100,100]);
  await db.doc('users/bob/characters/b').delete();assert.equal((await action('alice','useCharacterTalent',args)).ok,false);assert.equal((await db.doc('users/bob/characters/b').get()).exists,false);
});

test('core fields cannot be forged through direct player Firestore writes',async()=>{
  for(const patch of [{resources:{zeal:[999,999]}},{resourceDefinitions:{hp:{minimum:99}}},{conditions:[]},{restState:{request:{status:'approved'}}},{coreRevision:999}]) await assertFails(updateDoc(doc(user('alice'),'campaigns/c/characters/a'),patch));
});
test('GM conditions apply mechanics to the owner mirror while protecting private profile data',async()=>{
  await db.doc('users/alice/characters/a').update({name:'Private name',journal:['Private journal']});
  const added=await action('gm','manageCharacterCondition',['c','a',{template:'concussion'}]);assert.equal(added.ok,true,added.error);
  const live=await liveSheet(),owner=(await db.doc('users/alice/characters/a').get()).data();
  assert.deepEqual(live.mp,[8,8]);assert.deepEqual(owner.mp,[8,8]);assert.equal(owner.name,'Private name');assert.deepEqual(owner.journal,['Private journal']);
  assert.equal((await db.doc('users/gm/characters/a').get()).exists,false);
  assert.equal((await action('alice','manageCharacterCondition',['c','a',{action:'remove',id:added.id}])).ok,false);
  assert.equal((await action('alice','manageCharacterCondition',['c','a',{name:'Free bonus'}])).ok,false);
  assert.equal((await action('gm','manageCharacterCondition',['c','a',{action:'remove',id:added.id}])).ok,true);
  assert.deepEqual((await liveSheet()).mp,[8,10]);
});
test('allowed player condition removal and refresh are persistent without repeat character writes',async()=>{
  const added=await action('gm','manageCharacterCondition',['c','a',{name:'Blessing',allowPlayerRemoval:true,effects:[{target:'mp.maximum',operation:'ADD',value:10}]}]);assert.equal(added.ok,true,added.error);
  assert.equal((await action('alice','manageCharacterCondition',['c','a',{action:'remove',id:added.id}])).ok,true);
  await action('alice','refreshCharacterSystems',['c','a']);const before=await liveSheet();
  assert.equal((await action('alice','refreshCharacterSystems',['c','a'])).ok,true);const after=await liveSheet();
  assert.equal(after.coreRevision,before.coreRevision);assert.equal(after.updatedAt.toMillis(),before.updatedAt.toMillis());
});
test('custom resources use canonical spell costs and concurrent stale activations spend once',async()=>{
  const configured=await action('gm','configureCharacterResource',['c','a',{id:'focus',name:'Focus',minimum:0,maximum:6,recovery:{long:{mode:'full'}}}]);assert.equal(configured.ok,true,configured.error);
  await action('alice','updateCampaignCharacterResource',['c','a','focus',6]);await db.doc('campaigns/c/characters/a').update({spells:[{name:'Spark',costs:{focus:4}}]});
  const revision=(await liveSheet()).coreRevision,args=['c','a',{name:'Spark',expectedCoreRevision:revision},{focus:0}];
  const result=await Promise.all([action('alice','castCharacterSpell',args),action('alice','castCharacterSpell',args)]);assert.equal(result.filter(row=>row.ok).length,1);
  assert.deepEqual((await liveSheet()).resources.focus,[2,6]);assert.equal((await action('alice','castCharacterSpell',['c','a',{name:'Spark'},{}])).ok,false);
});
test('Long Rest requests recover nothing until one GM approval expires conditions and resets uses',async()=>{
  await db.doc('campaigns/c/characters/a').update({hp:[1,10],mp:[1,10],sp:[1,10],talentUsage:{rest:{reset:'long-rest',count:2},session:{reset:'session',count:1}}});
  await action('gm','manageCharacterCondition',['c','a',{name:'Weakened',duration:{unit:'long-rest'},effects:[{target:'mp.maximum',operation:'MULTIPLY',value:.5}]}]);
  const requested=await action('alice','requestCharacterRest',['c','a','long',{expectedSequence:0}]);assert.equal(requested.ok,true,requested.error);
  assert.deepEqual((await liveSheet()).hp,[1,10]);assert.equal((await action('alice','requestCharacterRest',['c','a','long',{expectedSequence:0}])).request.id,requested.request.id);
  assert.equal((await action('alice','reviewCharacterRest',['c','a',{id:requested.request.id,status:'approved'}])).ok,false);
  const reviews=await Promise.all([action('gm','reviewCharacterRest',['c','a',{id:requested.request.id,status:'approved'}]),action('gm','reviewCharacterRest',['c','a',{id:requested.request.id,status:'approved'}])]);reviews.forEach(row=>assert.equal(row.ok,true,row.error));
  const live=await liveSheet();assert.deepEqual(live.hp,[6,10]);assert.deepEqual(live.mp,[6,10]);assert.deepEqual(live.sp,[10,10]);assert.equal(live.conditions[0].expired,true);assert.equal(live.talentUsage.rest.count,0);assert.equal(live.talentUsage.session.count,1);
  assert.equal((await db.collection('campaigns/c/events').where('type','==','long-rest-review').get()).size,1);
});
test('denied rest cannot later be approved or restore resources',async()=>{
  await db.doc('campaigns/c/characters/a').update({hp:[1,10]});
  const request=(await action('alice','requestCharacterRest',['c','a','long',{expectedSequence:0}])).request;
  assert.equal((await action('gm','reviewCharacterRest',['c','a',{id:request.id,status:'denied',note:'Unsafe camp'}])).ok,true);
  const again=await action('gm','reviewCharacterRest',['c','a',{id:request.id,status:'approved'}]);assert.equal(again.request.status,'denied');assert.deepEqual((await liveSheet()).hp,[1,10]);
});
test('Short Rest sequence rejects rapid duplicate requests and pending Long Rest blocks recovery',async()=>{
  await db.doc('campaigns/c/characters/a').update({klass:'Bloodhunter',sp:[0,100],bp:[20,20]});
  const args=['c','a','short',{expectedSequence:0}],results=await Promise.all([action('alice','requestCharacterRest',args),action('alice','requestCharacterRest',args)]);assert.equal(results.filter(row=>row.ok).length,1);
  assert.deepEqual((await liveSheet()).sp,[35,100]);assert.deepEqual((await liveSheet()).bp,[15,20]);
  await action('alice','requestCharacterRest',['c','a','long',{expectedSequence:1}]);assert.equal((await action('alice','requestCharacterRest',['c','a','short',{expectedSequence:2}])).ok,false);
});
test('core commands reject outsiders, other players and unlinked GM access',async()=>{
  for(const uid of ['eve','bob']) assert.equal((await action(uid,'manageCharacterCondition',['c','a',{name:'Bad'}])).ok,false);
  await db.doc('campaigns/c').update({'playerCharacterLinks.a':FieldValue.delete(),'characters.a':FieldValue.delete(),'players.alice.characterIds':[]});
  assert.equal((await action('gm','configureCharacterResource',['c','a',{id:'focus',maximum:10}])).ok,false);
});
test('resource updates preserve unrelated private fields and reject stale revisions',async()=>{
  await db.doc('users/alice/characters/a').update({name:'Owner private name',appearance:{portrait:'private'},journal:['private']});
  const result=await action('alice','updateCampaignCharacterResource',['c','a','mp',-2,{expectedCoreRevision:0}]);assert.equal(result.ok,true,result.error);
  const privateData=(await db.doc('users/alice/characters/a').get()).data();assert.equal(privateData.name,'Owner private name');assert.deepEqual(privateData.journal,['private']);
  assert.equal((await action('alice','updateCampaignCharacterResource',['c','a','mp',-2,{expectedCoreRevision:0}])).ok,false);assert.deepEqual((await liveSheet()).mp,[8,10]);
});
test('resource rule replacement removes old resets instead of recursively merging them back',async()=>{
  await action('gm','configureCharacterResource',['c','a',{id:'focus',maximum:10,reset:{'combat-start':0}}]);
  const result=await action('gm','configureCharacterResource',['c','a',{id:'focus',maximum:10,reset:{}}]);assert.equal(result.ok,true,result.error);
  assert.deepEqual((await liveSheet()).resourceDefinitions.focus.reset,{});assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().resourceDefinitions.focus.reset,{});
});
test('canonical restoration respects Soul Damage and never trusts injected spell restoration',async()=>{
  await db.doc('campaigns/c/characters/a').update({hp:[1,10],specialDamage:{soul:4},spells:[{name:'Spark',cost:'3 MP',restoreResources:{hp:10}}]});
  const result=await action('alice','castCharacterSpell',['c','a',{name:'Spark',restoreResources:{mp:999}},{}]);assert.equal(result.ok,true,result.error);assert.deepEqual((await liveSheet()).hp,[6,10]);assert.deepEqual((await liveSheet()).mp,[7,10]);
});

test('Phase 2.1: container renames are owner-only, mirror instantly, and reject duplicates',async()=>{
  const created=await action('alice','updateCharacterInventory',['c','a',{type:'create-storage',name:'Pouch',rows:2,cols:2}]);
  assert.equal(created.ok,true,created.error);
  const storages=(await db.doc('campaigns/c/characters/a').get()).data().storages;
  const pouch=storages.find(value=>value.name==='Pouch');
  assert.ok(pouch);
  const args=['c','a',{type:'rename-storage',storageId:'bag',name:'Equipment Bag'}];
  const updated=await action('alice','updateCharacterInventory',args);
  assert.equal(updated.ok,true,updated.error);
  assert.equal(updated.name,'Equipment Bag');
  const shared=(await db.doc('campaigns/c/characters/a').get()).data();
  const owned=(await db.doc('users/alice/characters/a').get()).data();
  assert.equal(shared.storages.find(value=>value.id==='bag').name,'Equipment Bag');
  assert.deepEqual(owned.storages,shared.storages);
  assert.equal((await action('alice','updateCharacterInventory',['c','a',{type:'rename-storage',storageId:pouch.id,name:'equipment bag'}])).ok,false);
  assert.equal((await action('bob','updateCharacterInventory',args)).ok,false);
  assert.equal((await action('gm','updateCharacterInventory',args)).ok,false);
  assert.equal((await action('alice','updateCharacterInventory',['c','a',{type:'rename-storage',storageId:'bag',name:' '}])).ok,false);
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().storages[0].name,'Equipment Bag');
});

test('Phase 2.1: splitting stacks preserves every item property and replay cannot duplicate them',async()=>{
  const source=(await db.doc('campaigns/c/characters/a').get()).data();
  source.inventory[0].material='Mithril';
  source.inventory[0].quality='Superior';
  source.inventory[0].enchantments=[{name:'Winterbite',rank:2}];
  source.inventory[0].stackable=true;
  await Promise.all([
    db.doc('campaigns/c/characters/a').update({inventory:source.inventory}),
    db.doc('users/alice/characters/a').update({inventory:source.inventory})
  ]);
  const args=['c','a',{type:'split-stack',itemId:'sword',quantity:1,expectedQuantity:2,storageId:'bag'}];
  const first=await action('alice','updateCharacterInventory',args,'split-once');
  assert.equal(first.ok,true,first.error);
  const again=await action('alice','updateCharacterInventory',args,'split-once');
  assert.deepEqual(again,first);
  const shared=(await db.doc('campaigns/c/characters/a').get()).data();
  const privateCopy=(await db.doc('users/alice/characters/a').get()).data();
  assert.deepEqual(privateCopy.inventory,shared.inventory);
  assert.equal(shared.inventory.length,2);
  assert.equal(shared.inventory.reduce((sum,item)=>sum+item.qty,0),2);
  const split=shared.inventory.find(value=>value.instanceId===first.itemId);
  assert.ok(split);
  assert.notEqual(split.instanceId,'sword');
  assert.equal(split.material,'Mithril');
  assert.equal(split.quality,'Superior');
  assert.deepEqual(split.enchantments,[{name:'Winterbite',rank:2}]);
  assert.notEqual(split.storageSlot,shared.inventory.find(value=>value.instanceId==='sword').storageSlot);
  assert.equal((await action('alice','updateCharacterInventory',args,'stale-split')).ok,false);
  assert.equal((await action('bob','updateCharacterInventory',['c','a',{type:'split-stack',itemId:'sword',quantity:1,storageId:'bag'}])).ok,false);
});

test('Phase 2.1: full storage rejects splits and auto-moves without losing items',async()=>{
  await Promise.all(['campaigns/c/characters/a','users/alice/characters/a'].map(path=>
    db.doc(path).update({storages:[{id:'bag',name:'Bag',rows:1,cols:1,maxSlots:1}]})));
  const rejected=await action('alice','updateCharacterInventory',['c','a',{type:'split-stack',itemId:'sword',quantity:1,storageId:'bag'}]);
  assert.equal(rejected.ok,false);
  assert.match(rejected.error,/full/i);
  const legacy=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(legacy.inventory.length,1);
  assert.equal(legacy.inventory[0].qty,2);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().inventory,legacy.inventory);
});

test('Phase 2.1: occupied slots atomically swap items within and across containers',async()=>{
  for(const path of ['campaigns/c/characters/a','users/alice/characters/a']){
    const before=(await db.doc(path).get()).data();
    before.inventory.push({id:'gem',instanceId:'gem',name:'Moon Gem',qty:1,storageId:'bag',storageSlot:1});
    await db.doc(path).update({inventory:before.inventory});
  }
  const swap=await action('alice','updateCharacterInventory',['c','a',{type:'move-storage',itemId:'sword',storageId:'bag',storageSlot:1}]);
  assert.equal(swap.ok,true,swap.error);
  let sheet=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(sheet.inventory.find(value=>value.id==='sword').storageSlot,1);
  assert.equal(sheet.inventory.find(value=>value.id==='gem').storageSlot,0);
  const created=await action('alice','updateCharacterInventory',['c','a',{type:'create-storage',name:'Small Pouch',rows:1,cols:1}]);
  assert.equal(created.ok,true,created.error);
  sheet=(await db.doc('campaigns/c/characters/a').get()).data();
  const small=sheet.storages.find(value=>value.name==='Small Pouch');
  assert.ok(small);
  assert.equal((await action('alice','updateCharacterInventory',['c','a',{type:'move-storage',itemId:'gem',storageId:small.id}])).ok,true);
  const blocked=await action('alice','updateCharacterInventory',['c','a',{type:'move-storage',itemId:'sword',storageId:small.id}]);
  assert.equal(blocked.ok,false);
  assert.match(blocked.error,/full/i);
  const across=await action('alice','updateCharacterInventory',['c','a',{type:'move-storage',itemId:'sword',storageId:small.id,storageSlot:0}]);
  assert.equal(across.ok,true,across.error);
  sheet=(await db.doc('campaigns/c/characters/a').get()).data();
  assert.equal(sheet.inventory.find(value=>value.id==='sword').storageId,small.id);
  assert.equal(sheet.inventory.find(value=>value.id==='gem').storageId,'bag');
  assert.equal(sheet.inventory.find(value=>value.id==='gem').storageSlot,1);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data().inventory,sheet.inventory);
  const invalid=await action('alice','updateCharacterInventory',['c','a',{type:'move-storage',itemId:'sword',storageId:small.id,storageSlot:99}]);
  assert.equal(invalid.ok,false);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data().inventory,sheet.inventory);
});

test('GM inventory management updates the owner mirror and never grants ownership',async()=>{
  const result=await action('gm','updateCharacterInventory',['c','a',{type:'set-quantity',itemId:'sword',quantity:5,expectedQuantity:2}]);assert.equal(result.ok,true,result.error);
  const shared=(await db.doc('campaigns/c/characters/a').get()).data(),owned=(await db.doc('users/alice/characters/a').get()).data();
  assert.equal(shared.ownerUid,'alice');assert.equal(owned.inventory[0].qty,5);assert.equal(shared.inventory[0].qty,5);
  assert.equal((await db.doc('users/gm/characters/a').get()).exists,false);
  const stale=await action('gm','updateCharacterInventory',['c','a',{type:'set-quantity',itemId:'sword',quantity:6,expectedQuantity:2}]);assert.equal(stale.ok,false);
  const player=await action('alice','updateCharacterInventory',['c','a',{type:'set-quantity',itemId:'sword',quantity:6,expectedQuantity:5}]);assert.equal(player.ok,false);
  const other=await action('bob','updateCharacterInventory',['c','a',{type:'set-quantity',itemId:'sword',quantity:6,expectedQuantity:5}]);assert.equal(other.ok,false);
  await db.doc('campaigns/c').update({playerCharacterLinks:{},characters:{},players:{}});
  assert.equal((await action('gm','updateCharacterInventory',['c','a',{type:'set-quantity',itemId:'sword',quantity:0,expectedQuantity:5}])).ok,false);
});
test('GM notices are private and read state is independent of reward acknowledgement',async()=>{
  const args=['c','a',{title:'A rumour',message:'Ask at the docks'}];
  assert.equal((await action('gm','sendCharacterNotification',args,'notice')).ok,true);
  assert.equal((await action('gm','sendCharacterNotification',args,'notice')).ok,true);
  assert.equal((await db.collection('campaigns/c/events').get()).size,1);
  const event='notice-notice';
  await assertSucceeds(getDoc(doc(user('alice'),`campaigns/c/events/${event}`)));
  await assertFails(getDoc(doc(user('bob'),`campaigns/c/events/${event}`)));
  assert.equal((await action('alice','sendCharacterNotification',args)).ok,false);
  await db.doc('campaigns/c/liveSession/current').update({status:'ended'});
  assert.equal((await action('alice','markNotificationRead',['c','a','event',event,true])).ok,true);
  assert.equal((await db.doc(`campaigns/c/events/${event}`).get()).data().acknowledged,false);
  assert.equal((await db.doc('users/alice/characters/a').get()).data().notificationRead[`event:${event}`],true);
  assert.equal((await action('alice','markNotificationRead',['c','a','event',event,false])).ok,true);
  assert.equal((await action('gm','markNotificationRead',['c','a','event',event,true])).ok,false);
});
test('published information is readable while drafts and publication controls stay GM-only',async()=>{
  await db.doc('campaigns/c/systems/gmWorkspace').set({world:{news:[{id:'draft',title:'Secret'}]}});
  const ref=doc(user('gm'),'campaigns/c/systems/party-workspace');
  await assertSucceeds(setDoc(ref,{information:{news:{id:'published',title:'Public announcement',published:true}},updatedBy:'gm'}));
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/systems/party-workspace')));
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/systems/gmWorkspace')));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/systems/party-workspace'),{information:{forged:{published:true}}}));
  await assertSucceeds(updateDoc(ref,{information:{}}));
  assert.deepEqual((await getDoc(doc(user('alice'),'campaigns/c/systems/party-workspace'))).data().information,{});
});

test('direct player AP spend is transactional, deduplicated, ownership checked and live to the GM',async()=>{
  const command=async(uid,actorId,operation,extra={},requestId=crypto.randomUUID())=>{
    const encounter=(await db.doc('campaigns/c/systems/encounter').get()).data()||{};
    return action(uid,'combatCommand',['c',actorId,{operation,revision:encounter.combat?.revision||0,...extra}],requestId);
  };
  await command('gm','encounter','save',{encounter:{combatants:[{id:'player-a',characterId:'a',initiative:20,initiativeSet:true},{id:'player-b',characterId:'b',initiative:10,initiativeSet:true}]}});
  assert.equal((await command('gm','encounter','start')).ok,true);
  assert.equal((await command('bob','player-a','spend-ap',{ap:1})).ok,false);
  const encounter=(await db.doc('campaigns/c/systems/encounter').get()).data();
  const args=['c','player-a',{operation:'spend-ap',optionId:'basic:dash',revision:encounter.combat.revision}];
  const results=await Promise.all([action('alice','combatCommand',args,'ap-once'),action('alice','combatCommand',args,'ap-once')]);
  for(const result of results)assert.equal(result.ok,true,result.error);
  const publicEncounter=(await assertSucceeds(getDoc(doc(user('gm'),'campaigns/c/systems/encounter')))).data();
  assert.equal(publicEncounter.combat.participants['player-a'].ap,1);assert.equal(publicEncounter.combat.participants['player-a'].apSpends.length,1);assert.equal(publicEncounter.combat.pending,null);
  assert.equal((await command('alice','player-a','spend-ap',{ap:2})).ok,false);
  assert.equal((await command('alice','player-a','end-turn')).ok,true);
});

test('GM encounter recovery persists custom creatures after a character is unlinked without changing either sheet',async()=>{
  const command=async(uid,operation,extra={})=>{
    const encounter=(await db.doc('campaigns/c/systems/encounter').get()).data()||{};
    return action(uid,'combatCommand',['c','encounter',{operation,revision:encounter.combat?.revision||0,...extra}]);
  };
  const players=[{id:'player-a',characterId:'a'},{id:'player-b',characterId:'b'}];
  assert.equal((await command('gm','save',{encounter:{combatants:players}})).ok,true);
  await db.doc('campaigns/c').update({'playerCharacterLinks.b':FieldValue.delete(),'characters.b':FieldValue.delete(),'players.bob.characterIds':[]});
  const beforeShared=(await db.doc('campaigns/c/characters/b').get()).data(),beforePrivate=(await db.doc('users/bob/characters/b').get()).data();
  await db.doc('campaigns/c/systems/encounter').update({'combat.participants.player-b':{ap:2,turns:1}});
  await db.doc('campaigns/c/systems/gmWorkspace').update({combatState:{preparations:{'player-b':{secret:'gone'}},apSpends:{'player-b':[{ap:1}]}}});
  const creature={id:'bandit',name:'Bob',kind:'enemy',type:'Custom NPC',hp:[90,90],sp:[75,75],mp:[30,30],xpReward:1200,ac:14,initiative:8,initiativeSet:true};
  assert.equal((await command('alice','save',{encounter:{combatants:[...players,creature]}})).ok,false);
  const result=await command('gm','save',{encounter:{combatants:[...players,creature]}});assert.equal(result.ok,true,result.error);
  const saved=(await assertSucceeds(getDoc(doc(user('gm'),'campaigns/c/systems/encounter')))).data();
  assert.deepEqual(saved.combatants.map(row=>row.id),['player-a','bandit']);assert.deepEqual(saved.enemies[0].hp,[90,90]);assert.equal(saved.enemies[0].xpReward,1200);
  assert.equal(saved.combat.participants['player-b'],undefined);
  const workspace=(await db.doc('campaigns/c/systems/gmWorkspace').get()).data();
  assert.equal(workspace.privateNotes,'GM only');assert.equal(workspace.combatState.preparations['player-b'],undefined);assert.equal(workspace.combatState.apSpends['player-b'],undefined);
  assert.deepEqual((await db.doc('campaigns/c/characters/b').get()).data(),beforeShared);assert.deepEqual((await db.doc('users/bob/characters/b').get()).data(),beforePrivate);
  assert.equal((await command('gm','save',{encounter:{combatants:[...saved.combatants,{id:'forged',characterId:'foreign'}]}})).ok,false);
  assert.equal((await command('gm','start')).ok,true);
});

test('Mako with a legacy embedded ID is added using its real campaign document ID without changing ownership',async()=>{
  await db.doc('campaigns/c/characters/b').update({id:'legacy-private-id',sourceCharacterId:'b',name:'Mako',hp:[27,200],sp:[190,190],mp:[34,200]});
  const records=await new Promise(resolve=>{
    let stop=()=>{};
    stop=browserCampaignSubscription(user('gm'),'gm')('c',value=>{if(value.b?.name==='Mako'){stop();resolve(value);}});
  });
  assert.equal(records.b.id,'b');assert.equal(records.b.sourceCharacterId,'b');
  const roster=encounterPlayerRoster('c',{...campaign,id:'c'},records,[{id:'player-a',characterId:'a',kind:'player',initiative:17,initiativeSet:true}],globalThis.AsteriaCharacterAccess);
  assert.equal(roster.added.length,1);assert.equal(roster.added[0].name,'Mako');assert.equal(roster.added[0].characterId,'b');
  const result=await action('gm','combatCommand',['c','encounter',{operation:'save',revision:0,encounter:{combatants:roster.combatants}}]);assert.equal(result.ok,true,result.error);
  const saved=(await db.doc('campaigns/c/systems/encounter').get()).data();assert.equal(saved.combatants.filter(row=>row.characterId==='b').length,1);assert.equal(saved.combatants.find(row=>row.characterId==='b').name,'Mako');
  assert.equal(encounterPlayerRoster('c',{...campaign,id:'c'},records,saved.combatants,globalThis.AsteriaCharacterAccess).added.length,0);
  const shared=(await db.doc('campaigns/c/characters/b').get()).data();assert.equal(shared.id,'legacy-private-id');assert.equal(shared.ownerUid,'bob');assert.deepEqual(shared.hp,[27,200]);assert.deepEqual(shared.sp,[190,190]);assert.deepEqual(shared.mp,[34,200]);
  assert.equal((await db.doc('users/bob/characters/b').get()).data().ownerUid,'bob');
});

test('owner repairs conflicting campaign indexes without modifying either character sheet',async()=>{
  const sharedBefore=(await db.doc('campaigns/c/characters/a').get()).data();
  const privateBefore=(await db.doc('users/alice/characters/a').get()).data();
  await db.doc('campaigns/c').update({'playerCharacterLinks.a':'bob','characters.a.ownerUid':'bob','players.alice.characterIds':[],'players.bob.characterIds':['a','b']});
  assert.equal(globalThis.AsteriaCharacterAccess.isLinked({id:'c',...(await db.doc('campaigns/c').get()).data()},sharedBefore),false);
  const args=['c','a'];
  const results=await Promise.all([action('alice','repairCampaignCharacterLink',args,'repair-once'),action('alice','repairCampaignCharacterLink',args,'repair-once')]);
  assert.ok(results.every(result=>result.ok));
  const after=(await db.doc('campaigns/c').get()).data();
  assert.equal(after.playerCharacterLinks.a,'alice');assert.equal(after.characters.a.ownerUid,'alice');
  assert.deepEqual(after.players.alice.characterIds,['a']);assert.deepEqual(after.players.bob.characterIds,['b']);
  assert.deepEqual(after.roles,campaign.roles);assert.deepEqual(after.playerUids,campaign.playerUids);
  assert.equal(globalThis.AsteriaCharacterAccess.isLinked({id:'c',...after},sharedBefore),true);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),sharedBefore);
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data(),privateBefore);
});

test('link repair rejects other players, GMs, outsiders and forged source ownership',async()=>{
  await db.doc('campaigns/c').update({'playerCharacterLinks.a':'bob'});
  for(const uid of ['bob','gm','eve'])await assert.rejects(action(uid,'repairCampaignCharacterLink',['c','a']));
  await db.doc('users/alice/characters/a').delete();
  await assert.rejects(action('alice','repairCampaignCharacterLink',['c','a']),/saved character/);
  await db.doc('users/alice/characters/a').set({...sheet('a','alice'),ownerUid:'bob'});
  await assert.rejects(action('alice','repairCampaignCharacterLink',['c','a']),/saved character/);
  assert.equal((await db.doc('campaigns/c').get()).data().playerCharacterLinks.a,'bob');
});

test('link repair requires an existing campaign backlink and uses the canonical source ID',async()=>{
  await db.doc('campaigns/c/characters/a').update({sourceCharacterId:'private-a'});
  await db.doc('users/alice/characters/private-a').set({...sheet('a','alice'),id:'private-a',sourceCharacterId:'private-a',sharedCampaignId:'other',linkedCampaignIds:[]});
  await assert.rejects(action('alice','repairCampaignCharacterLink',['c','a']),/confirm this campaign/);
  await db.doc('users/alice/characters/private-a').update({linkedCampaignIds:['other','c']});
  assert.equal((await action('alice','repairCampaignCharacterLink',['c','a'])).sourceCharacterId,'private-a');
  await db.doc('campaigns/c/characters/a').update({sharedCampaignId:'other'});
  await assert.rejects(action('alice','repairCampaignCharacterLink',['c','a']),/another campaign/);
});


test('appearance preferences are private per Firebase user and cannot be read or changed by another account',async()=>{
  const a=doc(user('alice'),'users/alice/settings/appearance');
  const other=doc(user('bob'),'users/alice/settings/appearance');
  const anonymous=doc(env.unauthenticatedContext().firestore(),'users/alice/settings/appearance');
  const theme={value:{theme:'ranger',accent:'#2f9b55'},revision:1,updatedAt:Timestamp.now()};
  await assertSucceeds(setDoc(a,{theme}));
  const saved=await assertSucceeds(getDoc(a));
  assert.equal(saved.data().theme.revision,1);
  await assertFails(getDoc(other));
  await assertFails(setDoc(other,{theme:{value:{theme:'rogue'},revision:2}}));
  await assertFails(getDoc(anonymous));
  await assertFails(setDoc(anonymous,{theme}));
  // Per-section merge leaves the other cosmetic preference untouched.
  await assertSucceeds(setDoc(a,{typography:{value:{heading:'cinzel',reading:'inter',size:105},revision:1}}, {merge:true}));
  const both=(await assertSucceeds(getDoc(a))).data();
  assert.equal(both.theme.value.theme,'ranger');
  assert.equal(both.typography.value.reading,'inter');
});

 
// Phase 1.3: the proposed v2 collections must remain locked down until their
// dedicated Firestore rules and server-only operations are implemented.
test('future campaign connection collections are denied to browser clients by default',async()=>{
  const alice=user('alice'),gm=user('gm'),eve=user('eve');
  const paths=[
    'campaignDirectory/123456789012',
    'campaigns/c/members/alice',
    'campaigns/c/invitations/invite1',
    'campaigns/c/characterLinks/link1',
    'campaigns/c/auditEvents/audit1'
  ];
  for(const path of paths) {
    await db.doc(path).set({campaignId:'c',uid:'alice',status:'active',recipientEmailNormalized:'private@example.test'});
    for(const client of [alice,gm,eve]){
      await assertFails(getDoc(doc(client,path)));
      await assertFails(setDoc(doc(client,path),{status:'active'}));
    }
  }
});

test('legacy owner can still write private account projections; v2 must restrict these',async()=>{
  const path='users/alice/campaignRefs/c';
  await assertSucceeds(setDoc(doc(user('alice'),path),{role:'owner',status:'active'}));
  await assertFails(getDoc(doc(user('bob'),path)));
  // This permissive v1 owner-write rule is a known migration requirement, not v2 authorization.
});

test('legacy campaign invite behavior remains unchanged while v2 is dormant',async()=>{
  const first=await accessInvite(db,'eve','123456789012',false);
  assert.deepEqual(Object.keys(first).sort(),['id','name','ucn']);
  assert.equal((await db.doc('campaigns/c').get()).data().membershipSchemaVersion,undefined);
  await accessInvite(db,'eve','123456789012',true);
  assert.equal((await db.doc('campaigns/c').get()).data().roles.eve,'player');
  await assertSucceeds(getDoc(doc(user('eve'),'campaigns/c')));
});

test('v2 permissions deny revoked members despite stale legacy role arrays',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active',revision:1});
  await db.doc('campaigns/c/members/bob').set({uid:'bob',campaignId:'c',role:'player',status:'suspended',revision:1});
  await assertSucceeds(getDoc(doc(user('gm'),'campaigns/c')));
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c')));
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/characters/a')));
  await assertFails(getDoc(doc(user('bob'),'campaigns/c')));
  await assertFails(getDoc(doc(user('bob'),'campaigns/c/characters/b')));
  await assertFails(getDoc(doc(user('bob'),'campaigns/c/systems/itemEcosystem')));
  await assertFails(getDoc(doc(user('bob'),'campaigns/c/liveSession/current')));
  await assertFails(setDoc(doc(user('bob'),'campaigns/c/sessions/s/presence/bob'),{state:'online'}));
  await db.doc('campaigns/c/partyChat/old').set({ownerUid:'bob',text:'Old message'});
  await assertFails(deleteDoc(doc(user('bob'),'campaigns/c/partyChat/old')));
  await assertFails(getBytes(ref(env.authenticatedContext('bob').storage(),'campaigns/c/artwork/cover.png')));
  await assertSucceeds(getDoc(doc(user('bob'),'users/bob/characters/b')));
  assert.equal((await db.doc('campaigns/c').get()).data().playerUids.includes('bob'),true);
  assert.equal((await action('bob','updateCampaignCharacterResource',['c','b','hp',-1])).ok,false);
  await assert.rejects(accessInvite(db,'eve','123456789012',true),/join request/);
});

test('v2 Co-GM access requires an active canonical role; legacy gmUids cannot restore access',async()=>{
  await db.doc('campaigns/c').update({
    membershipSchemaVersion:2,
    gmUids:['gm','co'],
    roles:{gm:'gm',co:'gm',alice:'player',bob:'player'}
  });
  await db.doc('campaigns/c/members/co').set({uid:'co',campaignId:'c',role:'co-gm',status:'active',revision:1});
  await assertSucceeds(getDoc(doc(user('co'),'campaigns/c/systems/gmWorkspace')));
  await db.doc('campaigns/c/members/co').update({status:'banned',revision:2});
  await assertFails(getDoc(doc(user('co'),'campaigns/c/systems/gmWorkspace')));
  await assertFails(getDoc(doc(user('co'),'campaigns/c')));
  await assertFails(updateDoc(doc(user('co'),'campaigns/c'),{image:'https://example.org/co.webp',imagePath:'campaigns/c/artwork/co.webp'}));
});

test('v2 member role, status and schema version cannot be forged by browser writes',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active',revision:1});
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/members/alice'),{role:'co-gm'}));
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c/members/alice'),{status:'banned'}));
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c'),{membershipSchemaVersion:1}));
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c'),{'roles.alice':'gm'}));
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c'),{membershipSchemaVersion:1}));
  await assertSucceeds(updateDoc(doc(user('gm'),'campaigns/c'),{name:'Still editable'}));
});

test('v1-to-v2 migration preview and cutover preserve character records and old campaign identity',async()=>{
  const oldCampaign=(await db.doc('campaigns/c').get()).data();
  const oldCharacter=(await db.doc('campaigns/c/characters/a').get()).data();
  const prepare=await stageLegacyMemberships(db,'gm','c',{write:true});
  assert.equal(prepare.staged,3);
  const preview=await prepareCampaignCutover(db,'gm','c');
  assert.equal(preview.ready,true);
  await assert.rejects(prepareCampaignCutover(db,'alice','c',{activate:true}),/owner/);
  const result=await prepareCampaignCutover(db,'gm','c',{activate:true});
  assert.equal(result.activated,true);
  assert.equal((await db.doc('campaigns/c').get()).data().membershipSchemaVersion,2);
  const projection=(await db.doc('campaignMemberProjections/alice/campaigns/c').get()).data();
  assert.equal(projection.status,'active');
  await assertSucceeds(getDoc(doc(user('alice'),'campaignMemberProjections/alice/campaigns/c')));
  await assertFails(getDoc(doc(user('bob'),'campaignMemberProjections/alice/campaigns/c')));
  await assertFails(updateDoc(doc(user('alice'),'campaignMemberProjections/alice/campaigns/c'),{role:'owner'}));
  assert.equal((await db.doc('campaigns/c').get()).data().ucn,oldCampaign.ucn);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),oldCharacter);
});

test('cutover refuses missing, mismatched, or extra canonical membership records',async()=>{
  await stageLegacyMemberships(db,'gm','c',{write:true});
  await db.doc('campaigns/c/members/alice').update({status:'banned',revision:3});
  const preview=await prepareCampaignCutover(db,'gm','c');
  assert.equal(preview.ready,false);
  await assert.rejects(prepareCampaignCutover(db,'gm','c',{activate:true}),/unresolved conflicts/);
  assert.equal((await db.doc('campaigns/c').get()).data().membershipSchemaVersion,undefined);
  await db.doc('campaigns/c/members/alice').update({status:'active'});
  await db.doc('campaigns/c/members/eve').set({uid:'eve',campaignId:'c',status:'active',role:'player',revision:1});
  const extra=await prepareCampaignCutover(db,'gm','c');
  assert.equal(extra.ready,false);
  assert.ok(extra.issues.some(row=>row.code==='unmatched-staged-member'));
});

test('v2 applicant can create one pending request without receiving any campaign access',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  const preview=await campaignJoinRequest(db,'eve',{action:'status',campaignId:'c',ucn:'123456789012'});
  assert.equal(preview.status,'none');
  const request=await campaignJoinRequest(db,'eve',{action:'submit',campaignId:'c',ucn:'123456789012'});
  assert.equal(request.status,'pending');
  assert.equal(request.alreadyExists,false);
  const repeated=await campaignJoinRequest(db,'eve',{action:'submit',campaignId:'c',ucn:'123456789012'});
  assert.equal(repeated.alreadyExists,true);
  assert.equal((await db.collection('campaigns/c/joinRequests').get()).size,1);
  assert.equal((await db.doc('campaigns/c').get()).data().roles.eve,undefined);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  await assertFails(getDoc(doc(user('eve'),'campaigns/c')));
  await assertFails(getDoc(doc(user('eve'),'campaigns/c/characters/a')));
  await assertSucceeds(getDoc(doc(user('eve'),'campaigns/c/joinRequests/eve')));
  await assertSucceeds(getDoc(doc(user('gm'),'campaigns/c/joinRequests/eve')));
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/joinRequests/eve')));
  await assertFails(setDoc(doc(user('eve'),'campaigns/c/joinRequests/eve'),{status:'approved'}));
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c/joinRequests/eve'),{status:'approved'}));
  await assertFails(getDocs(collection(user('eve'),'campaigns/c/joinRequests')));
});

test('v2 request character preferences require real account ownership and never link sheets',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  await assert.rejects(campaignJoinRequest(db,'eve',{
    action:'submit',campaignId:'c',ucn:'123456789012',characterId:'a'
  }),/not owned/);
  await db.doc('users/eve/characters/z').set({id:'z',ownerUid:'eve',xp:3000,inventory:[{id:'spellbook'}]});
  const saved=await campaignJoinRequest(db,'eve',{
    action:'submit',campaignId:'c',ucn:'123456789012',characterId:'z'
  });
  assert.equal(saved.requestedCharacterId,'z');
  assert.equal((await db.doc('users/eve/characters/z').get()).data().xp,3000);
  assert.equal((await db.doc('campaigns/c/characters/z').get()).exists,false);
  await assertFails(getDoc(doc(user('eve'),'campaigns/c')));
});

test('legacy, owner, current member and banned applicants never get new requests',async()=>{
  await assert.rejects(campaignJoinRequest(db,'eve',{
    action:'submit',campaignId:'c',ucn:'123456789012'
  }),/unavailable/);
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  assert.equal((await campaignJoinRequest(db,'gm',{action:'submit',campaignId:'c',ucn:'123456789012'})).status,'member');
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active'});
  assert.equal((await campaignJoinRequest(db,'alice',{action:'submit',campaignId:'c',ucn:'123456789012'})).status,'member');
  await db.doc('campaigns/c/members/alice').update({status:'banned'});
  assert.equal((await campaignJoinRequest(db,'alice',{action:'submit',campaignId:'c',ucn:'123456789012'})).status,'blocked');
  assert.equal((await db.collection('campaigns/c/joinRequests').get()).size,0);
});

test('staged member requests cannot leak through unapproved browsers or alter legacy campaign rules',async()=>{
  await db.doc('campaigns/c/joinRequests/eve').set({
    uid:'eve',campaignId:'c',status:'pending',requestedAt:new Date(),requestedCharacterId:null
  });
  // No v1 clients can read unactivated join requests.
  await assertFails(getDoc(doc(user('eve'),'campaigns/c/joinRequests/eve')));
  await assertFails(getDoc(doc(user('gm'),'campaigns/c/joinRequests/eve')));
  await assertFails(setDoc(doc(user('alice'),'campaigns/c/joinRequests/alice'),{uid:'alice',status:'pending'}));
});

test('GM closed campaign rejects new join requests while retaining pending records',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,joinPolicy:{joinRequestsOpen:false}});
  const args={action:'submit',campaignId:'c',ucn:'123456789012'};
  assert.equal((await campaignJoinRequest(db,'eve',{...args,action:'status'})).status,'closed');
  await assert.rejects(campaignJoinRequest(db,'eve',args),/not accepting/);
  assert.equal((await db.doc('campaigns/c/joinRequests/eve').get()).exists,false);
  await db.doc('campaigns/c/joinRequests/alice').set({uid:'alice',campaignId:'c',status:'pending'});
  assert.equal((await campaignJoinRequest(db,'alice',{...args,action:'status'})).status,'pending');
});

test('GM approval grants active v2 membership while protecting character data and capacity',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,playerLimit:1});
  const before=(await db.doc('campaigns/c/characters/a').get()).data();
  await campaignJoinRequest(db,'eve',{action:'submit',campaignId:'c',ucn:'123456789012'});
  await assert.rejects(listPendingCampaignJoinRequests(db,'bob','c'),/authorised GM/);
  const queue=await listPendingCampaignJoinRequests(db,'gm','c');
  assert.equal(queue.requests.length,1);
  assert.equal(queue.requests[0].uid,'eve');
  await assertFails(getDoc(doc(user('eve'),'campaigns/c')));
  const approved=await reviewCampaignJoinRequest(db,'gm',{campaignId:'c',requestUid:'eve',decision:'approve',expectedRevision:1});
  assert.equal(approved.status,'approved');
  await assertSucceeds(getDoc(doc(user('eve'),'campaigns/c')));
  await assertSucceeds(getDoc(doc(user('eve'),'campaignMemberProjections/eve/campaigns/c')));
  assert.equal((await db.doc('campaigns/c/joinRequests/eve').get()).data().status,'approved');
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),before);
  assert.equal((await reviewCampaignJoinRequest(db,'gm',{campaignId:'c',requestUid:'eve',decision:'approve',expectedRevision:1})).alreadyReviewed,true);
});

test('GM decline and full campaign capacity never grant membership',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,playerLimit:1});
  await campaignJoinRequest(db,'eve',{action:'submit',campaignId:'c',ucn:'123456789012'});
  const rejected=await reviewCampaignJoinRequest(db,'gm',{campaignId:'c',requestUid:'eve',decision:'decline',expectedRevision:1});
  assert.equal(rejected.status,'declined');
  await assertFails(getDoc(doc(user('eve'),'campaigns/c')));
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  await campaignJoinRequest(db,'other',{action:'submit',campaignId:'c',ucn:'123456789012'});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active'});
  await assert.rejects(reviewCampaignJoinRequest(db,'gm',{campaignId:'c',requestUid:'other',decision:'approve',expectedRevision:1}),/capacity/);
  assert.equal((await db.doc('campaigns/c/joinRequests/other').get()).data().status,'pending');
  assert.equal((await db.doc('campaigns/c/members/other').get()).exists,false);
});

test('auto approval requires owner opt-in and server enablement',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,playerLimit:2});
  await assert.rejects(setCampaignJoinApprovalMode(db,'alice','c','manual'),/owner/);
  await assert.rejects(setCampaignJoinApprovalMode(db,'gm','c','automatic'),/not enabled/);
  await setCampaignJoinApprovalMode(db,'gm','c','automatic',{autoAvailable:true});
  const pending=await campaignJoinRequest(db,'eve',{action:'submit',campaignId:'c',ucn:'123456789012'});
  assert.equal(pending.status,'pending');
  const approved=await campaignJoinRequest(db,'other',{action:'submit',campaignId:'c',ucn:'123456789012'}, {autoApproveEnabled:true});
  assert.equal(approved.status,'approved');
  await assertSucceeds(getDoc(doc(user('other'),'campaigns/c')));
  assert.equal((await db.doc('campaigns/c/joinReviewHistory/other').get()).data().mode,'automatic');
});

test('v2 GM roster lists canonical active, inactive and pending without granting access',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active',revision:1});
  await db.doc('campaigns/c/members/bob').set({uid:'bob',campaignId:'c',role:'player',status:'suspended',revision:2});
  await db.doc('campaigns/c/joinRequests/eve').set({uid:'eve',campaignId:'c',status:'pending',revision:1,requestedCharacterId:null,requestedAt:new Date()});
  const before=(await db.doc('campaigns/c/characters/a').get()).data();
  const roster=await listCampaignPlayerRoster(db,'gm','c');
  assert.equal(roster.source,'canonical');
  assert.equal(roster.summary.activePlayers,1);
  assert.equal(roster.inactive.find(x=>x.uid==='bob').status,'suspended');
  assert.equal(roster.pending.find(x=>x.uid==='eve').status,'pending');
  assert.equal(roster.active.find(x=>x.uid==='alice').characters[0].id,'a');
  await assert.rejects(listCampaignPlayerRoster(db,'bob','c'),/active campaign GM/);
  await assert.rejects(listCampaignPlayerRoster(db,'eve','c'),/active campaign GM/);
  await assertFails(getDoc(doc(user('eve'),'campaigns/c')));
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),before);
});

test('v1 GM roster preserves legacy access and shows no v2 request data',async()=>{
  const roster=await listCampaignPlayerRoster(db,'gm','c');
  assert.equal(roster.source,'legacy');
  assert.equal(roster.summary.activePlayers,2);
  assert.equal(roster.pending.length,0);
  await assert.rejects(listCampaignPlayerRoster(db,'eve','c'),/campaign GM/);
});

test('v2 GM suspend revokes Firestore access, actions and account projection while retaining owned sheets',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,membershipRevision:1});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active',revision:1});
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({campaignId:'c',role:'player',status:'active'});
  const sheetBefore=(await db.doc('users/alice/characters/a').get()).data();
  const campaignSheetBefore=(await db.doc('campaigns/c/characters/a').get()).data();
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c')));
  const response=await moderateCampaignMember(db,'gm',{
    campaignId:'c',memberUid:'alice',action:'suspend',expectedRevision:1,expectedStatus:'active'
  });
  assert.equal(response.status,'suspended');
  await assertFails(getDoc(doc(user('alice'),'campaigns/c')));
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/characters/a')));
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/liveSession/current')));
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/systems/itemEcosystem')));
  await assertFails(setDoc(doc(user('alice'),'campaigns/c/sessions/s/presence/alice'),{state:'online'}));
  assert.equal((await action('alice','updateCampaignCharacterResource',['c','a','hp',-1])).ok,false);
  assert.equal((await db.doc('campaignMemberProjections/alice/campaigns/c').get()).data().status,'suspended');
  assert.deepEqual((await db.doc('users/alice/characters/a').get()).data(),sheetBefore);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),campaignSheetBefore);
  await assertSucceeds(getDoc(doc(user('alice'),'users/alice/characters/a')));
  assert.equal((await moderateCampaignMember(db,'gm',{
    campaignId:'c',memberUid:'alice',action:'suspend',expectedRevision:1,expectedStatus:'active'
  })).alreadyApplied,true);
});

test('v2 GM remove and ban do not delete character data and owner can restore',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,membershipRevision:1});
  await db.doc('campaigns/c/members/bob').set({uid:'bob',campaignId:'c',role:'player',status:'active',revision:1});
  await db.doc('campaignMemberProjections/bob/campaigns/c').set({campaignId:'c',role:'player',status:'active'});
  const before=(await db.doc('users/bob/characters/b').get()).data();
  await moderateCampaignMember(db,'gm',{campaignId:'c',memberUid:'bob',action:'remove',expectedRevision:1,expectedStatus:'active',reason:'Left the campaign'});
  await assertFails(getDoc(doc(user('bob'),'campaigns/c')));
  await moderateCampaignMember(db,'gm',{campaignId:'c',memberUid:'bob',action:'ban',expectedRevision:2,expectedStatus:'removed',reason:'Severe rule breach'});
  assert.equal((await db.doc('campaigns/c/members/bob').get()).data().status,'banned');
  assert.equal((await db.doc('campaigns/c/memberModerationEvents/bob-3').get()).data().action,'ban');
  await moderateCampaignMember(db,'gm',{campaignId:'c',memberUid:'bob',action:'restore',expectedRevision:3,expectedStatus:'banned'});
  assert.equal((await db.doc('campaigns/c/members/bob').get()).data().status,'active');
  await assertSucceeds(getDoc(doc(user('bob'),'campaigns/c')));
  assert.deepEqual((await db.doc('users/bob/characters/b').get()).data(),before);
});

test('moderation protects owner, stale roles and capacity, and cannot be forged through client writes',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,playerLimit:1});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active',revision:1});
  await db.doc('campaigns/c/members/bob').set({uid:'bob',campaignId:'c',role:'player',status:'suspended',revision:1});
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({campaignId:'c',role:'player',status:'active'});
  await db.doc('campaignMemberProjections/bob/campaigns/c').set({campaignId:'c',role:'player',status:'suspended'});
  await assert.rejects(moderateCampaignMember(db,'bob',{campaignId:'c',memberUid:'alice',action:'suspend',expectedRevision:1,expectedStatus:'active'}),/authorised GM/);
  await assert.rejects(moderateCampaignMember(db,'gm',{campaignId:'c',memberUid:'gm',action:'suspend',expectedRevision:1,expectedStatus:'active'}),/protected/);
  await assert.rejects(moderateCampaignMember(db,'gm',{campaignId:'c',memberUid:'bob',action:'restore',expectedRevision:1,expectedStatus:'suspended'}),/capacity/);
  await assertFails(updateDoc(doc(user('gm'),'campaigns/c/members/bob'),{status:'active'}));
  await assertFails(updateDoc(doc(user('bob'),'campaignMemberProjections/bob/campaigns/c'),{status:'active'}));
});

test('owner promotes and demotes Co-GM with immediate Firestore role and projection changes',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,membershipRevision:1,playerLimit:3});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'player',status:'active',revision:1});
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({campaignId:'c',role:'player',status:'active'});
  const before=(await db.doc('campaigns/c/characters/a').get()).data();
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/systems/gmWorkspace')));
  const promoted=await changeCampaignMemberRole(db,'gm',{
    campaignId:'c',memberUid:'alice',newRole:'co-gm',expectedRole:'player',expectedRevision:1,expectedStatus:'active'
  });
  assert.equal(promoted.role,'co-gm');
  await assertSucceeds(getDoc(doc(user('alice'),'campaigns/c/systems/gmWorkspace')));
  assert.equal((await db.doc('campaignMemberProjections/alice/campaigns/c').get()).data().role,'co-gm');
  await assert.rejects(changeCampaignMemberRole(db,'bob',{
    campaignId:'c',memberUid:'alice',newRole:'player',expectedRole:'co-gm',expectedRevision:2,expectedStatus:'active'
  }),/campaign owner/);
  const demoted=await changeCampaignMemberRole(db,'gm',{
    campaignId:'c',memberUid:'alice',newRole:'player',expectedRole:'co-gm',expectedRevision:2,expectedStatus:'active'
  });
  assert.equal(demoted.role,'player');
  await assertFails(getDoc(doc(user('alice'),'campaigns/c/systems/gmWorkspace')));
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),before);
  await assertFails(updateDoc(doc(user('alice'),'campaigns/c/members/alice'),{role:'co-gm'}));
  await assertFails(updateDoc(doc(user('alice'),'campaignMemberProjections/alice/campaigns/c'),{role:'co-gm'}));
});

test('delegated Co-GM capabilities remain owner-only and changes appear in activity history',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,membershipRevision:1});
  await db.doc('campaigns/c/members/bob').set({
    uid:'bob',campaignId:'c',role:'co-gm',status:'active',revision:1,capabilityOverrides:{}
  });
  await db.doc('campaignMemberProjections/bob/campaigns/c').set({campaignId:'c',role:'co-gm',status:'active'});
  await assert.rejects(setCampaignCoGmPermission(db,'alice',{
    campaignId:'c',memberUid:'bob',capability:'review-join-requests',
    enabled:true,expectedRevision:1,expectedRole:'co-gm',expectedStatus:'active'
  }),/campaign owner/);
  const enabled=await setCampaignCoGmPermission(db,'gm',{
    campaignId:'c',memberUid:'bob',capability:'review-join-requests',
    enabled:true,expectedRevision:1,expectedRole:'co-gm',expectedStatus:'active'
  });
  assert.equal(enabled.enabled,true);
  assert.equal((await db.doc('campaigns/c/members/bob').get()).data().capabilityOverrides['review-join-requests'],true);
  await assert.rejects(setCampaignCoGmPermission(db,'gm',{
    campaignId:'c',memberUid:'bob',capability:'moderate-members',
    enabled:true,expectedRevision:1,expectedRole:'co-gm',expectedStatus:'active'
  }),/Refresh/);
  const history=await listCampaignMembershipActivity(db,'bob','c');
  assert.equal(history.events.some(e=>e.type==='permission'&&e.uid==='bob'),true);
  await assert.rejects(listCampaignMembershipActivity(db,'alice','c'),/active campaign GM/);
});

test('demoting Co-GM fails when campaign Player capacity has been reached',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,playerLimit:1});
  await db.doc('campaigns/c/members/alice').set({uid:'alice',campaignId:'c',role:'co-gm',status:'active',revision:1});
  await db.doc('campaigns/c/members/bob').set({uid:'bob',campaignId:'c',role:'player',status:'active',revision:1});
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({campaignId:'c',role:'co-gm',status:'active'});
  await assert.rejects(changeCampaignMemberRole(db,'gm',{
    campaignId:'c',memberUid:'alice',newRole:'player',
    expectedRole:'co-gm',expectedRevision:1,expectedStatus:'active'
  }),/capacity/);
  assert.equal((await db.doc('campaigns/c/members/alice').get()).data().role,'co-gm');
});

test('Phase 5.2: canonical GM review imports a verified sheet without client link writes or private leaks',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,
    capacity:{maxActiveCharacters:5,maxCharactersPerPlayer:2}});
  await db.doc('campaigns/c/members/alice').set({
    uid:'alice',campaignId:'c',role:'player',status:'active',revision:1
  });
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({
    campaignId:'c',role:'player',status:'active'
  });
  await db.doc('users/alice/characters/forge').set({
    id:'forge',sourceCharacterId:'forge',ownerUid:'alice',
    name:'Private Forge',xp:450,inventory:[{name:'Wand'}],
    secretNotes:'must remain private'
  });
  const queued=await campaignCharacterLink(db,'alice',{
    action:'request',campaignId:'c',sourceCharacterId:'forge'
  });
  assert.equal(queued.status,'pending');
  const result=await listPendingCampaignCharacterLinks(db,'gm','c');
  assert.equal(result.requests.length,1);
  assert.equal(JSON.stringify(result).includes('secretNotes'),false);
  const link=result.requests[0];
  const path='campaigns/c/characterLinks/'+link.linkId;
  await assertFails(getDoc(doc(user('alice'),path)));
  await assertFails(getDoc(doc(user('gm'),path)));
  await assertFails(setDoc(doc(user('alice'),path),{status:'approved'}));
  await assertFails(updateDoc(doc(user('gm'),path),{status:'approved'}));
  await assert.rejects(reviewCampaignCharacterLink(db,'bob',{
    campaignId:'c',linkId:link.linkId,decision:'approve',expectedRevision:link.revision
  }),/authorised GM/);
  const approved=await reviewCampaignCharacterLink(db,'gm',{
    campaignId:'c',linkId:link.linkId,decision:'approve',expectedRevision:link.revision
  });
  assert.equal(approved.status,'approved');
  assert.equal(approved.campaignCharacterId,queued.campaignCharacterId);
  const shared=(await db.doc('campaigns/c/characters/'+approved.campaignCharacterId).get()).data();
  assert.equal(shared.ownerUid,'alice');
  assert.equal(shared.sourceCharacterId,'forge');
  assert.equal(shared.xp,450);
  assert.deepEqual(shared.inventory,[{name:'Wand'}]);
  assert.equal(shared.secretNotes,undefined);
  assert.equal((await db.doc('users/alice/characters/forge').get()).data().secretNotes,'must remain private');
  assert.equal((await db.doc('users/alice/characters/forge').get()).data().campaignCharacterIds.c,
    approved.campaignCharacterId);
  await assertSucceeds(getDoc(doc(user('alice'),
    'campaigns/c/characters/'+approved.campaignCharacterId)));
  assert.equal((await db.doc('campaigns/c').get()).data().playerCharacterLinks[approved.campaignCharacterId],'alice');
  assert.equal((await listPendingCampaignCharacterLinks(db,'gm','c')).requests.length,0);
});

test('Phase 5.2: decline is reversible through fresh player request, not a stale GM replay',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,
    capacity:{maxActiveCharacters:5,maxCharactersPerPlayer:2}});
  await db.doc('campaigns/c/members/alice').set({
    uid:'alice',campaignId:'c',role:'player',status:'active',revision:1
  });
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({
    campaignId:'c',role:'player',status:'active'
  });
  await db.doc('users/alice/characters/forge').set({id:'forge',ownerUid:'alice',xp:99});
  await campaignCharacterLink(db,'alice',{
    action:'request',campaignId:'c',sourceCharacterId:'forge'
  });
  const old=(await listPendingCampaignCharacterLinks(db,'gm','c')).requests[0];
  await reviewCampaignCharacterLink(db,'gm',{
    campaignId:'c',linkId:old.linkId,decision:'decline',expectedRevision:old.revision
  });
  assert.equal((await db.doc('campaigns/c/characters/'+old.campaignCharacterId).get()).exists,false);
  assert.equal((await db.doc('users/alice/characters/forge').get()).data().xp,99);
  await campaignCharacterLink(db,'alice',{
    action:'request',campaignId:'c',sourceCharacterId:'forge'
  });
  await assert.rejects(reviewCampaignCharacterLink(db,'gm',{
    campaignId:'c',linkId:old.linkId,decision:'approve',expectedRevision:old.revision
  }),/changed/);
  const next=(await listPendingCampaignCharacterLinks(db,'gm','c')).requests[0];
  assert.equal(next.revision,3);
});

test('Phase 5.3: archive and restore preserve owned gameplay and forbid browser recreation',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,
    capacity:{maxActiveCharacters:5,maxCharactersPerPlayer:2}});
  await db.doc('campaigns/c/members/alice').set({
    uid:'alice',campaignId:'c',role:'player',status:'active',revision:1
  });
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({
    campaignId:'c',role:'player',status:'active'
  });
  await db.doc('users/alice/characters/lifecycle').set({
    id:'lifecycle',sourceCharacterId:'lifecycle',ownerUid:'alice',
    name:'Archived Forge',level:6,xp:440,coins:{copper:40},
    inventory:[{name:'Shield'}],privateNotes:'secret'
  });
  await campaignCharacterLink(db,'alice',{
    action:'request',campaignId:'c',sourceCharacterId:'lifecycle'
  });
  const row=(await listPendingCampaignCharacterLinks(db,'gm','c')).requests[0];
  const approval=await reviewCampaignCharacterLink(db,'gm',{
    campaignId:'c',linkId:row.linkId,decision:'approve',expectedRevision:row.revision
  });
  const id=approval.campaignCharacterId,path='campaigns/c/characters/'+id;
  await db.doc(path).update({xp:880,coins:{copper:90}});
  const live=(await db.doc(path).get()).data();
  const lifecycle=await changeCampaignCharacterLifecycle(db,'gm',{
    campaignId:'c',linkId:row.linkId,action:'deactivate',expectedRevision:2
  });
  assert.equal(lifecycle.status,'inactive');
  assert.equal((await db.doc(path).get()).exists,false);
  assert.equal((await db.doc('campaigns/c/archivedCharacters/'+id).get()).data().xp,880);
  const source=(await db.doc('users/alice/characters/lifecycle').get()).data();
  assert.equal(source.xp,880);
  assert.equal(source.privateNotes,'secret');
  assert.deepEqual(source.campaignCharacterIds,{});
  assert.equal((await db.doc('campaigns/c').get()).data().playerCharacterLinks[id],undefined);
  for(const client of [user('alice'),user('gm'),user('eve')]){
    await assertFails(getDoc(doc(client,'campaigns/c/archivedCharacters/'+id)));
    await assertFails(setDoc(doc(client,path),{id,ownerUid:'alice',sourceCharacterId:'lifecycle'}));
  }
  await assertFails(setDoc(doc(user('gm'),'campaigns/c/characters/forged'),{
    id:'forged',ownerUid:'gm',sourceCharacterId:'forged'
  }));
  await assertFails(deleteDoc(doc(user('gm'),'campaigns/c/characters/a')));
  const listed=await listCampaignCharacterLifecycle(db,'gm','c');
  assert.equal(listed.links.find(link=>link.linkId===row.linkId).status,'inactive');
  assert.equal(JSON.stringify(listed).includes('secret'),false);
  const restored=await changeCampaignCharacterLifecycle(db,'gm',{
    campaignId:'c',linkId:row.linkId,action:'restore',expectedRevision:3
  });
  assert.equal(restored.status,'approved');
  assert.equal((await db.doc(path).get()).data().xp,880);
  assert.equal((await db.doc('campaigns/c/archivedCharacters/'+id).get()).exists,false);
  assert.equal((await db.doc('campaigns/c').get()).data().playerCharacterLinks[id],'alice');
});

test('Phase 5.3: lifecycle unlink has no browser access shortcut or private sheet deletion',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,
    capacity:{maxActiveCharacters:5,maxCharactersPerPlayer:2}});
  await db.doc('campaigns/c/members/alice').set({
    uid:'alice',campaignId:'c',role:'player',status:'active',revision:1
  });
  await db.doc('campaignMemberProjections/alice/campaigns/c').set({
    campaignId:'c',role:'player',status:'active'
  });
  await db.doc('users/alice/characters/lifecycle').set({
    id:'lifecycle',ownerUid:'alice',name:'Forge',xp:900,inventory:[{name:'Ring'}]
  });
  await campaignCharacterLink(db,'alice',{
    action:'request',campaignId:'c',sourceCharacterId:'lifecycle'
  });
  const row=(await listPendingCampaignCharacterLinks(db,'gm','c')).requests[0];
  await reviewCampaignCharacterLink(db,'gm',{
    campaignId:'c',linkId:row.linkId,decision:'approve',expectedRevision:1
  });
  const removed=await changeCampaignCharacterLifecycle(db,'alice',{
    campaignId:'c',sourceCharacterId:'lifecycle',action:'unlink',expectedRevision:2
  });
  assert.equal(removed.status,'unlinked');
  const original=(await db.doc('users/alice/characters/lifecycle').get()).data();
  assert.equal(original.ownerUid,'alice');
  assert.equal(original.xp,900);
  assert.equal(original.sharedCampaignId,'');
  assert.equal((await db.doc('campaigns/c/archivedCharacters/'+row.campaignCharacterId).get()).data().status,'unlinked');
  assert.equal((await db.doc('campaigns/c/characters/'+row.campaignCharacterId).get()).exists,false);
  await assert.rejects(campaignCharacterLink(db,'alice',{
    action:'request',campaignId:'c',sourceCharacterId:'lifecycle'
  }),/inactive/);
  await assert.rejects(changeCampaignCharacterLifecycle(db,'alice',{
    campaignId:'c',sourceCharacterId:'lifecycle',action:'restore',expectedRevision:3
  }),/authorised GM/);
});


test('Phase 6.1: server-issued invitation is private and cannot grant campaign access',async()=>{
  await db.doc('campaigns/c').update({
    membershipSchemaVersion:2,joinPolicy:{joinRequestsOpen:true}
  });
  const signingKey='private-test-key-'.repeat(4);
  const issued=await issueSecureCampaignInvitation(db,'gm',{
    campaignId:'c',requestId:'secure-issue-00000001',type:'share-link',
    roleOffered:'player',expiresInHours:24,maxUses:1
  },{signingKey,now:new Date('2026-11-09T04:00:00.000Z')});
  assert.equal(issued.alreadyIssued,false);
  assert.equal(issued.token.length,43);
  const path='campaigns/c/invitations/'+issued.inviteId;
  const privateRecord=(await db.doc(path).get()).data();
  assert.equal(privateRecord.token,undefined);
  assert.equal(privateRecord.tokenDigest.length,64);
  assert.equal((await db.doc('campaigns/c').get()).data().invitations,undefined);
  assert.equal((await db.doc('campaigns/c/joinRequests/eve').get()).exists,false);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  assert.equal((await db.doc('campaigns/c').get()).data().party.length,2);
  for(const identity of ['gm','alice','eve']){
    const client=user(identity);
    await assertFails(getDoc(doc(client,path)));
    await assertFails(getDocs(collection(client,'campaigns/c/invitations')));
    await assertFails(setDoc(doc(client,path),{token:'stolen',status:'active'}));
    await assertFails(updateDoc(doc(client,path),{usedCount:1}));
    await assertFails(deleteDoc(doc(client,path)));
    await assertFails(getDoc(doc(client,'campaignInvitationTokenIndex/'+privateRecord.tokenDigest)));
    await assertFails(setDoc(doc(client,'campaignInvitationTokenIndex/'+privateRecord.tokenDigest),{
      campaignId:'c',inviteId:issued.inviteId
    }));
    await assertFails(getDoc(doc(client,'campaignInvitationIssueThrottle/gm')));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),path)));
  const check=assertSecureInvitationEligible(privateRecord,{
    campaignId:'c',inviteId:issued.inviteId,token:issued.token,
    claimantUid:'eve',now:new Date('2026-11-09T04:05:00.000Z'),signingKey
  });
  assert.equal(check.requiresGMApproval,true);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  const replay=await issueSecureCampaignInvitation(db,'gm',{
    campaignId:'c',requestId:'secure-issue-00000001',type:'share-link',
    roleOffered:'player',expiresInHours:24,maxUses:1
  },{signingKey,now:new Date('2026-11-09T04:00:00.000Z')});
  assert.equal(replay.alreadyIssued,true);
  assert.equal(replay.token,null);
});

test('Phase 6.1: only owner of upgraded campaign issues; verified email required',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  const signingKey='private-test-key-'.repeat(4);
  const request={
    campaignId:'c',requestId:'secure-issue-00000002',type:'email',
    recipientEmail:'Player@Example.COM',roleOffered:'player',
    expiresInHours:1,maxUses:1
  };
  await assert.rejects(issueSecureCampaignInvitation(db,'bob',request,{
    signingKey
  }),/Only the owner/);
  const issued=await issueSecureCampaignInvitation(db,'gm',request,{
    signingKey,now:new Date('2026-11-09T04:00:00.000Z')
  });
  const row=(await db.doc('campaigns/c/invitations/'+issued.inviteId).get()).data();
  assert.equal(row.recipientEmailNormalized,'player@example.com');
  assert.throws(()=>assertSecureInvitationEligible(row,{
    campaignId:'c',inviteId:issued.inviteId,token:issued.token,
    claimantUid:'eve',claimantEmail:'player@example.com',
    emailVerified:false,signingKey,
    now:new Date('2026-11-09T04:20:00.000Z')
  }),/unavailable/);
  assert.throws(()=>assertSecureInvitationEligible(row,{
    campaignId:'c',inviteId:issued.inviteId,token:issued.token,
    claimantUid:'eve',claimantEmail:'player@example.com',
    emailVerified:true,signingKey,
    now:new Date('2026-11-09T05:00:00.000Z')
  }),/unavailable/);
});


test('Phase 6.2: only owner sees safe metadata, revocation prevents token reuse without joining',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2,
    joinPolicy:{joinRequestsOpen:true}});
  const signingKey='firebase-test-key-'.repeat(3);
  const issued=await issueSecureCampaignInvitation(db,'gm',{
    campaignId:'c',requestId:'phase-6-2-invite-00000001',
    type:'email',recipientEmail:' Player@example.COM ',
    roleOffered:'player',expiresInHours:48,maxUses:1
  },{signingKey,now:new Date('2026-11-09T04:00:00.000Z')});
  const token=issued.token;
  const path='campaigns/c/invitations/'+issued.inviteId;
  const before=(await db.doc('campaigns/c').get()).data();
  const list=await listSecureCampaignInvitations(db,'gm',{campaignId:'c'},
    {now:new Date('2026-11-09T05:00:00.000Z')});
  assert.equal(list.invitations.length,1);
  assert.equal(list.invitations[0].recipientEmail,'player@example.com');
  assert.equal(list.invitations[0].revision,1);
  assert.equal(list.nextCursor,null);
  assert.equal(JSON.stringify(list).includes(token),false);
  assert.equal(JSON.stringify(list).includes(
    (await db.doc(path).get()).data().tokenDigest),false);
  await assert.rejects(listSecureCampaignInvitations(db,'alice',{campaignId:'c'}),/Only the owner/);
  await assert.rejects(listSecureCampaignInvitations(db,'bob',{campaignId:'c'}),/Only the owner/);
  await assert.rejects(changeSecureCampaignInvitation(db,'alice',{
    campaignId:'c',inviteId:issued.inviteId,action:'revoke',expectedRevision:1
  }),/Only the owner/);
  const revoked=await changeSecureCampaignInvitation(db,'gm',{
    campaignId:'c',inviteId:issued.inviteId,action:'revoke',expectedRevision:1
  },{now:new Date('2026-11-09T05:00:00.000Z')});
  assert.equal(revoked.status,'revoked');
  assert.equal(revoked.revision,2);
  assert.equal((await db.doc('campaigns/c/auditEvents/invite-management-'+issued.inviteId+'-r1').get()).data().action,'revoke');
  await assert.rejects(changeSecureCampaignInvitation(db,'gm',{
    campaignId:'c',inviteId:issued.inviteId,action:'expire',expectedRevision:1
  }),/no longer active/);
  const revokedRecord=(await db.doc(path).get()).data();
  assert.throws(()=>assertSecureInvitationEligible(
    revokedRecord,{
      campaignId:'c',inviteId:issued.inviteId,token,
      claimantUid:'eve',claimantEmail:'player@example.com',
      emailVerified:true,now:new Date('2026-11-09T05:00:00.000Z'),signingKey
    }),/unavailable/);
  const after=(await db.doc('campaigns/c').get()).data();
  assert.deepEqual(after,before);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  for(const uid of ['gm','alice','eve']){
    await assertFails(getDoc(doc(user(uid),path)));
    await assertFails(getDocs(collection(user(uid),'campaigns/c/invitations')));
    await assertFails(updateDoc(doc(user(uid),path),{status:'active'}));
  }
});

test('Phase 6.2: expired listing is metadata-only and no source or character changes',async()=>{
  await db.doc('campaigns/c').update({membershipSchemaVersion:2});
  const issued=await issueSecureCampaignInvitation(db,'gm',{
    campaignId:'c',requestId:'phase-6-2-invite-00000002',
    type:'share-link',roleOffered:'co-gm',expiresInHours:1,maxUses:1
  },{signingKey:'firebase-test-key-'.repeat(3),
    now:new Date('2026-11-09T04:00:00.000Z')});
  const listing=await listSecureCampaignInvitations(db,'gm',{campaignId:'c'},
    {now:new Date('2026-11-09T06:00:00.000Z')});
  assert.equal(listing.invitations[0].status,'expired');
  assert.equal(listing.invitations[0].roleOffered,'co-gm');
  assert.equal((await db.doc('campaigns/c/invitations/'+issued.inviteId).get()).data().status,'active');
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().ownerUid,'alice');
  assert.equal((await db.doc('campaigns/c/members/bob').get()).exists,false);
});

test('Phase 6.3: verified email invite creates pending request, never grants membership before review',async()=>{
  await db.doc('campaigns/c').update({
    membershipSchemaVersion:2,partySize:5,
    joinPolicy:{joinRequestsOpen:true,autoApprove:true}
  });
  const signingKey='firebase-acceptance-secret-'.repeat(2);
  const issued=await issueSecureCampaignInvitation(db,'gm',{
    campaignId:'c',requestId:'phase-6-3-invite-00000001',
    type:'email',recipientEmail:'Eve@example.COM',
    roleOffered:'co-gm',expiresInHours:48,maxUses:1
  },{signingKey,now:new Date('2026-11-09T04:00:00.000Z')});
  const source='campaigns/c/invitations/'+issued.inviteId;
  const data={campaignId:'c',inviteId:issued.inviteId,token:issued.token};
  const identity={uid:'eve',email:'eve@example.com',emailVerified:true};
  const preview=await previewSecureCampaignInvitation(db,identity,data,{
    signingKey,now:new Date('2026-11-09T05:00:00.000Z')
  });
  assert.equal(preview.roleOffered,'co-gm');
  assert.equal(preview.requiresGMApproval,true);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  await assert.rejects(acceptSecureCampaignInvitation(db,{
    ...identity,emailVerified:false
  },data,{signingKey,now:new Date('2026-11-09T05:00:00.000Z')}),/unavailable/);
  const request=await acceptSecureCampaignInvitation(db,identity,data,{
    signingKey,now:new Date('2026-11-09T05:00:00.000Z')
  });
  assert.equal(request.status,'pending');
  assert.equal(request.offeredRole,'co-gm');
  assert.equal((await db.doc('campaigns/c/joinRequests/eve').get()).data().source,'secure-invite');
  assert.equal((await db.doc(source).get()).data().status,'exhausted');
  assert.equal((await db.doc(source).get()).data().usedCount,1);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  assert.equal((await db.doc('campaignMemberProjections/eve/campaigns/c').get()).exists,false);
  assert.equal((await db.doc('campaigns/c').get()).data().roles.eve,undefined);
  const replay=await acceptSecureCampaignInvitation(db,identity,data,{
    signingKey,now:new Date('2026-11-11T05:00:00.000Z')
  });
  assert.equal(replay.alreadyExists,true);
  assert.equal((await db.doc(source).get()).data().usedCount,1);
  for(const uid of ['gm','alice','eve']){
    await assertFails(getDoc(doc(user(uid),source+'/claims/eve')));
    await assertFails(setDoc(doc(user(uid),source+'/claims/eve'),{status:'approved'}));
    await assertFails(updateDoc(doc(user(uid),'campaigns/c/joinRequests/eve'),{status:'approved'}));
  }
  const reviewed=await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'eve',decision:'approve',expectedRevision:1
  });
  assert.equal(reviewed.status,'approved');
  assert.equal((await db.doc('campaigns/c/members/eve').get()).data().role,'player');
  assert.equal((await db.doc('campaignMemberProjections/eve/campaigns/c').get()).data().role,'player');
});

test('Phase 6.3: revocation and exhausted sharing block new claims and preserve campaign roster',async()=>{
  await db.doc('campaigns/c').update({
    membershipSchemaVersion:2,joinPolicy:{joinRequestsOpen:true}
  });
  const signingKey='firebase-acceptance-secret-'.repeat(2);
  const issued=await issueSecureCampaignInvitation(db,'gm',{
    campaignId:'c',requestId:'phase-6-3-invite-00000002',
    type:'share-link',roleOffered:'player',expiresInHours:24,maxUses:1
  },{signingKey,now:new Date('2026-11-09T04:00:00.000Z')});
  const data={campaignId:'c',inviteId:issued.inviteId,token:issued.token};
  const before=(await db.doc('campaigns/c').get()).data();
  await changeSecureCampaignInvitation(db,'gm',{
    campaignId:'c',inviteId:issued.inviteId,
    action:'revoke',expectedRevision:1
  },{now:new Date('2026-11-09T04:10:00.000Z')});
  await assert.rejects(acceptSecureCampaignInvitation(db,{uid:'eve'},data,{
    signingKey,now:new Date('2026-11-09T04:15:00.000Z')
  }),/unavailable/);
  assert.equal((await db.doc('campaigns/c/joinRequests/eve').get()).exists,false);
  assert.deepEqual((await db.doc('campaigns/c').get()).data(),before);
  assert.equal((await db.doc('campaigns/c/invitations/'+issued.inviteId).get()).data().usedCount,0);
});


test('Phase 7.2: GM-only bulk sending stores provider status privately and rotates tokens on resend',async()=>{
  await db.doc('campaigns/c').update({
    membershipSchemaVersion:2,joinPolicy:{joinRequestsOpen:true}
  });
  const opts={
    now:new Date('2026-11-09T09:00:00.000Z'),
    signingKey:'phase72-secure-signing-key-'.repeat(2),
    apiKey:'re_'+'x'.repeat(40),
    env:{
      ASTERIA_EMAIL_DELIVERY_ENABLED:'1',
      ASTERIA_EMAIL_SENDING_DOMAIN:'mail.asteriattrpg.com',
      ASTERIA_EMAIL_FROM:'invites@mail.asteriattrpg.com',
      ASTERIA_EMAIL_DOMAIN_VERIFIED:'1'
    }
  };
  let sends=0,lastLink=null;
  const mock=async data=>{
    sends++;lastLink=data.invitationUrl;
    return {status:'accepted',providerMessageId:'test_'+sends};
  };
  const input={
    campaignId:'c',requestId:'phase72-bulk-0000001',
    recipients:['eve@example.com','mallory@example.com'],
    roleOffered:'player',expiresInHours:24
  };
  await assert.rejects(sendCampaignEmailInvitations(db,'alice',input,{
    ...opts,deliver:mock
  }),/Only the owner/);
  const first=await sendCampaignEmailInvitations(db,'gm',input,{...opts,deliver:mock});
  assert.equal(first.results.length,2);
  assert.equal(first.results.every(row=>row.status==='accepted'),true);
  assert.equal(sends,2);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  assert.equal((await db.doc('campaigns/c/joinRequests/eve').get()).exists,false);
  const before=(await db.doc('campaigns/c').get()).data();
  const inviteId=first.results[0].inviteId;
  const path='campaigns/c/invitations/'+inviteId;
  const privateInvite=(await db.doc(path).get()).data();
  assert.equal(privateInvite.deliveryStatus,'accepted');
  assert.equal(privateInvite.deliveryAttemptCount,1);
  assert.equal(privateInvite.token,undefined);
  assert.equal(JSON.stringify(privateInvite).includes(lastLink),false);
  for(const uid of ['gm','alice','eve']){
    await assertFails(getDoc(doc(user(uid),path)));
    await assertFails(updateDoc(doc(user(uid),path),{deliveryStatus:'delivered'}));
  }
  const replay=await sendCampaignEmailInvitations(db,'gm',input,{...opts,deliver:mock});
  assert.equal(replay.results.every(row=>row.alreadyExists),true);
  assert.equal(sends,2);
  const source=first.results[0];
  const rotated=await resendCampaignEmailInvitation(db,'gm',{
    campaignId:'c',requestId:'phase72-replace-00001',
    sourceInviteId:source.inviteId,expectedRevision:1
  },{...opts,deliver:mock});
  assert.equal(rotated.result.status,'accepted');
  assert.notEqual(rotated.result.inviteId,source.inviteId);
  assert.equal((await db.doc(path).get()).data().status,'revoked');
  assert.equal((await db.doc('campaigns/c/invitations/'+rotated.result.inviteId).get()).data().resendOfInviteId,inviteId);
  assert.equal(sends,3);
  assert.deepEqual((await db.doc('campaigns/c').get()).data(),before);
});


test('Phase 7.3: GM join alerts and player decisions remain recipient-private and gameplay-safe',async()=>{
  await db.doc('campaigns/c').update({
    membershipSchemaVersion:2,joinPolicy:{joinRequestsOpen:true},partySize:8
  });
  const before=(await db.doc('campaigns/c/characters/a').get()).data();
  const submitted=await campaignJoinRequest(db,'eve',{
    action:'submit',campaignId:'c',ucn:'123456789012'
  },{notificationsEnabled:true});
  assert.equal(submitted.status,'pending');
  const gm=await listCampaignNotifications(db,'gm');
  assert.equal(gm.notifications.length,1);
  assert.equal(gm.notifications[0].kind,'join-request');
  assert.equal(gm.unreadShown,1);
  assert.equal((await listCampaignNotifications(db,'eve')).notifications.length,0);
  const gmDoc='campaignNotificationInbox/gm/items/'+gm.notifications[0].notificationId;
  for(const uid of ['gm','alice','eve']){
    const client=user(uid);
    await assertFails(getDoc(doc(client,gmDoc)));
    await assertFails(getDocs(collection(client,'campaignNotificationInbox/gm/items')));
    await assertFails(setDoc(doc(client,gmDoc),{title:'Forged notice'}));
    await assertFails(updateDoc(doc(client,gmDoc),{readAt:new Date()}));
    await assertFails(deleteDoc(doc(client,gmDoc)));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),gmDoc)));
  const review=await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'eve',decision:'approve',expectedRevision:1
  },{notificationsEnabled:true});
  assert.equal(review.status,'approved');
  const player=await listCampaignNotifications(db,'eve');
  assert.equal(player.notifications.length,1);
  assert.equal(player.notifications[0].kind,'join-approved');
  assert.equal(player.unreadShown,1);
  await assertFails(getDoc(doc(user('eve'),'campaignNotificationInbox/eve/items/'+
    player.notifications[0].notificationId)));
  const read=await markCampaignNotificationRead(db,'eve',
    player.notifications[0].notificationId);
  assert.equal(read.alreadyRead,false);
  assert.equal((await listCampaignNotifications(db,'eve')).unreadShown,0);
  assert.equal((await markCampaignNotificationRead(db,'eve',
    player.notifications[0].notificationId)).alreadyRead,true);
  assert.deepEqual((await db.doc('campaigns/c/characters/a').get()).data(),before);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).data().role,'player');
  const replay=await reviewCampaignJoinRequest(db,'gm',{
    campaignId:'c',requestUid:'eve',decision:'approve',expectedRevision:1
  },{notificationsEnabled:true});
  assert.equal(replay.alreadyReviewed,true);
  assert.equal((await listCampaignNotifications(db,'eve')).notifications.length,1);
});

test('Phase 7.3: verified-account invitation notice is opaque and cannot grant access',async()=>{
  await db.doc('campaigns/c').update({
    membershipSchemaVersion:2,joinPolicy:{joinRequestsOpen:true}
  });
  const id='a'.repeat(64);
  const once=await notifyVerifiedEmailRecipient(db,'eve',{
    campaignId:'c',campaignName:'The Frost Throne',inviteId:id
  });
  assert.equal(once.alreadyExists,false);
  const again=await notifyVerifiedEmailRecipient(db,'eve',{
    campaignId:'c',campaignName:'The Frost Throne',inviteId:id
  });
  assert.equal(again.alreadyExists,true);
  const list=await listCampaignNotifications(db,'eve');
  assert.equal(list.notifications.length,1);
  assert.equal(list.notifications[0].kind,'email-invitation');
  assert.equal(JSON.stringify(list).includes(id),false);
  assert.equal((await db.doc('campaigns/c/members/eve').get()).exists,false);
  assert.equal((await db.doc('campaigns/c/joinRequests/eve').get()).exists,false);
  const privatePath='campaignNotificationInbox/eve/items/'+once.notificationId;
  await assertFails(getDoc(doc(user('gm'),privatePath)));
  await assertFails(getDoc(doc(user('eve'),privatePath)));
  await assertFails(setDoc(doc(user('eve'),privatePath),{readAt:new Date()}));
});
