import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  progressionProjection,skillProjection,publishedTalentCatalog,talentProjection,
  checkProjection,assertCheckPayload,CHECK_TYPES,MILESTONE_LEVELS
} from '../frontend/src/progression/progressionModel.mjs';
import {createFirebaseProgressionService} from '../frontend/src/progression/firebaseProgressionService.mjs';

const cid='campaign123',uid='gm123',player='player123',charId='hero123',sourceId='source123';
const campaign={id:cid,ownerUid:uid,membershipSchemaVersion:2,
  party:[charId],playerCharacterLinks:{[charId]:player},
  characters:{[charId]:{ownerUid:player}}};
const member={uid:player,campaignId:cid,role:'player',status:'active'};
const char={id:charId,ownerUid:player,sourceCharacterId:sourceId,
  sharedCampaignId:cid,status:'linked',name:'Champion',class:'Ranger',
  level:10,xp:200,xpMax:2000,cp:5,tp:18,coreRevision:7,
  characteristics:{strength:20,agility:24},
  skills:[{name:'Athletics',rankName:'Apprentice'}],
  skillProgress:{athletics:{rankName:'Apprentice',successes:2,target:3}}};
const source={id:sourceId,ownerUid:player,linkedCampaignIds:[cid],
  campaignCharacterIds:{[cid]:charId}};
const live={status:'active',id:'session123',expiresAt:{seconds:4102444800}};
const check={id:'check123',campaignId:cid,ownerUid:player,characterId:charId,
  characterName:'Champion',type:'skill',skill:'Athletics',characteristic:'strength',
  dc:15,modifierTotal:3,modifiers:[{label:'Rank',value:0},{label:'GM',value:3}],
  status:'pending',attempt:1};
function harness(as=uid,{enabled=true}={}){
  const docs=new Map(Object.entries({
    ['campaigns/'+cid]:campaign,
    ['campaigns/'+cid+'/members/'+player]:member,
    ['campaigns/'+cid+'/characters/'+charId]:char,
    ['users/'+player+'/characters/'+sourceId]:source,
    ['campaigns/'+cid+'/liveSession/current']:live,
    ['campaigns/'+cid+'/checkRequests/'+check.id]:check
  }));
  const actions=[],auth={currentUser:{uid:as}},listeners=new Map();
  const snapshot=path=>({id:path.split('/').at(-1),exists:()=>docs.has(path),
    data:()=>docs.get(path),metadata:{fromCache:false,hasPendingWrites:false}});
  const sdk={
    doc:(_db,...parts)=>parts.join('/'),
    collection:(_db,...parts)=>parts.join('/'),
    getDocFromServer:async ref=>snapshot(ref),
    where:(...args)=>args,limit:n=>n,orderBy:(...args)=>args,
    query:(ref,...parts)=>({ref,parts}),
    onSnapshot:(ref,_opt,ok)=>{
      const key=typeof ref==='string'?ref:ref.ref;
      listeners.set(key,ok);
      const rows=key.endsWith('/checkRequests')?[{id:check.id,data:()=>check}]:
        key.endsWith('/characters')?[{id:char.id,data:()=>char}]:[];
      queueMicrotask(()=>ok(typeof ref==='string'?snapshot(ref):{
        docs:rows,metadata:{fromCache:false,hasPendingWrites:false}
      }));
      return()=>listeners.delete(key);
    }
  };
  const service=createFirebaseProgressionService({auth,db:{},firestoreSdk:sdk,
    functions:{},functionsSdk:{httpsCallable:(_fn,name)=>async data=>{
      actions.push({name,data});return {data:{ok:true}};
    }},readCanonical:async user=>({uid:user.uid}),enabled});
  return {service,docs,actions,auth,listeners};
}
test('level, milestone feats, CP, TP and skill rank are read-only projections',()=>{
  const p=progressionProjection(char);
  assert.equal(p.level,10);assert.equal(p.tp,18);assert.equal(p.cp,5);
  assert.deepEqual(p.milestoneLevels,[10]);
  assert.deepEqual(MILESTONE_LEVELS,[10,30,50,70,90]);
  assert.equal(p.featSelectionEnabled,false);
  assert.equal(skillProjection(char)[0].rank,'Apprentice');
  assert.equal(skillProjection(char)[0].successes,2);
  assert.equal(CHECK_TYPES.includes('opposed'),true);
});
test('published talent requires authored rank and legitimate class',()=>{
  const ranger={...char,level:10,tp:18};
  const rows=[{domain:'talent',playable:true,title:'Hunting Shots',slug:'hunting-shots',
    id:'talent:ranger-hunting-shots',rules:{classSlug:'Ranger',tier:'1',prerequisite:'None'}}];
  const entry={slug:'hunting-shots',sections:[{title:'Rank I',body:'### Effects\nA valid first rank.'}]};
  const catalog=publishedTalentCatalog(ranger,rows,[entry]);
  assert.equal(catalog.length,1);
  assert.equal(talentProjection(ranger,catalog)[0].canBuy,true);
  assert.equal(publishedTalentCatalog({...ranger,class:'Paladin'},rows,[entry]).length,0);
  const noRank=publishedTalentCatalog(ranger,rows,[]);
  assert.equal(talentProjection(ranger,noRank)[0].canBuy,false);
});
test('check projections isolate one character and retain frozen modifiers',()=>{
  const rows=[check,{...check,id:'check999',characterId:'other999',ownerUid:'other123'}];
  assert.equal(checkProjection(rows,'gm').length,2);
  const playerRows=checkProjection(rows,'player',charId);
  assert.equal(playerRows.length,1);
  assert.equal(playerRows[0].modifierTotal,3);
  assert.equal(playerRows[0].modifiers.length,2);
});
test('role and payload checks deny client-side GM escalation',()=>{
  assert.throws(()=>assertCheckPayload('player',{action:'cancel',requestId:'check123'}),/GM/);
  assert.throws(()=>assertCheckPayload('gm',{action:'create',type:'bad',characterId:charId}),/type/);
  assert.equal(assertCheckPayload('gm',{action:'create',type:'skill',characterId:charId}).action,'create');
});
test('feature gate, GM role, account mismatch, and invalid source reject writes',async()=>{
  const off=harness(uid,{enabled:false});
  await assert.rejects(off.service.awardXP(cid,charId,1000,'Completed quest'),/disabled/);
  const p=harness(player);
  await assert.rejects(p.service.awardXP(cid,charId,1000,'Completed quest'),/role|membership/);
  const gm=harness();
  await assert.rejects(gm.service.awardXP(cid,charId,0,'Bad amount'),/amount/);
  const changed=harness(player);
  changed.docs.set('users/'+player+'/characters/'+sourceId,{...source,ownerUid:'stranger'});
  await assert.rejects(changed.service.spendCP(cid,charId,{strength:1}),/link/);
});
test('trusted callable uses existing asteriaAction methods and fresh receipt IDs',async()=>{
  const gm=harness();
  await gm.service.awardXP(cid,charId,1000,'Completed quest');
  assert.equal(gm.actions[0].name,'asteriaAction');
  assert.equal(gm.actions[0].data.action,'grantCharacterXP');
  assert.deepEqual(gm.actions[0].data.args,[cid,charId,1000,'Completed quest']);
  assert.match(gm.actions[0].data.requestId,/^[a-f0-9-]{36}$/);
  const p=harness(player);
  await p.service.purchaseTalent(cid,charId,{id:'ranger:hunting-shots',
    expectedRank:0,expectedCoreRevision:7});
  await p.service.spendCP(cid,charId,{strength:1});
  await p.service.recordSkill(cid,charId,{name:'Athletics',expectedCoreRevision:7});
  assert.deepEqual(p.actions.map(x=>x.data.action),[
    'purchaseTalentRank','spendCharacteristicAllocations','recordSkillSuccess'
  ]);
  const ids=p.actions.map(x=>x.data.requestId);
  assert.equal(new Set(ids).size,3);
});
test('check requests call existing secured and idempotent Cloud Function',async()=>{
  const gm=harness();
  await gm.service.checkGM(cid,{action:'create',type:'skill',characterId:charId,
    skill:'Athletics',characteristic:'strength',dc:15});
  assert.equal(gm.actions[0].name,'asteriaUniversalCheck');
  assert.equal(gm.actions[0].data.campaignId,cid);
  assert.match(gm.actions[0].data.operationId,/^[a-f0-9-]{36}$/);
  const p=harness(player);
  await p.service.checkPlayer(cid,charId,{action:'submit',requestId:'check123',mode:'digital'});
  assert.equal(p.actions[0].data.mode,'digital');
  await assert.rejects(p.service.checkPlayer(cid,charId,
    {action:'submit',requestId:'missing123',mode:'digital'}),/not addressed/);
  assert.equal(p.actions.length,1);
});
test('source includes one Firebase client, disabled default and no legacy mount',()=>{
  const get=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const adapter=get('frontend/src/auth/firebaseAuthAdapter.mjs');
  assert.match(adapter,/VITE_ASTERIA_PROGRESSION_ENABLED==='true'/);
  assert.match(get('frontend/src/pages/GMDashboardPage.jsx'),/<GMChecksAndProgression/);
  assert.match(get('frontend/src/pages/PlayerDashboardPage.jsx'),/<PlayerCheckRequests/);
  assert.match(get('frontend/src/progression/firebaseProgressionService.mjs'),
    /httpsCallable\(functions,'asteriaUniversalCheck'\)/);
  assert.match(get('functions/characterPermissions.mjs'),/grantCharacterXP/);
  assert.match(get('functions/commands.mjs'),/grantCharacterXP: async function/);
  assert.doesNotMatch(get('frontend/src/progression/firebaseProgressionService.mjs'),
    /window\.AsteriaFirebase|legacyBridge|setDoc\(|updateDoc\(/);
});
