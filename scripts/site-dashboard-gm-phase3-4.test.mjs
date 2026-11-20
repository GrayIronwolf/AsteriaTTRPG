import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  gmToolkitDestination,gmToolkitMetrics,filterGMToolkit,GM_TOOLKIT_TOOLS
} from '../frontend/src/dashboard/gmToolkitNavigationModel.mjs';
import {
  libraryDraft,updateGMLibrary,removeGMLibraryRecord,
  gmNPCCreatureLibrary,libraryEncounterReady,officialCreatureLibraryEntries
} from '../src/state/gmNpcCreatureLibraryModel.mjs';
import {
  generateNPCConcept,npcGeneratorOptions,officialNPCRaces
} from '../src/state/gmNpcGeneratorModel.mjs';
import {validateGMCharacterCard,updateGMLibraryCard} from '../src/state/gmCharacterCardModel.mjs';
import {worldMutation,gmToolkitProjection} from '../frontend/src/digitalGM/digitalGMModel.mjs';
import {checkProjection,assertCheckPayload} from '../frontend/src/progression/progressionModel.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

const tabs=[
 'main','toolkit','bestiary','settings','inventory','information','quests','notes',
 'session-library','soundboard','session-recordings','presentation','economy',
 'crafting','tools','gameplay','world','battle-maps','advanced-dice','random-tables',
 'encounter-rewards','asteria-calendar','weather-environment','world-atlas'
];
const enabled={gm:true,digitalGM:true,economy:true,progression:true,
 media:true,dice:true,layout:true};

test('Phase 3.4: every GM toolkit tile uses an explicit supported React route',()=>{
  const ids=GM_TOOLKIT_TOOLS.map(t=>t.id);
  assert.ok(ids.includes('npc-library'));
  assert.equal(ids.length,new Set(ids).size);
  for(const tool of GM_TOOLKIT_TOOLS){
    const route=gmToolkitDestination(tool,{tabs,enabled});
    assert.equal(route.enabled,true,tool.id+' must have a supported route');
    assert.ok(tabs.includes(route.tab));
  }
  assert.equal(gmToolkitDestination({id:'gm-controls',tab:'tools'},{tabs,enabled}).tab,'main');
  assert.equal(gmToolkitDestination({id:'rewards',tab:'tools'},{tabs,enabled}).tab,'gameplay');
  assert.equal(gmToolkitDestination({id:'npc-library',tab:'bestiary'},
    {tabs,enabled:{...enabled,digitalGM:false}}).enabled,false);
  assert.equal(gmToolkitDestination({id:'arbitrary',tab:'legacy-route'},
    {tabs,enabled}).enabled,false);
  assert.ok(filterGMToolkit({query:'NPC'}).some(group=>
    group.tools.some(tool=>tool.id==='npc-library')));
  assert.equal(gmToolkitMetrics({session:{status:'active'},
    party:[{id:'a'}],quests:[{status:'Draft'},{status:'Archived'}]}).openQuests,1);
});
test('Phase 3.4: campaign NPCs and creatures use existing private world arrays',()=>{
  const record=updateGMLibrary({npcs:[]},'npc',{
    ...libraryDraft('npc'),name:'Valeric',notes:'Secret plan',hp:'28',xpReward:'100'
  },'npc-one');
  assert.equal(record.ok,true);
  assert.equal(record.record.name,'Valeric');
  assert.equal(libraryEncounterReady(record.record),true);
  const world={npcs:record.patch.npcs,creatures:[]};
  assert.equal(gmNPCCreatureLibrary(world,[],{query:'Valeric'}).rows.length,1);
  assert.equal(gmNPCCreatureLibrary(world,[],{kind:'npc'}).counts.npc,1);
  assert.equal(removeGMLibraryRecord(world,'npc','npc-one').patch.npcs.length,0);
  assert.equal(updateGMLibrary(world,'npc',{name:'Spoof',ownerUid:'x',
    published:true},'npc-two').record.ownerUid,undefined);
});
test('Phase 3.4: published creature catalogue is a read-only reference',()=>{
  const publicRows=officialCreatureLibraryEntries([{id:'bestiary-one',
    title:'Varkhyn',summary:'Snow hunter'}]);
  assert.equal(publicRows.length,1);
  assert.equal(publicRows[0].official,true);
  assert.equal(publicRows[0].kind,'official');
  assert.equal(updateGMLibraryCard({creatures:[]},'creature',
    publicRows[0].id,{theme:'slate'}).ok,false);
  assert.throws(()=>worldMutation({creatures:[]},{
    type:'library-delete',kind:'creature',id:'official:bestiary-one',
    expectedUpdatedAt:''
  }),/Official and legacy identities are read-only|Invalid campaign record identifier/);
});
test('Phase 3.4: generated NPC concepts are not persisted without explicit save',()=>{
  const world={factions:[{name:'Guild of Ice'}],regions:[{name:'Vaelgard'}]};
  const races=[{title:'Ice Elf'},{title:'Ice Elf'},{title:'Polaris Ursa'}];
  assert.deepEqual(officialNPCRaces(races),['Ice Elf','Polaris Ursa']);
  const opts=npcGeneratorOptions({world,races,race:'Ice Elf',
    faction:'Guild of Ice',location:'Vaelgard'});
  assert.equal(opts.race,'Ice Elf');
  const concept=generateNPCConcept({seed:12345,world,races,options:opts});
  assert.equal(concept.race,'Ice Elf');
  assert.equal(concept.faction,'Guild of Ice');
  assert.equal(world.npcs,undefined);
  assert.deepEqual(generateNPCConcept({seed:12345,world,races,options:opts}),concept);
  assert.equal(npcGeneratorOptions({world,races,race:'Not Published'}).race,'');
});
test('Phase 3.4: character card mutations are field allowlisted and GM private',()=>{
  const world={npcs:[{id:'npc-one',name:'Valeric'}]};
  const check=validateGMCharacterCard({template:'portrait',theme:'slate',
    fields:['description','notes']},'npc');
  assert.equal(check.ok,true);
  const changed=updateGMLibraryCard(world,'npc','npc-one',check.card);
  assert.equal(changed.ok,true);
  assert.equal(changed.patch.npcs[0].card.theme,'slate');
  assert.equal(updateGMLibraryCard(world,'npc','legacy-npc-0',check.card).ok,false);
  assert.equal(validateGMCharacterCard({portraitUrl:'javascript:alert(1)'},'npc').ok,false);
});
test('Phase 3.4: NPC check context is scoped to server-validated NPC identity',()=>{
  const checks=checkProjection([{id:'check-one',characterId:'hero-one',characterName:'Hero',
    status:'pending',type:'social',skill:'persuasion',context:{
      kind:'npc',npcId:'npc-one',label:'Valeric'
    }},{id:'check-other',characterId:'hero-two',status:'pending',type:'skill',
      context:{kind:'npc',npcId:'npc-two'}}],'gm');
  assert.equal(checks[0].contextNpcId,'npc-one');
  assert.equal(checks[1].contextNpcId,'npc-two');
  assert.equal(checkProjection([{id:'check-one',characterId:'hero-one',
    context:{kind:'npc',npcId:'npc-one'}}],'player','hero-one')[0].contextNpcId,'');
  assert.doesNotThrow(()=>assertCheckPayload('gm',{action:'create',type:'social',
    characterId:'hero-one',context:{kind:'npc',npcId:'npc-one'}}));
  assert.throws(()=>assertCheckPayload('player',{action:'create',type:'social',
    characterId:'hero-one'}),/Only a GM/);
});
test('Phase 3.4: React uses existing Digital GM and Universal Check services, not legacy globals',()=>{
  const page=read('frontend/src/pages/GMDashboardPage.jsx');
  const library=read('frontend/src/dashboard/GMNpcCreatureWorkspace.jsx');
  const toolkit=read('frontend/src/dashboard/GMToolkitWorkspace.jsx');
  const checks=read('frontend/src/dashboard/GMNpcCheckComposer.jsx');
  const cards=read('frontend/src/dashboard/GMNpcCharacterCards.jsx');
  const generator=read('frontend/src/dashboard/GMNpcGenerator.jsx');
  const backend=read('frontend/src/digitalGM/firebaseDigitalGMService.mjs');
  const progression=read('frontend/src/progression/firebaseProgressionService.mjs');
  assert.match(page,/<GMNpcCreatureWorkspace/);
  assert.match(page,/<GMToolkitWorkspace/);
  assert.match(page,/<GMToolkitQuickAccess/);
  assert.match(library,/loadPublicDomain\('creature'\)/);
  assert.match(library,/loadPublicDomain\('race'\)/);
  assert.match(library,/api\.digitalGM\.world/);
  assert.match(library,/GMNpcCheckComposer/);
  assert.match(toolkit,/gmToolkitDestination/);
  assert.match(checks,/api\.checkGM\(campaignId/);
  assert.match(checks,/context:\{kind:'npc',npcId:npc\.id\}/);
  assert.match(cards,/Save Character Card/);
  assert.match(generator,/Use in NPC Editor/);
  assert.match(backend,/worldMutation\(saved\.world\|\|\{\},operation\)/);
  assert.match(progression,/asteriaUniversalCheck/);
  assert.doesNotMatch(page,/window\.AsteriaFirebase/);
  assert.doesNotMatch(library,/window\.Asteria|initializeApp\(|firebaseService/);
});
