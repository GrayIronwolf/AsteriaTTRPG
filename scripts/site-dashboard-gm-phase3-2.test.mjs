import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 blankGMQuest,validateGMQuest,updateGMQuestList,archiveGMQuestList,
 addGMQuestObjective,assignGMQuest,campaignDetailsDraft,validateCampaignDetails
} from '../frontend/src/dashboard/gmQuestManagementModel.mjs';
import {gmPartySummary,gmCampaignSummary} from '../frontend/src/dashboard/gmDashboardModel.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='quest-one';
const now='2026-11-20T00:00:00.000Z';
test('Phase 3.2: quest templates validate real objective and reward contracts',()=>{
 const first=addGMQuestObjective({...blankGMQuest(),title:'The Frozen Gate'},{
   id:'objective-1',text:'Retrieve three keys',target:'3'});
 const result=updateGMQuestList([],{...first,id:''},{newId:id,now});
 assert.equal(result.saved.title,'The Frozen Gate');
 assert.equal(result.saved.objectives[0].target,3);
 assert.equal(result.saved.requiresGMApproval,true);
 assert.equal(result.quests[0].updatedAt,now);
 assert.throws(()=>validateGMQuest({...first,id, reward:{...first.reward,xp:'-2'}}),/whole number/);
 assert.throws(()=>validateGMQuest({...first,id, reward:{...first.reward,currency:{key:'gold',amount:'2.5'}}}),/whole number/);
 assert.throws(()=>addGMQuestObjective(first,{id:'bad id',text:'a'}),/identifier/);
 assert.throws(()=>validateGMQuest({...first,id,visibility:'Player Only'}),/visibility/);
});
test('Phase 3.2: prevents stale updates and preserves unmodified ledger records',()=>{
 const first=updateGMQuestList([],{...blankGMQuest(),title:'First'}, {newId:id,now}).saved;
 const next=updateGMQuestList([first],{...first,title:'Updated'},{
   expectedUpdatedAt:now,now:'2026-11-21T00:00:00.000Z'});
 assert.equal(next.saved.title,'Updated');
 assert.throws(()=>updateGMQuestList(next.quests,{...first,title:'Stale'},
   {expectedUpdatedAt:now}),/changed/);
 assert.throws(()=>archiveGMQuestList(next.quests,id,now),/changed/);
 assert.equal(archiveGMQuestList(next.quests,id,next.saved.updatedAt)[0].status,'Archived');
});
test('Phase 3.2: assignment never includes private GM notes and preserves rewards and progress',()=>{
 const template=validateGMQuest({...blankGMQuest(),id,title:'Find the gate',
   status:'Active',gmNotes:'Secret GM plan',objective:'Collect the key',
   objectives:[{id:'key',text:'Find key',target:3}],reward:{xp:50,currency:{key:'gold',amount:2}}});
 const assigned=assignGMQuest(template,null,{assignedBy:'gm'});
 assert.equal(assigned.title,template.title);
 assert.equal(JSON.stringify(assigned).includes('Secret GM plan'),false);
 const repeat=assignGMQuest(template,{...assigned,status:'Completed',
   progress:{key:3},rewardClaimedAt:'claimed'}, {assignedBy:'gm'});
 assert.equal(repeat.status,'Completed');
 assert.equal(repeat.progress.key,3);
 assert.equal(repeat.rewardClaimedAt,'claimed');
 assert.throws(()=>assignGMQuest({...template,visibility:'GM Only'},null),/party-visible/);
});
test('Phase 3.2: campaign details are bounded and do not need new storage',()=>{
 const draft=campaignDetailsDraft({name:'Ice Realm',description:'Story',playerLimit:6},
   {campaign:{location:'Vaelgard'}});
 assert.equal(draft.location,'Vaelgard');
 assert.equal(validateCampaignDetails(draft).playerLimit,6);
 assert.throws(()=>validateCampaignDetails({...draft,playerLimit:'0'}),/whole number/);
 assert.throws(()=>validateCampaignDetails({...draft,name:''}),/name/);
});
test('Phase 3.2: GM-only summaries expose sanitized assigned quests without owners',()=>{
 const party=gmPartySummary([{id:'hero-one',ownerUid:'private-owner',name:'Scout',
   quests:[{id, title:'Quest',status:'Awaiting Review',progress:{key:2},
     objectives:[{id:'key',text:'Find keys',target:3}],gmNotes:'secret'}]}]);
 assert.equal(party[0].quests[0].progress.key,2);
 assert.equal(JSON.stringify(party).includes('secret'),false);
 assert.equal(JSON.stringify(party).includes('private-owner'),false);
 const campaign=gmCampaignSummary({id:'campaign-one',name:'Glacial',ownerUid:'gm',
   ucn:'123456789012'}, {allowed:true,role:'owner'});
 assert.equal(campaign.ucn,'123456789012');
});
test('Phase 3.2: React route uses authorized service and no legacy runtime',()=>{
 const page=read('frontend/src/pages/GMDashboardPage.jsx');
 const api=read('frontend/src/dashboard/firebaseGMDashboardService.mjs');
 const quest=read('frontend/src/dashboard/GMQuestManagement.jsx');
 const manager=read('frontend/src/dashboard/GMCampaignManagement.jsx');
 const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
 assert.match(page,/api\.watchManagement\(campaignId/);
 assert.match(page,/<GMQuestManagement/);
 assert.match(page,/<GMCampaignManagement/);
 assert.match(quest,/Send to Selected Players/);
 assert.match(quest,/Approve & Award/);
 assert.match(quest,/Quest Builder/);
 assert.match(manager,/Upload \/ Replace Campaign Image/);
 assert.match(api,/reviewCharacterQuest/);
 assert.match(api,/assignGMQuest/);
 assert.match(api,/firestoreSdk\.runTransaction/);
 assert.match(api,/verifyCampaign\(cid\)/);
 assert.match(api,/campaignArtworkFileError/);
 assert.match(adapter,/storageSdk:safeStorageSdk/);
 assert.doesNotMatch(page,/window\.AsteriaFirebase/);
});
