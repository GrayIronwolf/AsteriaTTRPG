import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {questObjectives,questProgress,mergeQuestAssignment,changeQuestProgress,changeQuestStatus} from '../src/state/questWorkflowModel.mjs';
import {normalizeAssignedQuest} from '../src/state/questRewardModel.mjs';
const quest=(patch={})=>({id:'q',title:'Rescue',name:'Rescue',status:'Active',requiresGMApproval:true,objectives:[{id:'rescued',text:'Rescue villagers',target:3},{id:'bonus',text:'Find the map',target:1,optional:true}],progress:{},...patch});

test('assignment publishes public details without leaking private GM notes',()=>{
 const assigned=normalizeAssignedQuest(quest({gmNotes:'SECRET',privateNotes:'SECRET',deadline:'Before the second dawn',failureConsequences:'The village falls',reward:'A favour'}));
 assert.equal(assigned.deadline,'Before the second dawn');assert.equal(assigned.failureConsequences,'The village falls');assert.equal(assigned.reward.notes,'A favour');
 assert.equal(assigned.gmNotes,undefined);assert.equal(assigned.privateNotes,undefined);assert.equal(assigned.requiresGMApproval,true);
 assert.equal(normalizeAssignedQuest({title:'Legacy'}).requiresGMApproval,false);
});
test('objective normalization produces unique stable IDs and bounded whole targets',()=>{
 const input={objectives:[{id:'objective-1',text:'First'}, {id:'objective-1',text:'Second',target:0},'Legacy text',{id:'bad/id',text:'Fourth',target:1.5}]};
 const rows=questObjectives(input);assert.equal(new Set(rows.map(row=>row.id)).size,4);assert.deepEqual(rows,questObjectives(input));assert.ok(rows.every(row=>row.target===1));
});
test('reassignment preserves player progress, history and once-only reward entitlement',()=>{
 const previous=quest({status:'Completed',progress:{rescued:3},tracked:true,assignedAt:'original',rewardStatus:'claimed',rewardClaimedAt:'then',rewardTransactionId:'receipt',history:[{status:'Completed'}]});
 const merged=mergeQuestAssignment(previous,normalizeAssignedQuest(quest({title:'Updated'})));
 for(const key of ['status','tracked','assignedAt','rewardStatus','rewardClaimedAt','rewardTransactionId','history'])assert.deepEqual(merged[key],previous[key]);
 assert.equal(merged.progress.rescued,3);assert.equal(merged.title,'Updated');
});
test('new required objectives reopen an invalidated review without losing existing progress',()=>{
 const previous=quest({status:'Awaiting Review',progress:{rescued:3}});
 const next=quest({objectives:[...previous.objectives,{id:'return',text:'Return home',target:1}]});
 const merged=mergeQuestAssignment(previous,next);assert.equal(merged.status,'Active');assert.equal(merged.progress.rescued,3);assert.equal(merged.progress.return,0);
 assert.equal(questProgress(previous).ready,true);assert.equal(questProgress(merged).ready,false);
});
test('progress mutations reject arbitrary metadata, invalid counts and closed edits',()=>{
 for(const patch of [{objectiveId:'rescued',current:-1},{objectiveId:'rescued',current:4},{objectiveId:'rescued',current:1.5},{objectiveId:'rescued',current:'2'},{objectiveId:'missing',current:1},{objectiveId:'rescued',current:3,reward:{xp:999}},{tracked:true,status:'Completed'}])assert.throws(()=>changeQuestProgress(quest(),patch));
 assert.equal(changeQuestProgress(quest(),{objectiveId:'rescued',current:2}).progress.rescued,2);
 for(const status of ['Completed','Failed','Awaiting Review'])assert.throws(()=>changeQuestProgress(quest({status}),{objectiveId:'rescued',current:1}));
 assert.equal(changeQuestProgress(quest({status:'Completed'}),{tracked:true}).tracked,true);
});
test('GM approval workflow enforces readiness, submission and terminal completion',()=>{
 assert.throws(()=>changeQuestStatus(quest(),'Completed'));assert.throws(()=>changeQuestStatus(quest(),'Awaiting Review'));
 const ready=quest({progress:{rescued:3}});assert.throws(()=>changeQuestStatus(ready,'Completed',{gm:true}));
 const submitted=changeQuestStatus(ready,'Awaiting Review',{uid:'alice'});const completed=changeQuestStatus(submitted,'Completed',{gm:true,uid:'gm',note:'Well done'});
 assert.equal(completed.reviewedBy,'gm');assert.equal(completed.resolutionNote,'Well done');assert.equal(completed.history.length,2);
 assert.throws(()=>changeQuestStatus(completed,'Active',{gm:true}));assert.throws(()=>changeQuestStatus(completed,'Completed'));
 const failed=changeQuestStatus(ready,'Failed',{gm:true});assert.throws(()=>changeQuestStatus(failed,'Active'));assert.equal(changeQuestStatus(failed,'Active',{gm:true}).status,'Active');
 assert.throws(()=>changeQuestStatus(ready,'Anything'));
});
test('legacy quests retain self completion and optional objectives do not block completion',()=>{
 const legacy=quest({requiresGMApproval:false,progress:{rescued:3}});assert.equal(changeQuestStatus(legacy,'Completed').status,'Completed');
 assert.throws(()=>changeQuestStatus(legacy,'Awaiting Review'));
});
let server,modules={};
before(async()=>{
 globalThis.window={AsteriaFirebase:{},AsteriaInventory:{catalogEntries:()=>[]}};
 server=await createServer({configFile:false,server:{middlewareMode:true}});
 for(const file of ['dashboards/CharacterWorkspaceTabs.jsx','dashboards/QuestAssignments.jsx','dashboards/GMWorkspacePanels.jsx','dashboards/characterWorkspaceData.js'])Object.assign(modules,await server.ssrLoadModule(`/src/${file}`));
});
after(async()=>{await server?.close();delete globalThis.window;});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
test('player quest log offers GM submission; GM visit remains read only',()=>{
 const props={campaignId:'c',character:{id:'a',quests:[quest({progress:{rescued:3}})]},partyWorkspace:{},editable:true};
 const html=render(modules.QuestTab,props);assert.match(html,/Submit for GM Review/);assert.doesNotMatch(html,/Complete &amp; Claim Reward/);assert.match(html,/Save Progress/);assert.doesNotMatch(html,/type="number"/);
 const gm=render(modules.QuestTab,{...props,editable:false});assert.doesNotMatch(gm,/Submit for GM Review|Save Progress|Track Quest/);
});
test('shared party records cannot overwrite assigned quest progress or add owner actions',()=>{
 const character={id:'a',quests:[quest({status:'Awaiting Review',progress:{rescued:3}})]};
 const partyWorkspace={questLog:[quest({status:'Active'}),{id:'party-only',name:'Shared rumour',status:'Active'}]};
 const rows=modules.quests(character,partyWorkspace);assert.equal(rows.find(row=>row.id==='q').status,'Awaiting Review');
 const html=render(modules.QuestTab,{campaignId:'c',character,partyWorkspace,editable:true});assert.match(html,/Withdraw Submission/);assert.doesNotMatch(html,/Save Progress|Submit for GM Review|Complete &amp; Claim Reward/);
});
test('GM ledger shows approval and return controls with actual assigned rewards',()=>{
 const html=render(modules.QuestAssignments,{campaignId:'c',questId:'q',characters:{a:{id:'a',name:'Alice',quests:[quest({status:'Awaiting Review',progress:{rescued:3},reward:{xp:2000}})]}}});
 assert.match(html,/Approve &amp; Award/);assert.match(html,/Return to Active/);assert.match(html,/2,000 XP/);
});
test('new GM quest forms default to approval and show in-world deadline and private notes',()=>{
 const html=render(modules.QuestWorkspace,{campaignId:'c',workspace:{quests:[]},characters:{},saveSection:()=>{}});
 assert.match(html,/In-world Deadline/i);assert.match(html,/Private GM Notes/i);assert.match(html,/checked=""/);assert.doesNotMatch(html,/type="number"/);
});
