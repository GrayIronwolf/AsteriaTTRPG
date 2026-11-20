import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  projectCombat,eligiblePlayerCombatants,customEnemy,combatRevision,
  validateCombatCommand,COMBAT_AP_ACTIONS,gmEncounterCandidates
} from '../frontend/src/combat/combatModel.mjs';
import {createFirebaseCombatService} from '../frontend/src/combat/firebaseCombatService.mjs';

const cid='campaign123',uid='owner123',player='player123',charId='hero123';
const campaign={id:cid,ownerUid:uid,membershipSchemaVersion:2,name:'Campaign',
  party:[charId],playerCharacterLinks:{[charId]:player},
  characters:{[charId]:{ownerUid:player}}};
const member={uid:player,campaignId:cid,role:'player',status:'active'};
const source={id:'source123',ownerUid:player,linkedCampaignIds:[cid],
  campaignCharacterIds:{[cid]:charId}};
const character={id:charId,ownerUid:player,sourceCharacterId:source.id,
  status:'linked',sharedCampaignId:cid,name:'Player Hero',hp:[15,25],sp:[8,12],mp:[3,9]};
const live={id:'session-123',status:'active',expiresAt:{seconds:4102444800}};
const encounter={
  status:'active',round:2,turnIndex:0,combatId:'combat123',
  combatants:[{id:'player-'+charId,kind:'player',characterId:charId,
    name:'Player Hero',initiative:18},
  {id:'enemy123',kind:'enemy',name:'Hidden Enemy',initiative:7,hp:[20,30]}],
  combat:{version:1,revision:4,participants:{
    ['player-'+charId]:{ap:2,bonus:true,turnComplete:false},
    enemy123:{ap:3,bonus:true}
  },log:[{id:'log123',message:'Hidden private GM message'}]}
};

function harness(as=uid,options={}){
  const docs=new Map(Object.entries({
    ['campaigns/'+cid]:campaign,
    ['campaigns/'+cid+'/members/'+player]:member,
    ['campaigns/'+cid+'/characters/'+charId]:character,
    ['users/'+player+'/characters/'+source.id]:source,
    ['campaigns/'+cid+'/systems/encounter']:encounter,
    ['campaigns/'+cid+'/liveSession/current']:live,
    ['campaigns/'+cid+'/systems/gmWorkspace']:{combatState:{pending:null}},
    ...options.docs
  }));
  const calls=[],watchers=new Map(),auth={currentUser:{uid:as}};
  const ref=(_db,...path)=>path.join('/');
  const snapshot=(path)=>({
    id:path.split('/').at(-1),exists:()=>docs.has(path),data:()=>docs.get(path),
    metadata:{fromCache:false,hasPendingWrites:false}
  });
  const sdk={
    doc:ref,collection:ref,getDocFromServer:async path=>snapshot(path),
    onSnapshot(path,_options,next,error){
      watchers.set(path,{next,error});
      const data=docs.get(path);
      const snap=path==='campaigns/'+cid+'/characters'
        ?{docs:data?.docs||[],metadata:{fromCache:false,hasPendingWrites:false}}
        :snapshot(path);
      queueMicrotask(()=>next(snap));
      return()=>watchers.delete(path);
    }
  };
  const service=createFirebaseCombatService({
    auth,db:{},firestoreSdk:sdk,functions:{},
    functionsSdk:{httpsCallable:(_fn,name)=>{
      assert.equal(name,'asteriaAction');
      return async payload=>{
        calls.push(payload);
        return {data:{ok:true,revision:payload.args[2].revision+1}};
      };
    }},
    readCanonical:async user=>({uid:user.uid}),enabled:options.enabled??true
  });
  return {service,docs,calls,auth,watchers};
}

test('Phase 7.1 uses canonical encounter revision, initiative order, AP and resources',()=>{
  const data=projectCombat(encounter,live,{role:'gm',party:[character]});
  assert.equal(data.isActive,true);
  assert.equal(data.revision,4);
  assert.equal(data.round,2);
  assert.equal(data.current.id,'player-'+charId);
  assert.deepEqual([data.current.hp,data.current.sp,data.current.mp],
    [[15,25],[8,12],[3,9]]);
  assert.equal(data.current.ap,2);
  assert.equal(data.current.bonus,true);
  assert.equal(COMBAT_AP_ACTIONS.length,4);
  assert.equal(combatRevision({combat:{revision:7}}),7);
});
test('combat projection exposes the original authoritative turn timer without adding commands',()=>{
  const endsAt=4102444800000;
  const liveTimer={...encounter,turnTimer:{enabled:true,endsAt}};
  const gm=projectCombat(liveTimer,live,{role:'gm',party:[character]});
  const playerView=projectCombat(liveTimer,live,{role:'player',characterId:charId,party:[character]});
  assert.deepEqual(gm.turnTimer,{enabled:true,endsAt});
  assert.deepEqual(playerView.turnTimer,{enabled:true,endsAt});
  const disabled=projectCombat({...encounter,timer:{enabled:false,endsAt}},live,{role:'player',characterId:charId,party:[character]});
  assert.deepEqual(disabled.turnTimer,{enabled:false,endsAt});
  const empty=projectCombat(encounter,live,{role:'player',characterId:charId,party:[character]});
  assert.deepEqual(empty.turnTimer,{enabled:false,endsAt:0});
  assert.equal(COMBAT_PLAYER_COMMANDS.length,3);
});
test('player projection hides enemy resources, GM-only logs and unowned AP',()=>{
  const data=projectCombat(encounter,live,{role:'player',characterId:charId,party:[character]});
  assert.equal(data.ownActor.id,'player-'+charId);
  assert.equal(data.current.ap,2);
  assert.equal(data.current.hp[0],15);
  assert.equal(Object.hasOwn(data,'log'),false);
  assert.equal(Object.hasOwn(data,'battleMapId'),false);
  const enemy=data.combatants.find(row=>row.id==='enemy123');
  assert.equal(Object.hasOwn(enemy,'ap'),false);
  assert.equal(Object.hasOwn(enemy,'hp'),false);
  assert.equal(Object.hasOwn(enemy,'sp'),false);
  assert.equal(Object.hasOwn(enemy,'mp'),false);
  const hidden=projectCombat({...encounter,combatants:[]},live,{role:'player'});
  assert.equal(hidden.ownActor,null);
});
test('GM can add verified linked players, excludes existing and rejects stale links',()=>{
  const eligible=eligiblePlayerCombatants(campaign,[character],[]);
  assert.equal(eligible.length,1);
  assert.equal(eligible[0].characterId,charId);
  assert.equal(eligiblePlayerCombatants(campaign,[character],encounter.combatants).length,0);
  assert.equal(eligiblePlayerCombatants({...campaign,party:[]},[character],[]).length,0);
  assert.equal(eligiblePlayerCombatants(campaign,[{...character,status:'inactive'}],[]).length,0);
});
test('custom enemy validates HP, optional initiative and source candidates',()=>{
  const result=customEnemy({name:'Basilisk',type:'Creature',hp:30,xpReward:50,initiative:12},'enemy42');
  assert.deepEqual(result.hp,[30,30]);
  assert.equal(result.initiativeSet,true);
  assert.throws(()=>customEnemy({name:'',hp:2,xpReward:1},'enemy42'),/name/i);
  const list=gmEncounterCandidates({creatures:[{id:'beast123',name:'Basilisk',hp:[8,16]}]});
  assert.equal(list.length,1);
  assert.equal(list[0].hp[1],16);
});
test('combat mutation allowlist rejects player GM operations and invalid AP',()=>{
  assert.throws(()=>validateCombatCommand('player','player-hero123',
    {operation:'save',revision:4}),/unavailable/);
  assert.throws(()=>validateCombatCommand('player','player-hero123',
    {operation:'spend-ap',revision:4,ap:4}),/whole AP/);
  assert.throws(()=>validateCombatCommand('gm','encounter',
    {operation:'correct',revision:4,reason:''}),/reason/);
  assert.equal(validateCombatCommand('gm','encounter',
    {operation:'next',revision:4}).operation,'next');
});
test('feature flag and current canonical profile deny unauthorized use',async()=>{
  const off=harness(uid,{enabled:false});
  await assert.rejects(off.service.commandGM(cid,'encounter',
    {operation:'next',revision:4}),/disabled/);
  const intruder=harness('stranger123');
  await assert.rejects(intruder.service.commandGM(cid,'encounter',
    {operation:'next',revision:4}),/permission/);
  const memberPlayer=harness(player);
  await assert.rejects(memberPlayer.service.commandGM(cid,'encounter',
    {operation:'next',revision:4}),/permission/);
  await assert.rejects(memberPlayer.service.commandPlayer(cid,charId,'enemy123',
    {operation:'spend-ap',revision:4,ap:1}),/not linked/);
  assert.equal(memberPlayer.calls.length,0);
});
test('GM command uses existing authenticated server transaction and no separate writes',async()=>{
  const gm=harness();
  const result=await gm.service.commandGM(cid,'encounter',{operation:'next',revision:4});
  assert.equal(result.ok,true);
  assert.equal(gm.calls.length,1);
  assert.equal(gm.calls[0].action,'combatCommand');
  assert.deepEqual(gm.calls[0].args,[cid,'encounter',{operation:'next',revision:4}]);
  assert.match(gm.calls[0].requestId,/^[0-9a-f-]{36}$/);
  await assert.rejects(gm.service.commandGM(cid,'encounter',
    {operation:'next',revision:3}),/another session/);
  assert.equal(gm.calls.length,1);
});
test('player may use only their own combatant with verified v2 source',async()=>{
  const p=harness(player);
  await p.service.commandPlayer(cid,charId,'player-'+charId,
    {operation:'spend-ap',revision:4,ap:1});
  assert.equal(p.calls.length,1);
  p.docs.set('campaigns/'+cid+'/members/'+player,{...member,status:'inactive'});
  await assert.rejects(p.service.commandPlayer(cid,charId,'player-'+charId,
    {operation:'end-turn',revision:4}),/membership|permission/);
  assert.equal(p.calls.length,1);
});
test('React source uses a single adapter, CSS module and no legacy globals',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  for(const path of ['frontend/src/combat/CombatWorkspace.jsx',
    'frontend/src/combat/firebaseCombatService.mjs',
    'frontend/src/auth/firebaseAuthAdapter.mjs',
    'frontend/src/pages/GMDashboardPage.jsx',
    'frontend/src/pages/PlayerDashboardPage.jsx']){
    assert.doesNotMatch(read(path),/window\.AsteriaFirebase|legacyBridge/);
  }
  assert.match(read('frontend/src/auth/firebaseAuthAdapter.mjs'),
    /VITE_ASTERIA_COMBAT_ENABLED==='true'/);
  assert.match(read('frontend/src/pages/GMDashboardPage.jsx'),/<GMCombatWorkspace/);
  assert.match(read('frontend/src/pages/PlayerDashboardPage.jsx'),/<PlayerCombatWorkspace/);
  assert.match(read('frontend/src/combat/firebaseCombatService.mjs'),
    /httpsCallable\(functions,'asteriaAction'\)/);
});
