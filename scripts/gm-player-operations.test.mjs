import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GM_PLAYER_ACTIVITY_KINDS,gmVerifiedPlayerCharacters,gmPlayerSnapshot,
  gmPlayerOperationsEnabled,gmPlayerResourceAdjustmentValid,
  gmPlayerActivityRows,gmPlayerCheckActionAllowed
} from '../src/state/gmPlayerOperationsModel.mjs';
import {GM_PLAYER_MANAGER_VIEWS} from '../src/state/gmPlayerManagerModel.mjs';

const source=p=>readFileSync(p,'utf8');
const campaign={
  id:'c1',membershipSchemaVersion:2,ownerUid:'gm',players:{u1:{characterIds:['p1']}},
  playerCharacterLinks:{p1:'u1'},characters:{p1:{ownerUid:'u1'}}
};
const pc={
  id:'p1',ownerUid:'u1',sharedCampaignId:'c1',name:'Mage',klass:'Wizard',
  level:4,hp:[28,35],sp:[14,25],mp:[52,60],xp:400,xpMax:1000,
  coreRevision:7,inventory:[{id:'sword',name:'Sword',qty:2}],
  skills:{Arcana:{rank:'Novice'},Perception:{rank:'Expert'}}
};
const characters={p1:pc,p2:{id:'p2',ownerUid:'intruder',name:'Stranger',hp:[1,2]}};
const report={state:'ready',rows:[
  {uid:'u1',role:'player',status:'active',displayName:'Player One',
    online:true,characters:[{id:'p1',name:'Mage'},{id:'p2',name:'Stranger'}]},
  {uid:'u2',role:'player',status:'suspended',characters:[{id:'p3',name:'Missing'}]}
]};

test('player operations are present in one existing GM Player Manager, not a duplicate route',()=>{
  assert.deepEqual(GM_PLAYER_MANAGER_VIEWS.map(x=>x.id),[
    'players','player-tools','live-actions','joins','characters','invitations','access','activity']);
  const manager=source('src/dashboards/GMPlayerManager.jsx');
  const gm=source('src/dashboards/GMDashboard.jsx');
  const operations=source('src/dashboards/GMPlayerOperations.jsx');
  assert.match(gm,/events=\{live\.events\} session=\{live\.session\}/);
  assert.match(manager,/GMPlayerTools/);
  assert.match(manager,/GMPlayerLiveActions/);
  assert.match(manager,/GMPlayerActivity/);
  assert.match(manager,/gmVerifiedPlayerCharacters/);
  assert.match(operations,/GMContextCheckLauncher/);
  assert.match(operations,/GMUniversalCheckManager/);
  assert.match(operations,/ConditionsPanel/);
  assert.match(operations,/ResourceRulesPanel/);
  assert.match(operations,/firebaseService\.updateResource/);
  assert.match(operations,/firebaseService\.grantXP/);
  assert.match(operations,/firebaseService\.universalCheckAction/);
  assert.doesNotMatch(operations,/\b(setDoc|updateDoc|deleteDoc|addDoc)\s*\(/);
});

test('a mismatched account cannot lend a character to another GM player record',()=>{
  const items=gmVerifiedPlayerCharacters({campaign,characters,report});
  assert.deepEqual(items.map(x=>x.id),['p1']);
  assert.equal(items[0].uid,'u1');
  assert.equal(items[0].status,'active');
  assert.equal(items[0].online,true);
  assert.deepEqual(gmVerifiedPlayerCharacters({campaign,characters,
    report:{...report,state:'loading'}}),[]);
  assert.deepEqual(gmVerifiedPlayerCharacters({campaign:{...campaign,id:'other'},
    characters,report}),[]);
  assert.deepEqual(gmVerifiedPlayerCharacters({campaign,characters:{
    p1:{...pc,sharedCampaignId:'not-this-campaign'}},report}),[]);
});

test('individual player summary uses character data and never mutates it',()=>{
  const before=JSON.stringify(pc),s=gmPlayerSnapshot(pc,{now:Date.now()});
  assert.equal(s.name,'Mage');
  assert.deepEqual(s.resources.hp,{current:28,maximum:35});
  assert.deepEqual(s.resources.sp,{current:14,maximum:25});
  assert.deepEqual(s.resources.mp,{current:52,maximum:60});
  assert.equal(s.skillCount,2);
  assert.equal(s.inventoryTypes,1);
  assert.equal(s.inventoryUnits,2);
  assert.equal(s.xp,400);
  assert.equal(JSON.stringify(pc),before);
});

test('only an active member in editable session can use live actions',()=>{
  const access={gm:true},selected={id:'p1',status:'active'};
  assert.equal(gmPlayerOperationsEnabled({access,selected,session:{editable:true}}),true);
  assert.equal(gmPlayerOperationsEnabled({access:{gm:false},selected,session:{editable:true}}),false);
  assert.equal(gmPlayerOperationsEnabled({access,selected:{...selected,status:'banned'},session:{editable:true}}),false);
  assert.equal(gmPlayerOperationsEnabled({access,selected,session:{editable:false}}),false);
  assert.equal(gmPlayerResourceAdjustmentValid({resource:'hp',delta:-5,character:pc,editable:true}),true);
  assert.equal(gmPlayerResourceAdjustmentValid({resource:'mp',delta:100001,character:pc,editable:true}),false);
  assert.equal(gmPlayerResourceAdjustmentValid({resource:'hp',delta:0,character:pc,editable:true}),false);
  assert.equal(gmPlayerResourceAdjustmentValid({resource:'hp',delta:'',character:pc,editable:true}),false);
  assert.equal(gmPlayerResourceAdjustmentValid({resource:'hp',delta:5,character:pc,editable:false}),false);
  assert.equal(gmPlayerResourceAdjustmentValid({resource:'unknown',delta:5,character:pc,editable:true}),false);
});

test('check action state transitions stay restricted to existing UCRS operations',()=>{
  const base={id:'check1',status:'pending'};
  assert.equal(gmPlayerCheckActionAllowed(base,'resend'),true);
  assert.equal(gmPlayerCheckActionAllowed(base,'cancel'),true);
  assert.equal(gmPlayerCheckActionAllowed(base,'acknowledge'),false);
  assert.equal(gmPlayerCheckActionAllowed({...base,status:'submitted'},'acknowledge'),true);
  assert.equal(gmPlayerCheckActionAllowed({...base,status:'acknowledged'},'reroll'),true);
  assert.equal(gmPlayerCheckActionAllowed({...base,status:'cancelled'},'reroll'),false);
  assert.equal(gmPlayerCheckActionAllowed({...base,id:''},'cancel'),false);
});

test('activity history combines scoped checks, reward, inventory and GM decisions',()=>{
  const time='2026-11-24T00:00:00Z';
  const checks=[
    {id:'ck1',characterId:'p1',skill:'Perception',type:'skill',status:'submitted',
      result:{total:17},createdAt:time},
    {id:'ck2',characterId:'outsider',skill:'Private',type:'skill',status:'pending',createdAt:time}
  ];
  const events=[
    {id:'xp1',type:'xp-reward',targetCharacterId:'p1',createdAt:time,payload:{amount:30}},
    {id:'xp2',type:'xp-reward',targetCharacterId:'outside',createdAt:time,payload:{amount:900}},
    {id:'inv1',type:'item-equipped',targetCharacterId:'p1',createdAt:time,
      message:'Equipped staff',payload:{}}
  ];
  const membershipEvents=[{uid:'u1',type:'join',actorUid:'gm',at:time,detail:'approve'},
    {uid:'outsider',type:'join',actorUid:'gm',at:time,detail:'decline'}];
  const all=gmPlayerActivityRows({events,checks,characters:{p1:pc},membershipEvents});
  assert.ok(all.some(x=>x.category==='checks'&&x.id==='check:ck1'));
  assert.ok(all.some(x=>x.category==='rewards'&&x.id==='reward:xp1'));
  assert.ok(all.some(x=>x.category==='inventory'));
  assert.ok(all.some(x=>x.category==='membership'));
  assert.equal(all.some(x=>x.characterId==='outsider'||x.characterId==='outside'),false);
  assert.equal(new Set(all.map(x=>x.id)).size,all.length);
  const focused=gmPlayerActivityRows({events,checks,characters:{p1:pc},membershipEvents,
    selectedCharacterId:'p1',selectedUid:'u1'});
  assert.equal(focused.some(x=>x.accountUid==='outsider'),false);
  const onlyChecks=gmPlayerActivityRows({events,checks,characters:{p1:pc},kind:'checks'});
  assert.equal(onlyChecks.every(x=>x.category==='checks'),true);
  assert.equal(gmPlayerActivityRows({events,checks,characters:{p1:pc},kind:'unknown'}).length,0);
  assert.deepEqual(GM_PLAYER_ACTIVITY_KINDS.map(x=>x.id),[
    'all','checks','rewards','inventory','membership']);
});

test('no extra Firebase services or public rollout gates introduced',()=>{
  const services=source('src/firebase/asteriaFirebaseService.js');
  const operations=source('src/dashboards/GMPlayerOperations.jsx');
  const html=source('index.html');
  assert.match(services,/subscribeUniversalChecks/);
  assert.match(services,/universalCheckAction/);
  assert.match(services,/grantXP/);
  assert.match(services,/updateResource/);
  assert.match(operations,/onNavigate\?\.\(\{tab:'inventory'\}\)/);
  assert.match(operations,/onNavigate\?\.\(\{tab:'tools'\}\)/);
  for(const flag of ['campaignPlayerRoster','campaignMemberControls',
    'campaignRolePermissions','campaignCharacterApproval','campaignCharacterLifecycle'])
    assert.match(html,new RegExp(flag+':false'));
});
