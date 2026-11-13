import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {universalCheckAction} from '../functions/universalCheckCommands.mjs';
import {resolveUniversalCheckContext} from '../functions/universalCheckContext.mjs';

function fixture(){
  const campaign={id:'c',ownerUid:'gm',membershipSchemaVersion:2,
    playerCharacterLinks:{hero:'alice',friend:'bob'}};
  const sheet=(id,ownerUid)=>({id,ownerUid,name:id,sharedCampaignId:'c',
    characteristics:{charisma:60,wisdom:40,strength:40},
    skills:[{name:'Persuasion',rankName:'Expert',primaryStat:'charisma'},
      {name:'Haggling',rankName:'Expert',primaryStat:'charisma'}]});
  const store=new Map([
    ['campaigns/c',campaign],
    ['campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:'active'}],
    ['campaigns/c/members/bob',{uid:'bob',campaignId:'c',role:'player',status:'active'}],
    ['campaigns/c/characters/hero',sheet('hero','alice')],
    ['campaigns/c/characters/friend',sheet('friend','bob')],
    ['campaigns/c/systems/gmWorkspace',{world:{npcs:[{id:'npc-one',name:'Archivist'}]}}],
    ['campaigns/c/shops/shop-one',{id:'shop-one',name:'Blacksmith',status:'open',
      currencyCopper:5000,stock:[{qty:5,item:{name:'Axe'}}],npcId:'npc-one'}],
    ['campaigns/c/merchantDeals/deal-one',{id:'deal-one',shopId:'shop-one',
      characterId:'hero',ownerUid:'alice',status:'pending',
      quantity:1,stockItemName:'Axe',offeredCopper:400,listedTotalCopper:500,
      expiresAt:Date.now()+86400000}]
  ]);
  const db={store,doc:path=>({path}),async runTransaction(fn){
    const writes=[];
    const tx={
      async get(ref){const value=store.get(ref.path);
        return {exists:value!==undefined,data:()=>structuredClone(value)};
      },
      create(ref,value){if(store.has(ref.path)||writes.some(([p])=>p===ref.path))throw Error('Duplicate document.');
        writes.push([ref.path,structuredClone(value)]);
      },
      update(ref,patch){const before=store.get(ref.path);
        if(!before)throw Error('Missing document.');
        writes.push([ref.path,{...structuredClone(before),...structuredClone(patch)}]);
      }
    };
    const result=await fn(tx);
    for(const [key,value] of writes)store.set(key,value);
    return result;
  }};
  return db;
}
const action=(db,uid,args)=>universalCheckAction(db,uid,{
  campaignId:'c',operationId:randomUUID(),...args
},()=>new Date('2026-11-14T00:00:00.000Z'));
const create=(db,context,more={})=>action(db,'gm',{
  action:'create',type:'social',characterId:'hero',skill:'Haggling',
  characteristic:'charisma',dc:15,context,...more
});
const check=(db,id)=>db.store.get('campaigns/c/checkRequests/'+id);

test('NPC context uses authoritative campaign NPC names, not client labels',async()=>{
  const db=fixture();
  const created=await create(db,{kind:'npc',npcId:'npc-one',label:'Forged name'});
  assert.equal(check(db,created.id).context.label,'Archivist');
  assert.equal(check(db,created.id).npcName,'Archivist');
  await assert.rejects(create(db,{kind:'npc',npcId:'missing',label:'Ghost'}),/no longer in this campaign/);
  await assert.rejects(create(db,{kind:'npc',npcId:'bad/slug'}),/existing campaign NPC/);
});

test('merchant checks resolve existing shop metadata and reject deleted shops',async()=>{
  const db=fixture();
  const created=await create(db,{kind:'merchant',shopId:'shop-one',label:'Cheaper wares'});
  assert.equal(check(db,created.id).context.label,'Blacksmith');
  assert.equal(check(db,created.id).context.npcId,'npc-one');
  db.store.get('campaigns/c/shops/shop-one').deleted=true;
  await assert.rejects(create(db,{kind:'merchant',shopId:'shop-one'}),/no longer exists/);
});
test('merchant deal context requires a current pending offer owned by target character',async()=>{
  const db=fixture(),source={kind:'merchant-deal',shopId:'shop-one',dealId:'deal-one'};
  const created=await create(db,source);
  assert.equal(check(db,created.id).context.offerCopper,400);
  assert.equal(check(db,created.id).context.listedCopper,500);
  assert.ok(check(db,created.id).context.detail.includes('Axe'));
  await assert.rejects(create(db,source,{characterId:'friend'}),/does not own this offer/);
  await assert.rejects(create(db,source,{type:'skill'}),/uses a social skill check/);
  db.store.get('campaigns/c/merchantDeals/deal-one').status='approved';
  await assert.rejects(create(db,source),/no longer pending/);
});
test('expired and mismatched merchant offers cannot be linked',async()=>{
  const db=fixture();
  const deal=db.store.get('campaigns/c/merchantDeals/deal-one');
  deal.shopId='other-shop';
  await assert.rejects(create(db,{kind:'merchant-deal',shopId:'shop-one',dealId:'deal-one'}),/does not belong/);
  deal.shopId='shop-one';deal.expiresAt=Date.now()-10000;
  await assert.rejects(create(db,{kind:'merchant-deal',shopId:'shop-one',dealId:'deal-one'}),/expired/);
});
test('contextual checks do not alter stock, offers, currency, standing or NPC data',async()=>{
  const db=fixture();
  const keys=['campaigns/c/shops/shop-one','campaigns/c/merchantDeals/deal-one',
    'campaigns/c/systems/gmWorkspace'];
  const before=keys.map(key=>structuredClone(db.store.get(key)));
  const created=await create(db,{kind:'merchant-deal',shopId:'shop-one',dealId:'deal-one'});
  const submitted=await action(db,'alice',{action:'submit',requestId:created.id,mode:'physical',die:18});
  assert.equal(submitted.result.success,true);
  await action(db,'gm',{action:'override',requestId:created.id,outcome:'failure',reason:'Merchant declines'});
  assert.equal(check(db,created.id).gmOutcome,'failure');
  keys.forEach((key,index)=>assert.deepEqual(db.store.get(key),before[index]));
});
test('only a campaign GM can create context-specific requests',async()=>{
  const db=fixture();
  await assert.rejects(action(db,'alice',{action:'create',type:'social',
    characterId:'hero',skill:'Haggling',characteristic:'charisma',dc:15,
    context:{kind:'merchant-deal',shopId:'shop-one',dealId:'deal-one'}}),/GM permission/);
  await assert.rejects(create(db,{kind:'npc',npcId:'npc-one',arbitrary:'value'},{characterId:'missing'}),/Character is not linked/);
});
test('gameplay contexts are bounded GM-labelled activities and can use group checks',async()=>{
  const db=fixture();
  const created=await create(db,{kind:'gameplay',label:'Scouting the ruins'},
    {type:'group',characterIds:['hero','friend'],skill:'Persuasion'});
  assert.equal(created.ids.length,2);
  assert.equal(check(db,created.ids[1]).context.label,'Scouting the ruins');
  await assert.rejects(create(db,{kind:'gameplay',label:'a'}),/3–120 characters/);
  await assert.rejects(create(db,{kind:'unknown',label:'Surprise'}),/Unknown check source/);
});
test('merchant deal context works only for a single social check',async()=>{
  const db=fixture(),src={kind:'merchant-deal',shopId:'shop-one',dealId:'deal-one'};
  await assert.rejects(create(db,src,{type:'opposed',characterIds:['hero','friend'],dc:0}),/social skill/);
  const snap={exists:true,data:()=>db.store.get('campaigns/c/shops/shop-one')};
  const tx={get:async ref=>ref.path==='campaigns/c/shops/shop-one'?snap:{
    exists:true,data:()=>db.store.get(ref.path)}};
  const resolved=await resolveUniversalCheckContext(tx,db,'c',src,['hero'],'social');
  assert.equal(resolved.kind,'merchant-deal');
});
