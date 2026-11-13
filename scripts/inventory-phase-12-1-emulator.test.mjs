// Phase 12.1 — end-to-end player/GM acceptance tests against local Firebase emulators.
// These tests never contact production, add gameplay features, or deploy anything.
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {getDoc,getDocs,doc,collection,query,where,updateDoc} from 'firebase/firestore';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {executeAction} from '../functions/handler.mjs';
import {merchantStockIdentity} from '../src/state/merchantInventoryModel.mjs';

const campaignId='phase12-workflow';
const projectId='demo-asteria';
let env,app,db;
const path=(...parts)=>['campaigns',campaignId,...parts].join('/');
const user=uid=>env.authenticatedContext(uid).firestore();
const action=(uid,name,args,requestId=crypto.randomUUID())=>
  executeAction(db,uid,{action:name,args,requestId},()=>FieldValue.serverTimestamp());
const starterItems=()=>[
  {id:'blade',instanceId:'blade',name:'Iron Blade',type:'Weapon',
    condition:40,durability:4,maxDurability:10,qty:1,identified:true,
    equipped:false,storageId:'bag',storageSlot:0,marketValue:0.1,marketPrice:0.2},
  {id:'ore',instanceId:'ore',name:'Iron Ore',type:'Material',
    qty:1,identified:true,storageId:'bag',storageSlot:1},
  {id:'ingots',instanceId:'ingots',name:'Iron Ingot',type:'Material',
    qty:4,identified:true,storageId:'bag',storageSlot:2},
  {id:'crystal',instanceId:'crystal',name:'Powdered Crystal',type:'Material',
    qty:2,identified:true,storageId:'bag',storageSlot:3},
  {id:'soul',instanceId:'soul',name:'Poor Soul Stone',type:'Material',
    qty:2,identified:true,storageId:'bag',storageSlot:4}
];
const makeSheet=(id,uid)=>({
  id,ownerUid:uid,sourceCharacterId:id,sharedCampaignId:campaignId,
  linkedCampaignIds:[campaignId],name:id,level:1,xp:0,cp:2,tp:2,
  hp:[10,10],mp:[120,120],sp:[10,10],bp:[0,5],coins:{copper:500},
  inventory:id==='a'?starterItems():[
    {id:'bob-club',instanceId:'bob-club',name:'Wooden Club',type:'Weapon',
      qty:1,identified:true,storageId:'bag',storageSlot:0}
  ],storages:[{id:'bag',name:'Bag',rows:6,cols:6,maxSlots:36}],
  spells:[{name:'Spark',cost:'3 MP'}],skills:[{name:'Smithing',rank:1}]
});
const campaign=()=>({
  id:campaignId,ownerUid:'gm',gmUids:['gm'],playerUids:['alice','bob'],
  roles:{gm:'gm',alice:'player',bob:'player'},
  players:{alice:{uid:'alice',role:'player',characterIds:['a']},
    bob:{uid:'bob',role:'player',characterIds:['b']}},
  party:['a','b'],characters:{a:{ownerUid:'alice'},b:{ownerUid:'bob'}},
  playerCharacterLinks:{a:'alice',b:'bob'},ucn:'123456789012'
});
const copper=coins=>[
  ['royal_platinum',10000000000],['royal_crown',100000000],
  ['platinum_crown',1000000],['gold',10000],['silver',100],['copper',1]
].reduce((sum,[unit,value])=>sum+Number(coins?.[unit]||0)*value,0);
const live=async id=>(await db.doc(path('characters',id)).get()).data();
const privateSheet=async(id,uid)=>(await db.doc('users/'+uid+'/characters/'+id).get()).data();
const mirrored=async(id,uid)=>{
  const current=await live(id),owned=await privateSheet(id,uid);
  assert.deepEqual(owned.inventory,current.inventory,'Inventory matches both owner mirrors');
  assert.deepEqual(owned.coins,current.coins,'Currency matches both owner mirrors');
  assert.deepEqual(owned.mp,current.mp,'MP matches both owner mirrors');
  assert.equal(owned.coreRevision,current.coreRevision,'Revision matches both owner mirrors');
  return current;
};
const station=(extra={})=>({
  name:'Western Forge',type:'Forge',status:'open',location:'Vaelgard',
  description:'A staffed public forge',allowedCharacterIds:[],...extra
});
const service=(extra={})=>({
  name:'Repair an Iron Blade',provider:'Mira the Smith',type:'repair',
  status:'published',description:'Restoration without automatic skill rolls',
  stationId:'forge',targetType:'Weapon',feeCopper:75,restoreTo:100,
  materials:[{name:'Iron Ingot',quantity:2}],...extra
});
const saveStation=async(input=station())=>{
  const response=await action('gm','manageCraftingStation',[campaignId,'gm-scope',
    {type:'save',stationId:'forge',station:input}]);
  assert.equal(response.ok,true,response.error);
  return response;
};
const saveService=async(input=service())=>{
  const response=await action('gm','manageNPCService',[campaignId,'gm-scope',
    {type:'save',serviceId:'repair',service:input}]);
  assert.equal(response.ok,true,response.error);
  return response;
};
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,
    firestore:{rules:fs.readFileSync('firestore.rules','utf8')},
    storage:{rules:fs.readFileSync('storage.rules','utf8')}
  });
  app=initializeApp({projectId},'inventory-phase-12-1');
  db=getFirestore(app);
});
after(async()=>{await env?.cleanup();await deleteApp(app);});
beforeEach(async()=>{
  await env.clearFirestore();
  const batch=db.batch();
  batch.set(db.doc('campaigns/'+campaignId),campaign());
  for(const [id,uid] of [['a','alice'],['b','bob']]){
    batch.set(db.doc(path('characters',id)),makeSheet(id,uid));
    batch.set(db.doc('users/'+uid+'/characters/'+id),makeSheet(id,uid));
  }
  batch.set(db.doc(path('liveSession','current')),
    {id:'phase12-session',status:'active',expiresAt:new Date(Date.now()+3600000)});
  batch.set(db.doc(path('systems','gmWorkspace')),{privateNotes:'GM-private'});
  batch.set(db.doc(path('systems','itemEcosystem')),{shops:[],playerItemRequests:[]});
  await batch.commit();
});

test('12.1: GM publishes stations/NPC services; owner requests repair, GM settles once',async()=>{
  assert.equal((await action('alice','manageCraftingStation',[campaignId,'a',
    {type:'save',stationId:'forge',station:station()}])).ok,false);
  await saveStation(station({status:'draft'}));
  await assertFails(getDoc(doc(user('alice'),path('craftingStations','forge'))));
  await saveStation();
  await assertSucceeds(getDoc(doc(user('alice'),path('craftingStations','forge'))));
  await assertFails(updateDoc(doc(user('gm'),path('craftingStations','forge')),{status:'closed'}));
  await assertFails(getDocs(collection(user('alice'),path('craftingStations'))));
  const publicStations=await assertSucceeds(getDocs(query(
    collection(user('alice'),path('craftingStations')),where('status','==','open'))));
  assert.equal(publicStations.size,1);
  await saveService(service({status:'draft'}));
  await assertFails(getDoc(doc(user('alice'),path('npcCraftingServices','repair'))));
  await saveService();
  await assertSucceeds(getDoc(doc(user('alice'),path('npcCraftingServices','repair'))));
  await assertFails(updateDoc(doc(user('alice'),path('npcCraftingServices','repair')),
    {feeCopper:0}));
  const published=await assertSucceeds(getDocs(query(
    collection(user('alice'),path('npcCraftingServices')),
    where('status','==','published'))));
  assert.equal(published.size,1);
  assert.equal((await action('bob','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}])).ok,false);
  assert.equal((await action('alice','manageNPCService',[campaignId,'a',{
    type:'save',serviceId:'repair',service:service({feeCopper:0})
  }])).ok,false);

  const requestArgs=[campaignId,'a',{serviceId:'repair',itemId:'blade'}];
  const proposed=await action('alice','requestNPCRepair',requestArgs,'player-repair-once');
  assert.equal(proposed.ok,true,proposed.error);
  const replay=await action('alice','requestNPCRepair',requestArgs,'player-repair-once');
  assert.equal(replay.ok,true,replay.error);
  assert.equal(replay.request.id,proposed.request.id);
  const requestRef=path('npcRepairRequests',proposed.request.id);
  assert.equal((await db.collection(path('npcRepairRequests')).get()).size,1,
    'Repeated requests with the same receipt cannot create another request');
  await assertSucceeds(getDoc(doc(user('alice'),requestRef)));
  await assertFails(getDoc(doc(user('bob'),requestRef)));
  await assertFails(updateDoc(doc(user('alice'),requestRef),{status:'approved'}));
  const ownRequests=await assertSucceeds(getDocs(query(
    collection(user('alice'),path('npcRepairRequests')),
    where('ownerUid','==','alice'))));
  assert.equal(ownRequests.size,1);
  await assertFails(getDocs(collection(user('bob'),path('npcRepairRequests')));

  const before=await live('a');
  assert.equal(before.inventory.find(row=>row.id==='blade').condition,40);
  assert.equal(before.inventory.find(row=>row.id==='ingots').qty,4);
  assert.equal(copper(before.coins),500);
  assert.equal((await action('alice','reviewNPCRepair',[campaignId,'a',
    proposed.request.id,'approve'])).ok,false);
  const reviewArgs=[campaignId,'gm-scope',proposed.request.id,'approve'];
  const approved=await action('gm','reviewNPCRepair',reviewArgs,'gm-repair-once');
  assert.equal(approved.ok,true,approved.error);
  const reviewedReplay=await action('gm','reviewNPCRepair',reviewArgs,'gm-repair-once');
  assert.equal(reviewedReplay.ok,true,reviewedReplay.error);
  const completed=await mirrored('a','alice');
  assert.equal(completed.inventory.find(row=>row.id==='blade').condition,100);
  assert.equal(completed.inventory.find(row=>row.id==='blade').durability,10);
  assert.equal(completed.inventory.find(row=>row.id==='blade').instanceId,'blade');
  assert.equal(completed.inventory.find(row=>row.id==='ingots').qty,2);
  assert.equal(copper(completed.coins),425);
  assert.ok(completed.actionLog.some(row=>row.type==='npc-item-repaired'));
  assert.equal((await db.doc(requestRef).get()).data().status,'approved');
  assert.equal((await action('gm','reviewNPCRepair',reviewArgs)).ok,false);
  assert.equal(copper((await live('a')).coins),425,
    'A second approval cannot charge the repair fee again');
  assert.equal((await live('a')).inventory.find(row=>row.id==='ingots').qty,2);
});

test('12.1: Need/Greed loot feeds a station-bound recipe, enchantment and player gift',async()=>{
  await saveStation(station({allowedCharacterIds:['a']}));
  const created=await action('gm','managePartyLootDrop',[campaignId,'a',{
    type:'create',revealNow:true,drop:{title:'Forge Materials',source:'Ruins',
      kind:'item',item:{name:'Iron Ore',type:'Material',qty:2,
        marketPrice:0.1,marketValue:0.05}}
  }]);
  assert.equal(created.ok,true,created.error);
  const lootId=created.lootId;
  assert.equal((await action('gm','managePartyLootDrop',[campaignId,'a',{
    type:'start-distribution',lootId}])).ok,true);
  assert.equal((await action('alice','votePartyLoot',[campaignId,'a',
    {lootId,choice:'need'}])).ok,true);
  assert.equal((await action('bob','votePartyLoot',[campaignId,'b',
    {lootId,choice:'greed'}])).ok,true);
  const awarded=await action('gm','managePartyLootDrop',[campaignId,'a',{
    type:'award-distribution',lootId,winnerCharacterId:'a',storageId:'bag'
  }]);
  assert.equal(awarded.ok,true,awarded.error);
  assert.equal((await db.doc(path('partyLoot',lootId)).get()).data().status,'claimed');
  assert.equal((await mirrored('a','alice')).inventory.filter(row=>row.name==='Iron Ore')
    .reduce((sum,row)=>sum+Number(row.qty||0),0),3);

  const recipeId='phase12-spear';
  const recipe={name:'Tempered Spear',description:'Craft from earned loot',
    status:'published',stationId:'forge',
    materials:[{name:'Iron Ore',quantity:3}],
    output:{name:'Tempered Spear',type:'Weapon',quantity:1}};
  const createdRecipe=await action('gm','manageCampaignCraftingRecipe',[campaignId,'gm-scope',{
    type:'save',recipeId,recipe
  }]);
  assert.equal(createdRecipe.ok,true,createdRecipe.error);
  const proposed=await action('alice','requestCraftingRecipe',[campaignId,'a',recipeId]);
  assert.equal(proposed.ok,true,proposed.error);
  assert.equal((await live('a')).inventory.filter(row=>row.name==='Iron Ore')
    .reduce((sum,row)=>sum+Number(row.qty||0),0),3,
  'Submitting crafting must not spend loot-derived ingredients');
  await saveStation(station({status:'closed',allowedCharacterIds:['a']}));
  const blocked=await action('gm','reviewCraftingRequest',[campaignId,'gm-scope',
    proposed.request.id,'approve']);
  assert.equal(blocked.ok,false,'Closed station must prevent a pending approval');
  assert.equal((await live('a')).inventory.filter(row=>row.name==='Iron Ore')
    .reduce((sum,row)=>sum+Number(row.qty||0),0),3);
  await saveStation(station({allowedCharacterIds:['a']}));
  const crafted=await action('gm','reviewCraftingRequest',[campaignId,'gm-scope',
    proposed.request.id,'approve']);
  assert.equal(crafted.ok,true,crafted.error);
  let current=await mirrored('a','alice');
  const spear=current.inventory.find(row=>row.name==='Tempered Spear');
  assert.ok(spear,'Crafted output is retained as an individual item');
  assert.equal(current.inventory.filter(row=>row.name==='Iron Ore')
    .reduce((sum,row)=>sum+Number(row.qty||0),0),0);
  assert.equal((await action('gm','reviewCraftingRequest',[campaignId,'gm-scope',
    proposed.request.id,'approve'])).ok,false);
  const planId='phase12-flame';
  const plan={name:'Flame Binding',mode:'enchantment',status:'published',
    description:'A GM-defined enchantment',stationId:'forge',targetType:'Weapon',
    effectName:'Ember Edge',effectDescription:'GM determines spell effect',
    spellRank:'Weak',spellName:'Spark',spellMana:3,
    allowStoneSubstitution:false,materials:[]};
  const planned=await action('gm','manageEnhancementPlan',[campaignId,'gm-scope',{
    type:'save',planId,plan
  }]);
  assert.equal(planned.ok,true,planned.error);
  const pending=await action('alice','requestEnhancement',[campaignId,'a',{
    planId,itemId:spear.instanceId,stoneMode:'standard'
  }]);
  assert.equal(pending.ok,true,pending.error);
  assert.equal((await live('a')).mp[0],120);
  const enhanced=await action('gm','reviewEnhancement',[campaignId,'gm-scope',
    pending.request.id,'approve']);
  assert.equal(enhanced.ok,true,enhanced.error);
  current=await mirrored('a','alice');
  const enchanted=current.inventory.find(row=>row.instanceId===spear.instanceId);
  assert.equal(enchanted.enchantments.length,1);
  assert.equal(enchanted.enchantments[0].name,'Ember Edge');
  assert.equal(current.mp[0],114,'Enchantment costs 2× base spell Mana');
  assert.equal(current.inventory.find(row=>row.id==='crystal').qty,1);
  assert.equal(current.inventory.find(row=>row.id==='soul').qty,1);

  const offered=await action('alice','createLiveItemRequest',
    [campaignId,'a','b',spear.instanceId,'give',{quantity:1}]);
  assert.equal(offered.ok,true,offered.error);
  assert.equal((await action('alice','respondLiveItemRequest',
    [campaignId,'b',offered.request.id,true,{}])).ok,false);
  const received=await action('bob','respondLiveItemRequest',
    [campaignId,'b',offered.request.id,true,{}]);
  assert.equal(received.ok,true,received.error);
  const receiver=await mirrored('b','bob');
  assert.ok(receiver.inventory.some(row=>row.name==='Tempered Spear'&&
    row.enchantments?.[0]?.name==='Ember Edge'),
  'Crafted and enchanted properties must survive a player-to-player gift');
  const sender=await mirrored('a','alice');
  assert.equal(sender.inventory.some(row=>row.instanceId===spear.instanceId),false);
  assert.equal((await action('bob','respondLiveItemRequest',
    [campaignId,'b',offered.request.id,true,{}])).ok,false);
});

test('12.1: changed service and item state cannot silently charge or repair pending jobs',async()=>{
  await saveStation();
  await saveService();
  const proposed=await action('alice','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}]);
  assert.equal(proposed.ok,true,proposed.error);
  await saveService(service({feeCopper:125}));
  const changedTerms=await action('gm','reviewNPCRepair',[campaignId,'gm-scope',
    proposed.request.id,'approve']);
  assert.equal(changedTerms.ok,false,'Changing the fee invalidates prior consent');
  let sheet=await live('a');
  assert.equal(sheet.inventory.find(row=>row.id==='ingots').qty,4);
  assert.equal(copper(sheet.coins),500);
  assert.equal((await db.doc(path('npcRepairRequests',proposed.request.id)).get())
    .data().status,'pending');
  const rejected=await action('gm','reviewNPCRepair',[campaignId,'gm-scope',
    proposed.request.id,'reject']);
  assert.equal(rejected.ok,true,rejected.error);
  assert.equal((await action('gm','reviewNPCRepair',[campaignId,'gm-scope',
    proposed.request.id,'approve'])).ok,false);
  await saveService();
  const pending=await action('alice','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}]);
  assert.equal(pending.ok,true,pending.error);
  const modified=await live('a');
  modified.inventory=modified.inventory.map(row=>
    row.id==='blade'?{...row,condition:20,durability:2}:row);
  await db.doc(path('characters','a')).update({inventory:modified.inventory});
  await db.doc('users/alice/characters/a').update({inventory:modified.inventory});
  const stale=await action('gm','reviewNPCRepair',[campaignId,'gm-scope',
    pending.request.id,'approve']);
  assert.equal(stale.ok,false,'Changing a target item requires a new request');
  sheet=await live('a');
  assert.equal(sheet.inventory.find(row=>row.id==='blade').condition,20);
  assert.equal(sheet.inventory.find(row=>row.id==='ingots').qty,4);
  assert.equal(copper(sheet.coins),500);
  assert.equal((await db.doc(path('npcRepairRequests',pending.request.id)).get())
    .data().status,'pending');
});

test('12.1: depleted funds, restricted station and inactive session fail closed',async()=>{
  await saveStation(station({allowedCharacterIds:['b']}));
  await saveService();
  const blocked=await action('alice','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}]);
  assert.equal(blocked.ok,false);
  assert.equal((await db.collection(path('npcRepairRequests')).get()).size,0);
  await saveStation();
  for(const ref of [db.doc(path('characters','a')),
    db.doc('users/alice/characters/a')]){
    await ref.update({coins:{copper:20}});
  }
  const notEnough=await action('alice','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}]);
  assert.equal(notEnough.ok,false);
  assert.equal((await live('a')).inventory.find(row=>row.id==='ingots').qty,4);
  for(const ref of [db.doc(path('characters','a')),
    db.doc('users/alice/characters/a')]){
    await ref.update({coins:{copper:500}});
  }
  const proposed=await action('alice','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}]);
  assert.equal(proposed.ok,true,proposed.error);
  await db.doc(path('liveSession','current')).update({status:'idle'});
  const denied=await action('gm','reviewNPCRepair',[campaignId,'gm-scope',
    proposed.request.id,'approve']);
  assert.equal(denied.ok,false,'Approval requires an active session');
  assert.equal((await action('alice','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}])).ok,false);
  const declined=await action('gm','reviewNPCRepair',[campaignId,'gm-scope',
    proposed.request.id,'reject']);
  assert.equal(declined.ok,true,declined.error);
  assert.equal((await db.doc(path('npcRepairRequests',proposed.request.id)).get())
    .data().status,'rejected');
  assert.equal((await live('a')).inventory.find(row=>row.id==='ingots').qty,4);
  assert.equal(copper((await live('a')).coins),500);
});

test('12.1: GM merchant reputation and inventory purchases share the repair wallet',async()=>{
  const shopId='guild-market';
  const created=await action('gm','manageCampaignShop',[campaignId,'a',{
    type:'save',shop:{id:shopId,name:'Guild Workshop',status:'open',
      buyModifier:1,sellModifier:1,currencyCopper:1000,
      visitorCharacterIds:[],stock:[]}
  }]);
  assert.equal(created.ok,true,created.error);
  const stock=await action('gm','manageCampaignShop',[campaignId,'a',{
    type:'stock',shopId,item:{id:'forge-hammer',name:'Forge Hammer',
      marketPrice:0.1,marketValue:0.05},quantity:2
  }]);
  assert.equal(stock.ok,true,stock.error);
  const locked=await action('gm','manageCampaignShop',[campaignId,'a',{
    type:'configure-opportunity',shopId,stockIndex:0,
    stockIdentity:merchantStockIdentity(stock.shop.stock[0].item),
    minStanding:50,opportunityLabel:'Guild-trained Customers'
  }]);
  assert.equal(locked.ok,true,locked.error);
  assert.equal((await action('alice','buyLiveShopItem',
    [campaignId,'a',shopId,0,1])).ok,false);
  const trust=await action('gm','manageMerchantRelationship',[campaignId,'a',{
    shopId,characterId:'a',score:70,message:'Trusted by the guild'
  }]);
  assert.equal(trust.ok,true,trust.error);
  const bought=await action('alice','buyLiveShopItem',
    [campaignId,'a',shopId,0,1]);
  assert.equal(bought.ok,true,bought.error);
  assert.equal(copper((await live('a')).coins),490);
  await saveStation();
  await saveService();
  const repair=await action('alice','requestNPCRepair',[campaignId,'a',
    {serviceId:'repair',itemId:'blade'}]);
  assert.equal(repair.ok,true,repair.error);
  const approved=await action('gm','reviewNPCRepair',[campaignId,'gm-scope',
    repair.request.id,'approve']);
  assert.equal(approved.ok,true,approved.error);
  const result=await mirrored('a','alice');
  assert.equal(copper(result.coins),415,'Merchant purchase and repair deduct the same wallet');
  assert.equal(result.inventory.find(row=>row.id==='blade').condition,100);
  assert.ok(result.inventory.some(row=>row.name==='Forge Hammer'));
  assert.equal((await db.doc(path('shops',shopId)).get()).data().stock[0].qty,1);
  const blockedBuyer=await action('bob','buyLiveShopItem',
    [campaignId,'b',shopId,0,1]);
  assert.equal(blockedBuyer.ok,false);
});
