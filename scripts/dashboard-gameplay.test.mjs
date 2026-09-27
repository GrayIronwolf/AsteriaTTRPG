import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceDefinitions,applyResourceChanges} from '../src/state/resourceEngine.mjs';
import {ownedTalents,buildTalentCatalog} from '../src/state/talentModel.mjs';
import {talentRules} from '../src/state/talentMechanics.mjs';
import {talentGraph} from '../src/state/talentGraph.mjs';
const character={hp:[100,100],sp:[100,100],mp:[100,100],bp:[10,20],zp:[5,10]};
test('resource ownership is shared, class aware, and supports custom resources',()=>{
  for(const [classes,expected] of [[[],[]],[['Fighter'],[]],[['Blood Hunter'],['bp']],[['Paladin'],['zp']],[['Bloodhunter','Paladin'],['bp','zp']]]) {
    const c={...character,classes};assert.deepEqual(resourceDefinitions(c).map(r=>r.id),['hp','sp','mp',...expected]);
    if(!expected.includes('bp'))assert.throws(()=>applyResourceChanges(c,{costs:{bp:1}}),/Unknown resource/);
  }
  assert.equal(resourceDefinitions({...character,resources:{focus:[1,3]},resourceDefinitions:{focus:{name:'Focus'}}}).at(-1).id,'focus');
});
test('locked rows are excluded and highest purchased ranks stay deduplicated',()=>{
  for(const rank of [1,2,5]) {
    const c={classes:['Mage'],talents:[{name:'A',rank:1},{name:'A',rank}],unlockedTalents:[{name:'A',rank}],classTalents:[{name:'Locked',rank:5,unlocked:false}]};
    const owned=ownedTalents(c);assert.equal(owned.length,1);assert.equal(owned[0].rank,rank);
  }
  assert.deepEqual(ownedTalents({}),[]);
});
test('canonical authored costs support every resource and multiple costs without a component table',()=>{
  for(const key of ['hp','sp','mp','bp','zp','focus']) {
    const talent={id:'mage:example',type:'Active',metadata:{resourceCosts:{[key]:3}},ranks:{1:'### Effects\nAn authored effect.'}};
    assert.deepEqual(talentRules(talent,1).costs,{[key]:3});
  }
  const talent={id:'mage:example',type:'Active',metadata:{resourceCosts:{mp:1},rankMechanics:{2:{resourceCosts:{bp:2,sp:15}}}},ranks:{2:'### Effects\nAn authored effect.'}};
  assert.deepEqual(talentRules(talent,2).costs,{bp:2,sp:15});
});
test('one graph retains all classes, all five tiers, and prerequisite edges on mobile',()=>{
  const catalog=buildTalentCatalog({classes:['Mage','Warrior']},['Mage','Warrior'].flatMap(className=>[1,2,3,4,5].map(tier=>({type:'talent',title:`Talent ${tier}`,className,metadata:{tier,prerequisite:tier===2?'Talent 1 Rank I':'None'},body:'## Rank 1\n### Effects\nEffect'}))));
  for(const compact of [false,true]) {
    const g=talentGraph(catalog,compact);assert.equal(g.nodes.length,10);assert.equal(g.tiers.length,5);assert.equal(g.edges.length,2);if(compact)assert.equal(g.width,350);
  }
});

import {customEncounterCreature,encounterXP,encounterResourceKeys,setEncounterResource,preserveEncounterResources} from '../src/state/encounterResourceModel.mjs';
import {changeQuestStatus,changeQuestProgress,questIsClosed,questDetails,QUEST_TYPES} from '../src/state/questWorkflowModel.mjs';
import {normalizeAssignedQuest} from '../src/state/questRewardModel.mjs';
import {normalizeInformation,informationScopes,publicInformation} from '../src/state/campaignInformation.mjs';
import {notificationHistory} from '../src/state/notificationModel.mjs';
test('custom encounter instances omit empty pools and retain configured XP and resources',()=>{
  const creature=customEncounterCreature({name:'Bandit',hp:120,sp:80,mp:0,xpReward:250},'custom');
  assert.deepEqual(encounterResourceKeys(creature),['hp','sp']);assert.equal(encounterXP(creature),250);
  assert.equal(encounterXP({metadata:{xp:500}}),500);assert.equal(encounterXP({}),null);
  const next=setEncounterResource(creature,'sp',20,80);assert.deepEqual(next.sp,[20,80]);
  assert.deepEqual(preserveEncounterResources([{...creature,sp:[80,80]}],[next])[0].sp,[20,80]);
  assert.throws(()=>customEncounterCreature({name:'No HP',hp:0,xpReward:0},'a'));
  const extra={...creature,resources:{focus:[4,8]},resourceDefinitions:{focus:{name:'Focus'}}};
  assert.ok(encounterResourceKeys(extra).includes('focus'));assert.deepEqual(setEncounterResource(extra,'focus',2,8).resources.focus,[2,8]);
});
test('quest offers retain types and terminal history without duplicate rewards',()=>{
  const offered=normalizeAssignedQuest({id:'q',title:'Greg',category:'Legacy Category',questType:'NPC Quest',offerRequired:true});
  assert.equal(offered.status,'Pending');assert.equal(offered.category,'Legacy Category');
  assert.equal(questDetails(offered).questType,'NPC Quest');assert.ok(QUEST_TYPES.includes('Hide Quest'));
  assert.throws(()=>changeQuestStatus(offered,'Completed'));
  assert.throws(()=>changeQuestProgress({...offered,objectives:[{id:'a',text:'Find',target:1}]},{objectiveId:'a',current:1}));
  const accepted=changeQuestStatus(offered,'Accepted'),active=changeQuestStatus(accepted,'Active'),complete=changeQuestStatus(active,'Completed');
  assert.equal(complete.history.length,3);assert.throws(()=>changeQuestStatus(complete,'Active',{gm:true}));
  for(const status of ['Declined','Failed','Expired']) {
    const closed=changeQuestStatus(offered,status,{gm:true});assert.ok(questIsClosed(closed));assert.throws(()=>changeQuestStatus(closed,'Active'));
    assert.equal(changeQuestStatus(closed,'Pending',{gm:true}).status,'Pending');
  }
});
test('news and events use supported scopes and a strict public field allowlist',()=>{
  const campaign={location:'Vaelgard',region:'Altarin'};
  assert.deepEqual(informationScopes(campaign).map(x=>x.scope),['Local','Region','World']);
  const entry=normalizeInformation({id:'n',title:'Town crier',scope:'Local',published:true,gmNotes:'secret'},'news',campaign);
  assert.equal(entry.location,'Vaelgard');assert.equal(publicInformation({...entry,gmNotes:'secret'}).gmNotes,undefined);
  assert.throws(()=>normalizeInformation({title:'X',scope:'Country'},'news',campaign));
  const event=normalizeInformation({title:'Festival',status:'Ongoing'},'events',campaign);assert.equal(event.start,'');assert.equal(event.worldTime,null);
});
test('notification history scopes recipients, preserves read state, and deduplicates archived activity',()=>{
  const c={id:'a',ownerUid:'alice',actionLog:[{id:'log',type:'item-received',message:'A gift',at:'2026-01-01'}],notificationRead:{'activity:log':true}};
  const event={id:'e',targetOwnerUid:'alice',targetCharacterId:'a',type:'item-received',payload:{message:'A gift',activityId:'log'},createdAt:'2026-01-01'};
  const rows=notificationHistory(c,[event,event,{...event,id:'private',targetOwnerUid:'bob'}]);assert.equal(rows.length,1);assert.equal(rows[0].read,true);
  assert.equal(notificationHistory({...c,notificationRead:{'event:e':false}},[{...event,acknowledged:true}])[0].read,false);
});
test('legacy rank names and Roman ranks combine without changing stored purchase history',()=>{
  const c={classes:['Ranger'],talents:[{name:"Hunter's Mark Rank I",rank:'I'},{name:"Hunter's Mark Rank III",rank:'III'}]};
  const before=JSON.stringify(c),rows=ownedTalents(c);assert.equal(rows.length,1);assert.equal(rows[0].rank,3);assert.equal(rows[0].name,"Hunter's Mark");assert.equal(JSON.stringify(c),before);
});
