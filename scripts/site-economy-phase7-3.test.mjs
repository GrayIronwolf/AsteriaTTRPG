import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {characterCurrencyCopper} from '../frontend/src/economy/economyCurrency.mjs';
import {inventoryProjection,tradeProjection,shopProjection,lootProjection,
  stashProjection,craftingProjection,merchantDealProjection,economyProjection,
  itemProjection,requireEconomyId,requireQuantity} from '../frontend/src/economy/economyModel.mjs';
import {createFirebaseEconomyService} from '../frontend/src/economy/firebaseEconomyService.mjs';

const cid='campaign123',uid='gm123',player='player123',heroId='hero123',
  sourceId='source123',otherId='other123',otherUid='otheruid';
const campaign={id:cid,ownerUid:uid,membershipSchemaVersion:2,name:'Campaign',
  party:[heroId,otherId],playerCharacterLinks:{[heroId]:player,[otherId]:otherUid},
  characters:{[heroId]:{ownerUid:player,name:'Hero'},[otherId]:{ownerUid:otherUid,name:'Other'}}};
const membership={uid:player,campaignId:cid,role:'player',status:'active'};
const hero={id:heroId,ownerUid:player,sourceCharacterId:sourceId,sharedCampaignId:cid,
  status:'linked',name:'Hero',coreRevision:4,level:2,
  storages:[{id:'bag123',name:'Pack',rows:4,cols:4,maxSlots:16}],
  coins:{gold:1,silver:2,copper:3},
  inventory:[{id:'sword123',name:'Iron Sword',type:'Weapon',qty:1,identified:true,
    storageId:'bag123',storageSlot:0,marketPrice:5,marketValue:3},
  {id:'unknown123',name:'Secret Flameblade',trueName:'Secret Flameblade',
    basicName:'Unidentified Blade',identified:false,rarity:'Legendary',
    spell:{name:'Fireball'},effects:{damage:100},qty:1,storageId:'bag123',storageSlot:1}]};
const source={id:sourceId,ownerUid:player,linkedCampaignIds:[cid],
  campaignCharacterIds:{[cid]:heroId}};
const session={id:'session123',status:'active',expiresAt:{seconds:4102444800}};
const trade={id:'trade123',fromOwnerUid:player,toOwnerUid:otherUid,
  fromCharacterId:heroId,toCharacterId:otherId,fromCharacterName:'Hero',
  toCharacterName:'Other',status:'pending',mode:'give',
  item:hero.inventory[0],quantity:1};
const hidden={id:'loot123',status:'available',kind:'item',visibility:'hidden',
  title:'Hidden Treasure',item:{name:'GM-only Relic'}};
const revealed={id:'loot456',status:'available',kind:'currency',visibility:'revealed',
  title:'Copper Coins',currencyCopper:75};
function fixture(as=uid,enabled=true){
  const docs=new Map(Object.entries({
    ['campaigns/'+cid]:campaign,
    ['campaigns/'+cid+'/members/'+player]:membership,
    ['campaigns/'+cid+'/characters/'+heroId]:hero,
    ['users/'+player+'/characters/'+sourceId]:source,
    ['campaigns/'+cid+'/liveSession/current']:session,
    ['campaigns/'+cid+'/checkRequests/not-used']:{}
  }));
  const rows=new Map(Object.entries({
    ['campaigns/'+cid+'/characters']:[hero],
    ['campaigns/'+cid+'/shops']:[{id:'shop123',name:'Smithy',status:'open',
      stock:[{qty:1,item:{id:'sword123',name:'Sword',marketPrice:5,identified:true}}]}],
    ['campaigns/'+cid+'/partyStashes']:[{id:'stash123',name:'Party Chest',items:[]}],
    ['campaigns/'+cid+'/partyLoot']:[revealed],
    ['campaigns/'+cid+'/partyLootDrafts']:[hidden],
    ['campaigns/'+cid+'/itemRequests']:[trade],
    ['campaigns/'+cid+'/merchantDeals']:[],
    ['campaigns/'+cid+'/craftingRecipes']:[{id:'recipe123',name:'Basic Sword',status:'published',
      materials:[{name:'Iron Sword',quantity:1}],output:{name:'Iron Sword',quantity:1}}],
    ['campaigns/'+cid+'/craftingStations']:[],
    ['campaigns/'+cid+'/npcCraftingServices']:[],
    ['campaigns/'+cid+'/craftingRequests']:[],
    ['campaigns/'+cid+'/npcRepairRequests']:[]
  }));
  const callbacks=new Map(),calls=[],auth={currentUser:{uid:as}};
  const snapshot=path=>({id:path.split('/').at(-1),exists:()=>docs.has(path),
    data:()=>docs.get(path),metadata:{fromCache:false,hasPendingWrites:false}});
  const sdk={
    doc:(_db,...path)=>path.join('/'),
    collection:(_db,...path)=>path.join('/'),
    getDocFromServer:async path=>snapshot(path),
    query:(ref,...filters)=>({ref,filters}),
    where:(...v)=>v,limit:x=>x,
    onSnapshot(reference,_options,callback,error){
      const key=typeof reference==='string'?reference:reference.ref;
      callbacks.set(key,{callback,error});
      queueMicrotask(()=>{
        if(!callbacks.has(key))return;
        if(typeof reference==='string')callback(snapshot(key));
        else{
          let entries=rows.get(key)||[];
          for(const filter of reference.filters)if(Array.isArray(filter)&&filter.length===3&&filter[1]==='==')
            entries=entries.filter(x=>x[filter[0]]===filter[2]);
          callback({docs:entries.map(x=>({id:x.id,data:()=>x})),
            metadata:{fromCache:false,hasPendingWrites:false}});
        }
      });
      return()=>callbacks.delete(key);
    }
  };
  const service=createFirebaseEconomyService({
    auth,db:{},firestoreSdk:sdk,functions:{},
    functionsSdk:{httpsCallable:(_fn,name)=>async payload=>{
      calls.push({name,payload});return {data:{ok:true}};
    }},readCanonical:async x=>({uid:x.uid}),enabled
  });
  return {service,calls,callbacks,docs,rows,auth};
}
test('six denomination copper balance and inventory item limits',()=>{
  assert.equal(characterCurrencyCopper(hero),10203);
  const inventory=inventoryProjection(hero);
  assert.equal(inventory.items.length,2);
  assert.equal(inventory.storages[0].itemCount,2);
  assert.equal(inventory.items[1].name,'Unidentified Blade');
  assert.equal(inventory.items[1].type,'Unknown');
  assert.equal(inventory.items[1].transferable,false);
  assert.equal(JSON.stringify(inventory).includes('Secret Flameblade'),false);
  assert.equal(JSON.stringify(inventory).includes('Fireball'),false);
  assert.equal(itemProjection(hero.inventory[1],true).trueName,'Secret Flameblade');
  assert.throws(()=>requireQuantity(0),/quantity/);
  assert.throws(()=>requireEconomyId('../invalid'),/identifier/);
});
test('GM-only drafts and trade-only owner projection',()=>{
  const data={...hero,actionLog:[],id:heroId};
  const state={character:data,session,party:[data],publicParty:[],
    shops:[],trades:[trade,{...trade,id:'othertrade',fromOwnerUid:otherUid,toOwnerUid:'third',
      fromCharacterId:otherId,toCharacterId:'third123'}],
    loot:[hidden,revealed],drafts:[hidden],stashes:[],merchantDeals:[],
    recipes:[],stations:[],services:[],craftingRequests:[],repairRequests:[]};
  const view=economyProjection(state,'player',player,heroId);
  assert.equal(view.loot.length,1);
  assert.equal(view.drafts.length,0);
  assert.equal(view.trades.length,1);
  assert.equal(view.party.length,0);
  assert.equal(view.trades[0].item.name,'Iron Sword');
  assert.equal(economyProjection(state,'gm',uid).drafts.length,1);
  assert.equal(tradeProjection([trade],'player',otherUid,otherId)[0].direction,'received');
});
test('public shop, shared loot and crafting all project immutable player-safe data',()=>{
  assert.equal(stashProjection([{id:'stash123',name:'Shared',items:[hero.inventory[1]]}])[0].items[0].name,
    'Unidentified Blade');
  assert.equal(lootProjection([hidden,revealed],hero,false).length,1);
  assert.equal(merchantDealProjection([{id:'deal123',status:'pending',ownerUid:player}]).length,1);
  const recipes=craftingProjection([{id:'recipe123',name:'Sword',status:'published',
    materials:[{name:'Iron Sword',quantity:1}],output:{name:'Sword',quantity:1}}],'recipes',hero.inventory);
  assert.equal(recipes[0].ready,true);
  assert.equal(shopProjection([{id:'shop123',status:'open',stock:[]}],heroId)[0].canVisit,true);
});
test('disabled service and unauthorised role cannot execute commands',async()=>{
  const off=fixture(uid,false);
  await assert.rejects(off.service.gm(cid,'gm-scope','stash',{type:'create'}),/disabled/);
  const playerService=fixture(player);
  await assert.rejects(playerService.service.gm(cid,'gm-scope','stash',{type:'create'}),/permission/);
  await assert.rejects(playerService.service.player(cid,otherId,'inventory',
    {type:'use',itemId:'sword123'}),/owner|[Ll]ink/);
});
test('players cannot invoke GM actions or direct inventory quantity changes',async()=>{
  const f=fixture(player);
  await assert.rejects(f.service.player(cid,heroId,'shop',{type:'save'}),/Unsupported/);
  await assert.rejects(f.service.player(cid,heroId,'inventory',
    {type:'set-quantity',quantity:100,itemId:'sword123'}),/Invalid player/);
  assert.equal(f.calls.length,0);
});
test('all commands use asteriaAction, fresh request IDs and canonical argument order',async()=>{
  const playerFixture=fixture(player);
  await playerFixture.service.player(cid,heroId,'inventory',{type:'move-storage',
    itemId:'sword123',storageId:'bag123'});
  await playerFixture.service.player(cid,heroId,'tradeCreate',otherId,'sword123','give',{quantity:1});
  await playerFixture.service.player(cid,heroId,'shopBuy','shop123',0,1,{unitPriceCopper:500});
  await playerFixture.service.player(cid,heroId,'craftRequest','recipe123');
  assert.deepEqual(playerFixture.calls.map(x=>x.payload.action),[
    'updateCharacterInventory','createLiveItemRequest','buyLiveShopItem','requestCraftingRecipe'
  ]);
  assert(playerFixture.calls.every(x=>x.name==='asteriaAction'));
  assert.equal(new Set(playerFixture.calls.map(x=>x.payload.requestId)).size,4);
  assert(playerFixture.calls.every(x=>x.payload.args[0]===cid&&x.payload.args[1]===heroId));
  const gm=fixture();
  await gm.service.gm(cid,'gm-scope','stash',{type:'create',stash:{name:'Shared Chest'}});
  await gm.service.gm(cid,'gm-scope','recipe',{type:'save',recipe:{name:'Iron Sword'}});
  assert(gm.calls.every(x=>x.payload.args[1]==='gm-scope'));
});
test('verified live subscriptions are owner-scoped and GM has private hidden drafts',async()=>{
  const p=fixture(player);const messages=[],errors=[];
  const unsubscribe=p.service.watchPlayer(cid,heroId,x=>messages.push(x),e=>errors.push(e));
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(errors.length,0,errors[0]?.message);
  assert(messages.length>0,'verified owner snapshot');
  assert.equal(messages.at(-1).drafts.length,0);
  assert.equal(messages.at(-1).trades.length,1);
  assert.equal(messages.at(-1).loot.length,1);
  assert.equal(messages.at(-1).party.length>0,true);
  assert.equal(p.callbacks.has('campaigns/'+cid+'/partyLootDrafts'),false);
  unsubscribe();assert.equal(p.callbacks.size,0);
  const gm=fixture();const gmResults=[];
  const stop=gm.service.watchGM(cid,x=>gmResults.push(x));
  await new Promise(resolve=>setTimeout(resolve,30));
  assert(gmResults.length>0);
  assert.equal(gmResults.at(-1).drafts.length,1);
  stop();
});
test('main migration is opt-in with one verified Firebase client and no legacy writes',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  assert.match(read('frontend/src/auth/firebaseAuthAdapter.mjs'),
    /VITE_ASTERIA_ECONOMY_ENABLED==='true'/);
  assert.match(read('frontend/src/pages/GMDashboardPage.jsx'),/GMEconomyWorkspace/);
  assert.match(read('frontend/src/pages/PlayerDashboardPage.jsx'),/PlayerEconomyWorkspace/);
  const service=read('frontend/src/economy/firebaseEconomyService.mjs');
  assert.match(service,/httpsCallable\(functions,'asteriaAction'\)/);
  assert.doesNotMatch(service,/window\.AsteriaFirebase|legacyBridge|setDoc\(|updateDoc\(/);
  for(const file of ['frontend/src/economy/EconomyWorkspace.module.css'])
    assert.doesNotMatch(read(file),/!important/);
});
