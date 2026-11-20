import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerQuestProjection,validatePlayerQuestAction} from '../frontend/src/player/playerQuestModel.mjs';
import {playerCharacterProjection} from '../frontend/src/player/playerDashboardModel.mjs';
import {changeQuestProgress,changeQuestStatus} from '../src/state/questWorkflowModel.mjs';
import {markQuestRewardClaimed,questRewardClaimed} from '../src/state/questRewardModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const original={
 id:'quest-one',name:'Recover the Relic',status:'Pending',requiresGMApproval:true,
 objectives:[{id:'relic',text:'Recover relic',target:2}],progress:{relic:0},
 history:[{status:'Pending',at:'2026-11-20'}],reward:{xp:50}
};
test('Phase 2.3 keeps quest objectives, histories and rewards visible',()=>{
 const rows=playerQuestProjection({quests:[original]});
 assert.equal(rows.length,1);
 assert.equal(rows[0].id,'quest-one');
 assert.equal(rows[0].objectives[0].target,2);
 assert.equal(rows[0].objectives[0].current,0);
 assert.equal(rows[0].history.length,1);
 assert.match(rows[0].rewardText,/50 XP/);
 const projected=playerCharacterProjection({id:'hero',ownerUid:'owner',quests:[original]},{owned:true});
 assert.equal(projected.quests[0].requiresGMApproval,true);
 assert.equal(projected.quests[0].status,'Pending');
});
test('Phase 2.3 uses authoritative offer, progress and GM review constraints',()=>{
 const accepted=changeQuestStatus(original,'Accepted',{uid:'owner'});
 const active=changeQuestStatus(accepted,'Active',{uid:'owner'});
 const updated=changeQuestProgress(active,{objectiveId:'relic',current:2});
 assert.equal(updated.progress.relic,2);
 const submitted=changeQuestStatus(updated,'Awaiting Review',{uid:'owner'});
 assert.equal(submitted.status,'Awaiting Review');
 assert.throws(()=>changeQuestStatus(updated,'Completed',{uid:'owner'}),/GM must review/);
 assert.equal(changeQuestStatus(submitted,'Completed',{gm:true,uid:'gm'}).status,'Completed');
 assert.throws(()=>changeQuestStatus(original,'Completed',{uid:'owner'}),/GM must review/);
});
test('Phase 2.3 keeps quest reward entitlements one-time',()=>{
 const first=markQuestRewardClaimed(original,'reward-quest-one');
 assert.equal(first.applied,true);
 assert.equal(questRewardClaimed(first.quest),true);
 const again=markQuestRewardClaimed(first.quest,'reward-quest-one');
 assert.equal(again.applied,false);
});
test('Phase 2.3 validates quest actions before trusted server dispatch',()=>{
 assert.deepEqual(validatePlayerQuestAction('quest-one','status','Accepted'),
  {questId:'quest-one',status:'Accepted'});
 assert.deepEqual(validatePlayerQuestAction('quest-one','progress',{tracked:true}),
  {questId:'quest-one',patch:{tracked:true}});
 assert.throws(()=>validatePlayerQuestAction('quest-one','status','Expired'),/permitted/);
 assert.throws(()=>validatePlayerQuestAction('quest-one','progress',{objectiveId:'relic',current:2.5}),/valid objective/);
 const service=read('frontend/src/player/firebasePlayerDashboardService.mjs');
 assert.match(service,/updateCharacterQuest/);
 assert.match(service,/updateQuestProgress/);
 assert.match(service,/characterSystemAction\(cid,id,command,args\)/);
 assert.match(service,/linkedCharacterAccess/);
 const ui=read('frontend/src/player/PlayerQuestWorkspace.jsx');
 assert.match(ui,/site-player-quests/);
 assert.match(ui,/Submit for GM Review/);
 assert.match(ui,/Complete & Claim Reward/);
 assert.match(ui,/Accept Quest/);
 assert.match(ui,/Quest History/);
 assert.doesNotMatch(ui,/window\.AsteriaFirebase|initializeApp\(/);
 const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
 assert.match(page,/PlayerQuestWorkspace/);
});
