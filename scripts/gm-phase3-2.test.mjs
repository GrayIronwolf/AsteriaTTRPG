import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  NPC_GENERATOR_ROLES,NPC_GENERATOR_MOODS,officialNPCRaces,npcWorldOptions,
  npcGeneratorOptions,npcGeneratorDefaults,generateNPCConcept
} from '../src/state/gmNpcGeneratorModel.mjs';
import {libraryDraft,updateGMLibrary} from '../src/state/gmNpcCreatureLibraryModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const races=[
  {title:'Ice Elf',playable:true},{title:'Sphenari',playable:true},
  {title:'Ice Elf',playable:true},{title:'Forbidden Test Race',playable:false}
];
const world={
  factions:[{id:'f1',name:'Guild of Sails'},{name:'Watch'}],
  settlements:[{id:'s1',name:'Vaelgard'}],
  regions:[{id:'r1',name:'Altarin'}],
  npcs:[{id:'npc-1',name:'Existing NPC'}]
};

test('Phase 3.2 has useful narrative roles and moods; no character or combat stat generation',()=>{
  assert.ok(NPC_GENERATOR_ROLES.length>=12);
  assert.deepEqual(NPC_GENERATOR_MOODS,['Grounded','Mysterious','Friendly','Suspicious','Dramatic']);
  assert.equal(npcGeneratorDefaults().role,'Merchant');
  assert.equal(npcGeneratorDefaults().race,'');
  assert.deepEqual(officialNPCRaces(races),['Ice Elf','Sphenari']);
  assert.deepEqual(npcWorldOptions(world),{factions:['Guild of Sails','Watch'],locations:['Altarin','Vaelgard']});
  const result=generateNPCConcept({seed:124,options:{role:'Guard'},world,races});
  for(const field of ['name','personality','goals','fears','dialogueStyle','description'])
    assert.ok(result[field].length>0,field+' missing');
  for(const field of ['hp','xp','xpReward','ac','nac','mp','sp','characteristics','Asteria ID Index Code'])
    assert.equal(result[field],undefined,'Invented gameplay field: '+field);
});

test('Generated NPC is deterministic and can use official race / existing world context only',()=>{
  const options={role:'Scholar',mood:'Mysterious',race:'Ice Elf',faction:'Guild of Sails',location:'Vaelgard'};
  const args={seed:15677,options,world,races};
  const a=generateNPCConcept(args),b=generateNPCConcept(args);
  assert.deepEqual(a,b);
  assert.equal(a.race,'Ice Elf');
  assert.equal(a.species,'Ice Elf');
  assert.equal(a.faction,'Guild of Sails');
  assert.equal(a.location,'Vaelgard');
  assert.equal(a.role,'Scholar');
  assert.equal(a.notes,'');
  assert.ok(!a.description.includes('Asteria ID Index'));
  assert.deepEqual(npcGeneratorOptions({...options,world,races}),options);
  assert.deepEqual(npcGeneratorOptions({
    race:'Unconfirmed Race',faction:'Secret New Faction',location:'New City',
    role:'God Emperor',mood:'Unknown',world,races
  }),{race:'',faction:'',location:'',role:'Merchant',mood:'Grounded'});
});

test('Independent seed streams allow preserving or rerolling individual fields',()=>{
  const a=generateNPCConcept({seed:1,options:{role:'Guide',mood:'Friendly'},world,races});
  const all=generateNPCConcept({seed:77,options:{role:'Guide',mood:'Friendly'},world,races,previous:a,
    locked:['name','personality','goals','fears','dialogueStyle','description']});
  for(const key of ['name','personality','goals','fears','dialogueStyle','description'])
    assert.equal(all[key],a[key]);
  const rerolled=generateNPCConcept({seed:781,options:{role:'Guide',mood:'Friendly'},world,races,previous:a,
    locked:['personality','goals','fears','dialogueStyle','description']});
  assert.equal(rerolled.personality,a.personality);
  assert.equal(rerolled.goals,a.goals);
  assert.equal(rerolled.fears,a.fears);
  assert.equal(rerolled.dialogueStyle,a.dialogueStyle);
  assert.equal(rerolled.description,a.description);
  assert.ok(rerolled.name);
});

test('Generated NPC transfers safely to existing campaign NPC library after manual approval',()=>{
  const concept=generateNPCConcept({seed:404,options:{
    role:'Innkeeper',mood:'Suspicious',race:'Sphenari',faction:'Watch',location:'Altarin'
  },world,races});
  const approved={...concept,name:'Edited NPC Name',notes:'Known to the party'};
  const draft=libraryDraft('npc',approved);
  assert.equal(draft.name,'Edited NPC Name');
  assert.equal(draft.race,'Sphenari');
  assert.equal(draft.fears,approved.fears);
  assert.equal(draft.dialogueStyle,approved.dialogueStyle);
  const original=JSON.stringify(world);
  const saved=updateGMLibrary(world,'npc',draft,'npc-generated-test');
  assert.equal(saved.ok,true,saved.error);
  assert.equal(saved.record.name,'Edited NPC Name');
  assert.equal(saved.record.race,'Sphenari');
  assert.equal(saved.record.role,'Innkeeper');
  assert.equal(saved.record.notes,'Known to the party');
  assert.deepEqual(Object.keys(saved.patch),['npcs']);
  assert.equal(saved.patch.npcs.length,2);
  assert.equal(JSON.stringify(world),original,'Generator must not mutate current campaign');
});

test('The NPC generator is local to GM Library and saves only after explicit NPC editor approval',()=>{
  const model=read('src/state/gmNpcGeneratorModel.mjs');
  const ui=read('src/dashboards/GMNpcGenerator.jsx');
  const library=read('src/dashboards/GMNpcCreatureLibrary.jsx');
  const service=read('src/dashboards/GMDashboard.jsx');
  const mount=read('src/app/mountDashboard.jsx');
  const css=read('src/styles/gm-npc-generator.css');
  assert.match(library,/<GMNpcGenerator world=\{world\} onUseDraft=\{acceptGeneratedNPC\}/);
  assert.match(library,/setEditing\(\{kind:'npc',id:null\}\)/);
  assert.match(library,/setDraft\(libraryDraft\('npc',concept\)\)/);
  assert.match(library,/saveSection\('world',result\.patch\)/);
  assert.match(library,/Generate NPC/);
  assert.match(ui,/Use in NPC Editor/);
  assert.match(ui,/Discard Preview/);
  assert.match(ui,/onUseDraft\(\{\.\.\.concept,libraryKind:'npc'\}\)/);
  assert.match(ui,/AsteriaRaceCompendium\?\.entries\?\.\(\)/);
  assert.match(ui,/onClick=\{\(\)=>reroll\(field\)\}/);
  assert.match(ui,/role="status" aria-live="polite"/);
  assert.match(service,/AsteriaCharacterAccess\.isGM\(/);
  assert.match(mount,/import '\.\.\/styles\/gm-npc-generator\.css'/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/:focus-visible/);
  assert.doesNotMatch(model+ui,/setDoc\(|updateDoc\(|httpsCallable|firebaseService|localStorage|fetch\(/);
});
