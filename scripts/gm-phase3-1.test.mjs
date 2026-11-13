import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GM_LIBRARY_KINDS,GM_LIBRARY_MAX_RECORDS,libraryCollectionKey,libraryDraft,
  buildGMLibraryRecord,updateGMLibrary,removeGMLibraryRecord,libraryEncounterReady,
  officialCreatureLibraryEntries,gmNPCCreatureLibrary
} from '../src/state/gmNpcCreatureLibraryModel.mjs';
import {defaultGMWorkspace,normalizeGMWorkspace,migrateLegacyGMWorkspace} from '../src/state/gmWorkspaceModel.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('3.1 reuses legacy campaign NPCs and adds optional custom creatures on the same private world document',()=>{
  const legacy={world:{npcs:[{id:'npc-legacy',name:'Borin',personality:'Honourable',faction:'Guild'}],regions:[{id:'reg-1'}]}};
  const world=normalizeGMWorkspace(legacy).world;
  assert.deepEqual(world.npcs,legacy.world.npcs);
  assert.deepEqual(world.creatures,[]);
  assert.deepEqual(world.regions,legacy.world.regions);
  assert.deepEqual(defaultGMWorkspace().world.creatures,[]);
  const migrated=migrateLegacyGMWorkspace({world:{npcs:[{id:'npc-one',name:'Eldra'}],creatures:[{id:'creature-one',name:'Nightfang'}]}});
  assert.equal(migrated.world.npcs.length,1);
  assert.equal(migrated.world.creatures.length,1);
  assert.deepEqual(GM_LIBRARY_KINDS,['npc','creature']);
  assert.equal(libraryCollectionKey('npc'),'npcs');
  assert.equal(libraryCollectionKey('creature'),'creatures');
  assert.equal(libraryCollectionKey('official'),null);
});

test('GM library creates and edits campaign NPCs without replacing other world sections',()=>{
  const world={npcs:[{id:'npc-existing',name:'Old NPC',personality:'Gruff',legacyFlag:'keep'}],
    creatures:[{id:'creature-existing',name:'Old Creature'}],weather:'Snow'};
  const before=JSON.stringify(world);
  const npcDraft=libraryDraft('npc',{name:'  Auralis  ',personality:'Patient',faction:'Ravens',notes:'GM secret'});
  const saved=updateGMLibrary(world,'npc',npcDraft,'npc-unique123');
  assert.equal(saved.ok,true,saved.error);
  assert.deepEqual(Object.keys(saved.patch),['npcs']);
  assert.equal(saved.patch.npcs.length,2);
  assert.equal(saved.record.name,'Auralis');
  assert.equal(saved.record.notes,'GM secret');
  assert.equal(saved.record.libraryKind,'npc');
  assert.equal(saved.record.published,undefined);
  assert.equal(saved.record.ownerUid,undefined);
  assert.equal(JSON.stringify(world),before);
  const edit=updateGMLibrary({...world,...saved.patch},'npc',
    libraryDraft('npc',{name:'Renamed',personality:'Kind'}),'npc-existing');
  assert.equal(edit.ok,true);
  assert.equal(edit.patch.npcs.length,2);
  assert.equal(edit.patch.npcs[0].name,'Renamed');
  assert.equal(edit.patch.npcs[0].legacyFlag,'keep');
  const removed=removeGMLibraryRecord({...world,...saved.patch},'npc','npc-unique123');
  assert.equal(removed.ok,true);
  assert.deepEqual(removed.patch.npcs,world.npcs);
  assert.deepEqual(Object.keys(removed.patch),['npcs']);
  assert.equal(removeGMLibraryRecord(world,'npc','missing').ok,false);
});

test('Custom creatures have optional encounter stats and do not invent official Asteria IDs',()=>{
  const draft=libraryDraft('creature',{name:'Dire Frost Wolf',species:'Winter beast',
    hp:125,sp:30,mp:0,ac:12,initiative:11,xpReward:120,threatTier:'TT 4'});
  const created=updateGMLibrary({creatures:[]},'creature',draft,'creature-wolf01');
  assert.equal(created.ok,true,created.error);
  assert.equal(created.record.hp,125);
  assert.equal(created.record.mp,0);
  assert.equal(created.record.ac,12);
  assert.equal(created.record.xpReward,120);
  assert.equal(created.record.threatTier,'TT 4');
  assert.equal(created.record['Asteria ID Index Code'],undefined);
  assert.equal(libraryEncounterReady(created.record),true);
  assert.equal(libraryEncounterReady({hp:30}),false);
  assert.equal(libraryEncounterReady({hp:0,xpReward:30}),false);
  assert.equal(libraryEncounterReady({hp:[30,30],xpReward:0}),true);
  assert.equal(updateGMLibrary({creatures:[]},'creature',libraryDraft('creature',{name:'Incomplete'}),'creature-incomplete').ok,true);
  assert.equal(libraryEncounterReady(updateGMLibrary({creatures:[]},'creature',libraryDraft('creature',{name:'Incomplete'}),'creature-incomplete').record),false);
});

test('Save validation rejects invalid names, IDs, unsafe numeric values, excess text and over-capacity collections',()=>{
  assert.equal(buildGMLibraryRecord('npc',{name:'A'},'x').ok,false);
  assert.equal(buildGMLibraryRecord('npc',{name:'   '},'npc-valid').ok,false);
  assert.equal(buildGMLibraryRecord('bogus',{name:'Creature'},'valid-record').ok,false);
  for(const value of ['-1','NaN','Infinity','1.5','1000000001'])
    assert.equal(buildGMLibraryRecord('creature',{name:'X',hp:value},'creature-test').ok,false,value);
  assert.equal(buildGMLibraryRecord('creature',{name:'X',hp:'0'},'creature-test').ok,false);
  assert.equal(buildGMLibraryRecord('npc',{name:'X',notes:'a'.repeat(1201)},'npc-notes').ok,false);
  assert.equal(buildGMLibraryRecord('npc',{name:'X'.repeat(121)},'npc-long').ok,false);
  const tooMany=Array.from({length:GM_LIBRARY_MAX_RECORDS},(_,i)=>({id:'npc-'+i,name:'N'}));
  assert.equal(updateGMLibrary({npcs:tooMany},'npc',libraryDraft('npc',{name:'Extra'}),'npc-extra').ok,false);
  assert.equal(updateGMLibrary({npcs:tooMany},'npc',libraryDraft('npc',{name:'Updated'}),'npc-1').ok,true);
});

test('Search and filtering combine existing NPCs, custom creatures and read-only official compendium entries',()=>{
  const entries=[{id:'creature-manifest:dire-wolf',title:'Dire Wolf',slug:'dire-wolf',metadata:{creatureType:'Animal',threatTier:'TT 3',biome:'Forest'},summary:'Pack predator'},
    {id:'creature-manifest:ash-imp',title:'Ash Imp',creatureType:'Demon',threatTier:'TT 1'}];
  const world={npcs:[{id:'npc-auralis',name:'Auralis',faction:'Raven Guild',personality:'Quiet'}],
    creatures:[{id:'creature-shade',name:'Shade Bear',species:'Beast',location:'Forest',threatTier:'TT 4'}]};
  const raw=JSON.stringify({world,entries});
  const catalogue=gmNPCCreatureLibrary(world,entries);
  assert.deepEqual(catalogue.counts,{npc:1,creature:1,official:2});
  assert.equal(catalogue.rows.length,4);
  assert.deepEqual(gmNPCCreatureLibrary(world,entries,{kind:'npc'}).rows.map(row=>row.name),['Auralis']);
  assert.deepEqual(gmNPCCreatureLibrary(world,entries,{kind:'official'}).rows.map(row=>row.name),['Dire Wolf','Ash Imp']);
  assert.deepEqual(gmNPCCreatureLibrary(world,entries,{query:'FOREST'}).rows.map(row=>row.name),['Shade Bear','Dire Wolf']);
  assert.deepEqual(gmNPCCreatureLibrary(world,entries,{query:'raven'}).rows.map(row=>row.name),['Auralis']);
  assert.equal(officialCreatureLibraryEntries(entries)[0].sourceId,'creature-manifest:dire-wolf');
  assert.equal(officialCreatureLibraryEntries(entries)[0].threatTier,'TT 3');
  assert.equal(officialCreatureLibraryEntries(entries)[0].official,true);
  assert.equal(JSON.stringify({world,entries}),raw);
});

test('NPC library is GM-only; custom cards and generator preserve official read-only records',()=>{
  const dashboard=read('src/dashboards/GMDashboard.jsx');
  const ui=read('src/dashboards/GMNpcCreatureLibrary.jsx');
  const model=read('src/state/gmNpcCreatureLibraryModel.mjs');
  const toolkit=read('src/state/gmToolkitModel.mjs');
  const mount=read('src/app/mountDashboard.jsx');
  const workspace=read('src/state/gmWorkspaceModel.mjs');
  assert.match(dashboard,/AsteriaCharacterAccess\.isGM\(/);
  assert.match(dashboard,/\{ id: 'bestiary', label: 'NPC & Creature Library'/);
  assert.match(dashboard,/\{tab === 'bestiary' \? <GMNpcCreatureLibrary/);
  assert.match(dashboard,/campaignCreatures=\{live\.gmWorkspace\?\.world\?\.creatures\|\|\[\]\}/);
  assert.match(dashboard,/campaignCreatures\.filter\(libraryEncounterReady\)/);
  assert.match(ui,/official\?'Official Creature Compendium'/);
  assert.match(ui,/row\.official\?<div className="react-gm-library-entry-actions"/);
  assert.match(ui,/onSave=\{cardTarget.kind==='official'\?undefined:saveCard\}/);
  assert.match(ui,/!row\.official\?/);
  assert.match(ui,/saveSection\('world',result\.patch\)/);
  assert.match(ui,/Confirm Delete/);
  assert.match(toolkit,/id:'npc-library',label:'NPC & Creature Library',tab:'bestiary'/);
  assert.match(mount,/import '\.\.\/styles\/gm-npc-library\.css'/);
  assert.match(workspace,/creatures:array\(world\.creatures\)/);
  assert.doesNotMatch(model+ui,/firebaseService|setDoc\(|httpsCallable|localStorage|Math\.random\(\)\s*\*\s*1000/);
  assert.doesNotMatch(ui,/generatedNPC|generateRandomNPC|ObsidianVault|firebaseService\.setDoc/);
});

test('New library UI remains responsive, accessible and scoped to GM Dashboard',()=>{
  const css=read('src/styles/gm-npc-library.css');
  const ui=read('src/dashboards/GMNpcCreatureLibrary.jsx');
  assert.match(css,/\.react-gm-dashboard \.react-gm-npc-library/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/:focus-visible/);
  assert.match(ui,/role="status"/);
  assert.match(ui,/aria-live="polite"/);
  assert.match(ui,/aria-pressed=\{filter===value\}/);
  assert.match(ui,/disabled=\{busy\}/);
  assert.match(ui,/title|threatTier/);
  assert.doesNotMatch(css,/\.react-dashboard-custom-grid\s*\{|\.react-workspace-sidebar\s*\{/);
});
