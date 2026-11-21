import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  LIVE_COMBAT_TIMER_PRESETS,LIVE_COMBAT_TIMER_MAX,
  liveCombatTimerState,resetLiveTurnTimer,applyLiveTimerCommand,
  projectGMLivePending,projectGMLiveLog,gmMayAdvanceTurn
} from '../src/state/liveCombatCommandModel.mjs';
import {projectCombat,validateCombatCommand,COMBAT_BASIC_DECLARATIONS}
  from '../frontend/src/combat/combatModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=1_700_000_000_000;
test('Phase 6.6: timer presets and strict GM-only validation',()=>{
  assert.deepEqual(LIVE_COMBAT_TIMER_PRESETS,[30,60,90,120,180]);
  assert.equal(LIVE_COMBAT_TIMER_MAX,600);
  const configured=applyLiveTimerCommand({},{
    mode:'configure',seconds:60,autoStart:true
  },'ready',now);
  assert.equal(configured.enabled,false);
  assert.equal(configured.durationSeconds,60);
  const started=resetLiveTurnTimer(configured,now);
  assert.equal(started.enabled,true);
  assert.equal(started.endsAt,now+60000);
  assert.equal(liveCombatTimerState(started,now+5000).remainingSeconds,55);
  assert.throws(()=>applyLiveTimerCommand({},{
    mode:'configure',seconds:601
  },'ready',now),/between 15 and 600/);
  assert.throws(()=>applyLiveTimerCommand({},{
    mode:'configure',seconds:14
  },'ready',now),/between 15 and 600/);
  assert.throws(()=>applyLiveTimerCommand({},{
    mode:'configure',seconds:NaN
  },'ready',now),/between 15 and 600/);
  assert.throws(()=>applyLiveTimerCommand({},{
    mode:'configure',seconds:60.5
  },'ready',now),/between 15 and 600/);
  assert.equal(validateCombatCommand('gm','encounter',{
    operation:'timer',mode:'pause',revision:4
  }).operation,'timer');
  assert.throws(()=>validateCombatCommand('player','encounter',{
    operation:'timer',mode:'pause',revision:4
  }),/unavailable/);
});
test('Phase 6.6: pause/resume preserves remaining time and never auto-advances',()=>{
  const configured=applyLiveTimerCommand({},{
    mode:'configure',seconds:90,autoStart:true
  },'active',now);
  const paused=applyLiveTimerCommand(configured,{mode:'pause'},'active',now+20000);
  assert.equal(paused.enabled,false);
  assert.equal(paused.paused,true);
  assert.equal(paused.remainingSeconds,70);
  const resumed=applyLiveTimerCommand(paused,{mode:'resume'},'active',now+30000);
  assert.equal(resumed.endsAt,now+100000);
  assert.equal(liveCombatTimerState(resumed,now+100000).remainingSeconds,0);
  assert.equal(resetLiveTurnTimer(resumed,now+100000).remainingSeconds,90);
  assert.throws(()=>applyLiveTimerCommand(resumed,{mode:'resume'},'active',now),/paused/);
  assert.throws(()=>applyLiveTimerCommand(paused,{mode:'pause'},'active',now),/not running/);
  assert.throws(()=>applyLiveTimerCommand(paused,{mode:'resume'},'ready',now),/Start combat/);
  const manual=applyLiveTimerCommand({},{
    mode:'configure',seconds:30,autoStart:false
  },'ready',now);
  assert.equal(resetLiveTurnTimer(manual,now).enabled,false);
  const disabled=applyLiveTimerCommand(resumed,{mode:'disable'},'active',now);
  assert.equal(disabled.enabled,false);
  assert.equal(disabled.autoStart,false);
});
test('Phase 6.6: live GM pending queue is sanitised and private-only',()=>{
  const raw={pending:{
    id:'action-1',actorId:'actor-2',actorName:'Frost Drake',status:'awaiting-approval',
    name:'Ice Breath',optionId:'spell-1',kind:'spell',ap:2,bonus:false,
    targetIds:['player-1','other-2','../../../secret'],approval:{
      checkType:'fixed',skill:'Arcana',dc:18,
      hiddenGMNote:'Do not display',consume:[{itemId:'secret'}]
    },result:{success:false,damage:2000},
    source:'secret',purchasedSpells:['Internal only']
  }};
  const projected=projectGMLivePending(raw);
  assert.equal(projected.actorId,'actor-2');
  assert.deepEqual(projected.targetIds,['player-1','other-2']);
  assert.equal(projected.checkType,'fixed');
  assert.equal(projected.rollSuccess,false);
  assert.equal(projected.source,undefined);
  assert.equal(projected.purchasedSpells,undefined);
  assert.equal(projected.hiddenGMNote,undefined);
  assert.equal(projected.result,undefined);
  assert.equal(projectGMLivePending({pending:null}),null);
  const logs=projectGMLiveLog([{id:'event-1',at:now,
    message:'Turn begun',internalData:{private:true}}]);
  assert.deepEqual(logs,[{id:'event-1',at:now,message:'Turn begun'}]);
});
test('Phase 6.6: turn advancement respects active GM session and pending/death-save',()=>{
  const active={status:'active',sessionEditable:true,current:{
    id:'actor-1',turnComplete:false,pendingDeathSave:false
  }};
  assert.deepEqual(gmMayAdvanceTurn(active,null),{
    allowed:true,needsConfirmation:true
  });
  assert.deepEqual(gmMayAdvanceTurn({...active,current:{...active.current,turnComplete:true}},null),{
    allowed:true,needsConfirmation:false
  });
  assert.equal(gmMayAdvanceTurn(active,{status:'reactions'}).allowed,false);
  assert.equal(gmMayAdvanceTurn({...active,current:{
    ...active.current,pendingDeathSave:true
  }},null).allowed,false);
  assert.equal(gmMayAdvanceTurn({...active,sessionEditable:false},null).allowed,false);
  assert.equal(gmMayAdvanceTurn({...active,status:'ready'},null).allowed,false);
});
test('Phase 6.6: existing player projection never includes GM-only action queue or log',()=>{
  const raw={status:'active',turnIndex:0,turnTimer:{
    durationSeconds:60,autoStart:true,enabled:true,endsAt:now+60000
  },combat:{version:1,revision:4,participants:{},log:[{
    id:'event-1',message:'Private GM reason'
  }]},combatants:[{id:'npc-1',name:'Creature',hp:[20,20]}]};
  const session={status:'active',editable:true,expiresAt:now+90000};
  const player=projectCombat(raw,session,{role:'player'});
  const gm=projectCombat(raw,session,{role:'gm'});
  assert.equal(player.log,undefined);
  assert.equal(player.pendingPrivate,undefined);
  assert.equal(player.turnTimer.durationSeconds,60);
  assert.equal(gm.log.length,1);
  assert.equal(gm.turnTimer.autoStart,true);
});
test('Phase 6.6: basic declarations work for GM and linked player, but arbitrary options are rejected',()=>{
  assert.equal(COMBAT_BASIC_DECLARATIONS.length,8);
  const declaration={operation:'declare',revision:2,optionId:'basic:attack',
    targetIds:['enemy-2']};
  assert.equal(validateCombatCommand('player','player-1',declaration).operation,'declare');
  assert.equal(validateCombatCommand('gm','enemy-1',declaration).operation,'declare');
  assert.throws(()=>validateCombatCommand('player','player-1',{
    ...declaration,optionId:'spell:unlearned'
  }),/approved basic action/);
  assert.throws(()=>validateCombatCommand('player','player-1',{
    ...declaration,targetIds:[]
  }),/required target/);
  assert.throws(()=>validateCombatCommand('player','player-1',{
    ...declaration,targetIds:['enemy-2','enemy-3']
  }),/required target/);
  const view=read('frontend/src/combat/CombatWorkspace.jsx');
  assert.match(view,/site-combat-declare-basic/);
  assert.match(view,/operation:'declare'/);
});
test('Phase 6.6: server remains authoritative for timer, action and resource outcomes',()=>{
  const server=read('functions/combatCommands.mjs');
  const service=read('frontend/src/combat/firebaseCombatService.mjs');
  const view=read('frontend/src/combat/CombatWorkspace.jsx');
  const panel=read('frontend/src/combat/GMLiveCombatPanel.jsx');
  const css=read('frontend/src/combat/GMLiveCombatPanel.module.css');
  assert.match(server,/management=new Set\(\['timer'/);
  assert.match(server,/applyLiveTimerCommand\(encounter\.turnTimer/);
  assert.match(server,/resetLiveTurnTimer\(encounter\.turnTimer/);
  assert.match(server,/input\.revision!==oldRevision/);
  assert.match(server,/privateState\.pending/);
  assert.match(server,/tx\.set\(encounterRef/);
  assert.match(server,/conditionBoundary\(current\.id,'end'\)/);
  assert.match(service,/pending:projectGMLivePending/);
  assert.match(service,/combatLog:projectGMLiveLog/);
  assert.match(view,/<GMLiveCombatPanel/);
  assert.match(panel,/operation:'approve'/);
  assert.match(panel,/operation:'window'/);
  assert.match(panel,/operation:'react'/);
  assert.match(panel,/operation:'pass'/);
  assert.match(panel,/operation:'resolve-reaction'/);
  for(const action of ['approve','reject','window','close-window','roll','resolve',
    'react','pass','resolve-reaction']){
    assert.equal(validateCombatCommand('gm','encounter',{
      operation:action,revision:4
    }).operation,action);
  }
  assert.throws(()=>validateCombatCommand('player','player-1',{
    operation:'approve',revision:4
  }),/unavailable/);
  assert.match(panel,/operation:'reject'/);
  assert.match(panel,/operation:'close-window'/);
  assert.match(panel,/operation:'roll'/);
  assert.match(panel,/operation:'resolve'/);
  assert.match(panel,/operation:'timer'/);
  assert.doesNotMatch(panel,/firebase\/firestore|httpsCallable|updateDoc|setDoc/);
  assert.doesNotMatch(css,/!\s*important|@import\b/i);
});
