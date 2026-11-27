import {hybridD20,validateHybridPhysicalDice} from '../src/state/hybridCombatDiceModel.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PHYSICAL_DICE_FACES,validatePhysicalDiceRecord}
  from '../src/state/hybridPhysicalDiceModel.mjs';
import {battleMapTokens} from '../src/state/battleMapModel.mjs';
import {publicPresentationBattleMap} from '../src/state/livePresentationProjectionModel.mjs';
import {captureEncounterRecovery} from '../functions/encounterRecovery.mjs';
import {hybridViewerCanRead,restrictedPresentationProjection}
  from '../src/state/hybridPresentationSessionModel.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const player={id:'hero',characterId:'char1',kind:'player',name:'Lyris'};
const enemy={id:'orc',kind:'enemy',name:'Hidden orc'};
const input={operation:'record-physical-roll',revision:2,targetId:'hero',
  faces:20,result:17,reason:'Verified attack roll'};
test('3.6 acceptance: GM witnessed physical die records are bounded and allowlisted',()=>{
  assert.deepEqual(PHYSICAL_DICE_FACES,[4,6,8,10,12,20,100]);
  assert.deepEqual(validatePhysicalDiceRecord(input,[player,enemy]),{
    targetId:'hero',faces:20,result:17,reason:'Verified attack roll'
  });
  for(const invalid of [
    {...input,faces:3},{...input,faces:20,result:21},
    {...input,result:1.5},{...input,result:0},{...input,result:'17'},
    {...input,targetId:'missing'},{...input,targetId:'__proto__'},
    {...input,reason:'  '},{...input,reason:'x'.repeat(161)},
    {...input,secretEffect:'damage'},{...input,operation:'correct'}
  ])assert.throws(()=>validatePhysicalDiceRecord(invalid,[player,enemy]));
});
test('3.6 acceptance: GM-only physical observations use authoritative combat revision and audit',()=>{
  const backend=source('functions/combatCommands.mjs');
  const workspace=source('src/dashboards/combat/CombatWorkspace.jsx');
  assert.match(backend,/management=new Set\(\['record-physical-roll'/);
  assert.match(backend,/validatePhysicalDiceRecord\(input,encounter\.combatants\)/);
  assert.match(backend,/rollSource:'physical-gm-verified'/);
  assert.match(backend,/encounter\.combat\.revision=oldRevision\+1/);
  assert.match(backend,/tx\.set\(encounterRef/);
  assert.match(workspace,/data-testid="site-hybrid-physical-dice"/);
  assert.match(workspace,/operation:'record-physical-roll'/);
  assert.match(workspace,/revision:combat\.revision/);
  assert.doesNotMatch(source('src/state/hybridPhysicalDiceModel.mjs'),
    /changeCombatHP|applyResourceChanges|spendMapMovement/);
});
test('3.6 acceptance: token visibility blocks hidden enemy markers even without fog',()=>{
  const raw={id:'map3',visibility:'players',kind:'image',contentType:'image/png',
    storagePath:'campaigns/camp3/battleMaps/map3/scene.png',width:1000,height:1000,
    gridColumns:2,gridRows:2,fogEnabled:false,tokens:[
      {id:'hero-marker',kind:'character',label:'Lyris',x:10,y:10},
      {id:'secret-marker',kind:'creature',label:'Secret Ork',x:90,y:90,
        visibility:'gm'}
    ]};
  const projection=publicPresentationBattleMap(raw,'camp3','map3');
  assert.deepEqual(projection.tokens.map(row=>row.id),['hero-marker']);
  assert.doesNotMatch(JSON.stringify(projection),/Secret Ork|secret-marker/);
  const publicTokens=battleMapTokens(raw.tokens.map(row=>row.id==='secret-marker'?
    {...row,visibility:'players'}:row));
  const visible=publicPresentationBattleMap({...raw,tokens:publicTokens},'camp3','map3');
  assert.deepEqual(visible.tokens.map(row=>row.id),['hero-marker','secret-marker']);
  const editor=source('src/dashboards/presentation/CampaignMapWorkspace.jsx');
  const combatMap=source('src/dashboards/combat/CombatBattleMapPanel.jsx');
  assert.match(editor,/data-testid="gm-map-token-visibility"/);
  assert.match(combatMap,/data-testid="gm-active-token-visibility"/);
  assert.match(combatMap,/operation:'map-token-appearance'/);
});
test('3.6 acceptance: reconnection rejects expired or revoked viewer grants',()=>{
  const now=Date.now();
  const session={status:'open',epoch:'session3',expiresAt:new Date(now+60000)};
  const grant={uid:'viewer3',epoch:'session3',status:'active',
    expiresAt:new Date(now+20000)};
  assert.equal(hybridViewerCanRead(session,grant,'viewer3',now),true);
  assert.equal(hybridViewerCanRead({...session,status:'closed'},grant,'viewer3',now),false);
  assert.equal(hybridViewerCanRead(session,{...grant,status:'revoked'},'viewer3',now),false);
  assert.equal(hybridViewerCanRead(session,grant,'viewer3',now+20001),false);
  assert.equal(restrictedPresentationProjection({scene:'party',characterIds:['private']}).scene,'blank');
  const service=source('src/dashboards/presentation/firebaseCampaignMediaService.mjs');
  const reconnect=source('src/dashboards/presentation/usePresentationDisplayRuntime.js');
  assert.match(service,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(service,/hybridViewerCanRead/);
  for(const event of ['visibilitychange','online','offline','pageshow'])
    assert.ok(reconnect.includes(event));
});
test('3.6 acceptance: recovery checkpoint retains fog and combat logs without private pending actions',()=>{
  const now=Date.now();
  const checkpoint=captureEncounterRecovery({
    status:'active',combatId:'combat3',battleMapId:'map3',
    combat:{version:1,revision:8,pending:{secret:'UNRESOLVED'},log:[
      {id:'verified3',message:'GM verified physical d20 roll'}]},
    turnTimer:{enabled:false,endsAt:null}
  },{pending:{secret:'DO_NOT_REPLAY'},preparedDetails:{rewardNotes:'GM_PRIVATE'}},
  {combatId:'combat3',gridColumns:2,gridRows:2,metresPerCell:1,
    tokens:[],fogEnabled:true,fogCells:'1100'},now);
  assert.equal(checkpoint.encounter.combat.pending,null);
  assert.equal(checkpoint.map.fogCells,'1100');
  assert.equal(checkpoint.privateState.pending,undefined);
  assert.equal(checkpoint.encounter.combat.log[0].id,'verified3');
  const recovery=source('functions/encounterRecovery.mjs');
  assert.match(recovery,/revision:revision\+1/);
  assert.match(recovery,/Resolve the pending action/);
  assert.match(recovery,/saved\.geometry/);
});

test('3.6 final: witnessed physical d20 outcomes enter canonical combat checks',()=>{
  const valid=validateHybridPhysicalDice({primary:[19,3],defence:[7]});
  assert.deepEqual([...valid.primary],[19,3]);
  assert.deepEqual(hybridD20({advantage:true},[19,3]),{
    dice:[19,3],die:19,source:'physical'
  });
  assert.deepEqual(hybridD20({disadvantage:true},[19,3]),{
    dice:[19,3],die:3,source:'physical'
  });
  assert.deepEqual(hybridD20({advantage:true,disadvantage:true},[13]),{
    dice:[13],die:13,source:'physical'
  });
  assert.deepEqual(hybridD20({},undefined,()=>0),{
    dice:[1],die:1,source:'digital'
  });
  for(const invalid of [null,{},[],{primary:[]},{primary:[0]},
    {primary:[21]},{primary:[1.5]},{primary:['20']},
    {primary:[1,2,3]},{primary:[12],privateResult:true}]){
    assert.throws(()=>validateHybridPhysicalDice(invalid));
  }
  assert.throws(()=>hybridD20({advantage:true},[18]),/2 physical/);
  assert.throws(()=>hybridD20({},[2,4]),/1 physical/);
});
test('3.6 final: physical/digital pending action uses GM and revision guards',()=>{
  const backend=source('functions/combatCommands.mjs');
  const frontend=source('src/dashboards/combat/GMAdvancedCombatControls.jsx');
  assert.match(backend,/management\\.has\\(input\\.operation\\)&&!gm/);
  assert.match(backend,/input\\.revision!==oldRevision/);
  assert.match(backend,/validateHybridPhysicalDice\\(input\\.physicalDice\\)/);
  assert.match(backend,/recordedRoll\\('primary'/);
  assert.match(backend,/recordedRoll\\('defence'/);
  assert.match(backend,/recordedRoll\\('opposed'/);
  assert.match(backend,/consumedDice\\.has/);
  assert.match(frontend,/data-testid="hybrid-physical-dice"/);
  assert.match(frontend,/operation:'roll',physicalDice:dice/);
});
