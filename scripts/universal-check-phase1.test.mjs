import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {universalCheckAction} from '../functions/universalCheckCommands.mjs';
import {UNIVERSAL_CHECK_RANKS,universalAutomaticModifiers,universalCheckOutcome,
  universalDiceChoice,universalGroupAdjudication,universalSkillRankModifier} from '../src/state/universalCheckModel.mjs';

function fixture(){
  const campaign={id:'campaign',ownerUid:'gm',membershipSchemaVersion:2,
    playerCharacterLinks:{a:'alice',b:'bob',c:'cara'}};
  const sheet=(id,uid)=>({id,ownerUid:uid,sharedCampaignId:'campaign',
    name:id,characteristics:{dexterity:60,strength:40},
    skills:[{name:'Stealth',rankName:'Expert',primaryStat:'dexterity'}],
    sp:[10,20]});
  const store=new Map([['campaigns/campaign',campaign]]);
  for(const [uid,role] of [['alice','player'],['bob','player'],['cara','player'],['co','co-gm']]){
    store.set('campaigns/campaign/members/'+uid,{uid,role,campaignId:'campaign',status:'active'});
  }
  for(const [id,uid] of [['a','alice'],['b','bob'],['c','cara']])
    store.set('campaigns/campaign/characters/'+id,sheet(id,uid));
  const db={store,doc:path=>({path}),async runTransaction(fn){
    const pending=new Map();
    const tx={
      async get(ref){const value=store.get(ref.path);return {exists:value!==undefined,
        data:()=>structuredClone(value)};},
      create(ref,value){if(store.has(ref.path)||pending.has(ref.path))throw Error('Duplicate document');
        pending.set(ref.path,structuredClone(value));},
      update(ref,patch){const value=pending.get(ref.path)||store.get(ref.path);
        if(!value)throw Error('Missing document');
        pending.set(ref.path,{...structuredClone(value),...structuredClone(patch)});}
    };
    const result=await fn(tx);
    for(const [key,value] of pending)store.set(key,value);
    return result;
  }};
  return db;
}
const command=(db,uid,action,values={},operationId=randomUUID())=>universalCheckAction(db,uid,{
  campaignId:'campaign',action,operationId,...values
},()=>new Date('2026-11-14T00:00:00.000Z'));
const create=(db,extra={})=>command(db,'gm','create',{type:'skill',characterId:'a',skill:'Stealth',
  characteristic:'dexterity',dc:15,...extra});
const row=(db,id)=>db.store.get('campaigns/campaign/checkRequests/'+id);
const group=(db,id)=>db.store.get('campaigns/campaign/checkGroups/'+id);

test('approved rank table and modifier breakdown use characteristic tiers, not raw scores',()=>{
  assert.deepEqual(Object.values(UNIVERSAL_CHECK_RANKS),[-2,-1,0,1,2,3,4,5]);
  assert.equal(universalSkillRankModifier('Expert'),3);
  assert.throws(()=>universalSkillRankModifier(4),/legacy numeric/);
  const character=fixture().store.get('campaigns/campaign/characters/a');
  const result=universalAutomaticModifiers(character,{skill:'Stealth',characteristic:'dexterity'});
  assert.equal(result.total,6);
  assert.equal(result.entries[0].value,3);
  assert.equal(result.entries[1].value,3);
});
test('active equipment, talent, condition and check advantages are frozen by source',()=>{
  const character=fixture().store.get('campaigns/campaign/characters/a');
  character.equipment={head:{id:'hat',name:'Hat',effects:[{name:'Headwear',target:'skills.stealth',operation:'ADD',value:2}]}};
  character.conditions=[{id:'fatigue',name:'Fatigue',effects:[{target:'skills',operation:'SUBTRACT',value:1},
    {target:'skills.stealth',operation:'DISADVANTAGE'}]}];
  character.talentEffects=[{id:'alert',name:'Alertness',target:'checks',operation:'ADVANTAGE'}];
  const result=universalAutomaticModifiers(character,{skill:'Stealth',characteristic:'dexterity',advantage:true});
  assert.equal(result.total,7);
  assert.equal(result.advantage,false);
  assert.equal(result.disadvantage,false);
  assert.ok(result.entries.some(entry=>entry.label.includes('Headwear')));
  assert.ok(result.entries.some(entry=>entry.label.includes('Fatigue')));
});
test('digital/physical d20 selection and natural critical rules',()=>{
  assert.equal(universalDiceChoice(4,19,true).die,19);
  assert.equal(universalDiceChoice(4,19,false,true).die,4);
  assert.equal(universalDiceChoice(4,19,true,true).second,null);
  assert.throws(()=>universalDiceChoice(20,undefined,true),/Both d20/);
  assert.equal(universalCheckOutcome(1,500,5).outcome,'critical-failure');
  assert.equal(universalCheckOutcome(20,-100,30).outcome,'critical-success');
});
test('GM creates, owner submits physical dice, GM acknowledges, overrides and rerolls without losing history',async()=>{
  const db=fixture(),created=await create(db);
  assert.equal(created.ok,true);
  assert.equal(row(db,created.id).modifierTotal,6);
  await assert.rejects(command(db,'bob','submit',{requestId:created.id,mode:'digital'}),/Only the target/);
  await assert.rejects(command(db,'alice','submit',{requestId:created.id,mode:'physical',die:21}),/valid first/);
  const result=await command(db,'alice','submit',{requestId:created.id,mode:'physical',die:12});
  assert.equal(result.result.total,18);
  assert.equal(row(db,created.id).selfReported,true);
  await assert.rejects(command(db,'alice','acknowledge',{requestId:created.id}),/GM permission/);
  await command(db,'gm','acknowledge',{requestId:created.id});
  await command(db,'gm','override',{requestId:created.id,outcome:'failure',reason:'Distraction'});
  assert.equal(row(db,created.id).gmOutcome,'failure');
  await command(db,'gm','reroll',{requestId:created.id});
  assert.equal(row(db,created.id).history.length,1);
  assert.equal(row(db,created.id).status,'pending');
  assert.equal(row(db,created.id).history[0].result.total,18);
});
test('transactions safely return duplicate create and digital roll receipts',async()=>{
  const db=fixture(),op=randomUUID();
  const params={type:'skill',characterId:'a',skill:'Stealth',characteristic:'dexterity',dc:15};
  const a=await command(db,'gm','create',params,op);
  const b=await command(db,'gm','create',params,op);
  assert.deepEqual(b,a);
  assert.equal([...db.store.keys()].filter(k=>k.includes('/checkRequests/')).length,1);
  await assert.rejects(command(db,'gm','create',{...params,dc:16},op),/reused/);
  const rollId=randomUUID();
  const x=await command(db,'alice','submit',{requestId:a.id,mode:'digital'},rollId);
  const y=await command(db,'alice','submit',{requestId:a.id,mode:'digital'},rollId);
  assert.deepEqual(y,x);
  await assert.rejects(command(db,'alice','submit',{requestId:a.id,mode:'digital'}),/no longer pending/);
});
test('group requests collect separate participant results, adjudicate and synchronize rerolls',async()=>{
  const db=fixture();
  const created=await create(db,{type:'group',characterIds:['a','b','c'],requiredSuccesses:2});
  assert.equal(created.ids.length,3);
  await command(db,'alice','submit',{requestId:created.ids[0],mode:'manual',reported:'success'});
  await command(db,'bob','submit',{requestId:created.ids[1],mode:'manual',reported:'failure'});
  assert.equal(group(db,created.groupId).status,'pending');
  await command(db,'cara','submit',{requestId:created.ids[2],mode:'manual',reported:'success'});
  assert.equal(group(db,created.groupId).adjudication.outcome,'success');
  assert.equal(row(db,created.ids[0]).groupOutcome.successes,2);
  await command(db,'gm','reroll',{requestId:created.ids[0]});
  assert.equal(group(db,created.groupId).status,'pending');
  for(const id of created.ids){
    assert.equal(row(db,id).status,'pending');
    assert.equal(row(db,id).history.length,1);
  }
});
test('opposed checks resolve winner and ties without leaking counterpart dice in other rows',async()=>{
  const db=fixture();
  const created=await create(db,{type:'opposed',characterIds:['a','b'],dc:0});
  await assert.rejects(command(db,'alice','submit',{requestId:created.ids[0],mode:'manual',reported:'success'}),/numeric dice/);
  await command(db,'alice','submit',{requestId:created.ids[0],mode:'physical',die:12});
  await command(db,'bob','submit',{requestId:created.ids[1],mode:'physical',die:12});
  assert.equal(group(db,created.groupId).adjudication.outcome,'tie');
  assert.equal(row(db,created.ids[0]).dice.die,12);
  assert.equal(row(db,created.ids[0]).result.total,18);
  assert.equal(row(db,created.ids[0]).groupOutcome.tie,true);
  assert.equal(universalGroupAdjudication('opposed',[
    {id:'x',result:{die:20,total:21}},{id:'y',result:{die:10,total:40}}
  ]).winnerId,'x');
});
test('membership, linkage and GM authorisation cannot be bypassed',async()=>{
  const db=fixture();
  await assert.rejects(command(db,'alice','create',{type:'skill',characterId:'a',skill:'Stealth',characteristic:'dexterity',dc:10}),/GM permission/);
  db.store.get('campaigns/campaign/members/alice').status='suspended';
  await assert.rejects(create(db),/not an active campaign member/);
  db.store.get('campaigns/campaign/members/alice').status='active';
  db.store.get('campaigns/campaign/characters/a').ownerUid='eve';
  await assert.rejects(create(db),/not linked/);
});
test('legacy numeric skill ranks require a GM-approved named conversion',async()=>{
  const db=fixture();
  db.store.get('campaigns/campaign/characters/a').skills=[{name:'Stealth',rank:4,primaryStat:'dexterity'}];
  await assert.rejects(create(db),/legacy numeric rank/);
  const approved=await create(db,{rankOverride:'Expert'});
  assert.equal(row(db,approved.id).modifierTotal,6);
});
