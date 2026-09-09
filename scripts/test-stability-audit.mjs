import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addGrantedMagicElement,
  incomingSnapshotIsStale,
  mergeLinkedCharacter,
  safeLinkedCharacterPatch,
  strictResourcePair
} from '../src/state/characterIntegrityModel.mjs';
import {
  encounterResourcePair,
  encounterSourceResources,
  preserveEncounterResources,
  setEncounterResource
} from '../src/state/encounterResourceModel.mjs';
import { pendingLootEvent, questNoticeEvent, xpNoticeEvent } from '../src/state/liveEventReducer.mjs';
import { applyCharacteristicAllocations, normalizeInventoryItems, stableInventoryItemId } from '../src/state/liveWorkspaceModel.mjs';
import { markQuestRewardClaimed, normalizeAssignedQuest, questRewardClaimed, questRewardSummary } from '../src/state/questRewardModel.mjs';
import { applyRest, applySoulDamage, recoverSoulDamage, soulDamageValue } from '../src/state/specialDamageModel.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const cases=[];
function test(name,action){cases.push({name,action});}

test('1. Linked profile updates preserve canonical XP, level, CP, and inventory',()=>{
  const existing={name:'Old',level:12,xp:850,cp:7,inventory:[{instanceId:'blade-1',name:'Blade'}]};
  const merged=mergeLinkedCharacter(existing,{name:'New',level:0,xp:0,cp:0,inventory:[]},{sharedCampaignId:'campaign-1'});
  assert.equal(merged.name,'New');
  assert.equal(merged.level,12);
  assert.equal(merged.xp,850);
  assert.equal(merged.cp,7);
  assert.equal(merged.inventory.length,1);
});

test('2. Safe linked-character patches never contain live gameplay state',()=>{
  const patch=safeLinkedCharacterPatch({name:'Mako',race:'Pixie',hp:[0,100],xp:0,inventory:[],titles:[]});
  assert.deepEqual(patch,{name:'Mako'}); // Race and class are locked once linked.
});

test('3. Older or undated client snapshots are rejected as stale',()=>{
  assert.equal(incomingSnapshotIsStale({updatedAt:'2026-09-08T10:00:00Z'},{updatedAt:'2026-09-08T09:00:00Z'}),true);
  assert.equal(incomingSnapshotIsStale({updatedAt:'2026-09-08T10:00:00Z'},{}),true);
  assert.equal(incomingSnapshotIsStale({updatedAt:'2026-09-08T10:00:00Z'},{updatedAt:'2026-09-08T11:00:00Z'}),false);
});

test('4. CP allocation keeps XP and level while applying the 1:10 resource rule',()=>{
  const result=applyCharacteristicAllocations({level:9,xp:4421,cp:3,characteristics:{constitution:10,wisdom:8},hp:[70,100],mp:[40,80]},{constitution:2,wisdom:1});
  assert.equal(result.character.level,9);
  assert.equal(result.character.xp,4421);
  assert.equal(result.character.cp,0);
  assert.deepEqual(result.character.hp,[70,120]);
  assert.deepEqual(result.character.mp,[40,90]);
});

test('5. CP allocation refuses to invent a missing resource value',()=>{
  assert.throws(()=>applyCharacteristicAllocations({level:4,xp:200,cp:1,characteristics:{constitution:5}},{constitution:1}),/HP data is missing or invalid/);
});

test('6. HP, SP, and MP validation rejects missing values instead of resetting to zero',()=>{
  assert.deepEqual(strictResourcePair([7,10],'hp'),[7,10]);
  assert.throws(()=>strictResourcePair(undefined,'sp'),/SP data is missing or invalid/);
  assert.throws(()=>strictResourcePair({current:4},'mp'),/MP data is missing or invalid/);
});

test('7. Inventory instance IDs remain stable when catalog IDs are shared',()=>{
  const items=normalizeInventoryItems([{id:'potion',instanceId:'potion-a',name:'Potion'},{id:'potion',instanceId:'potion-b',name:'Potion'}]);
  assert.deepEqual(items.map(stableInventoryItemId),['potion-a','potion-b']);
});

test('8. Duplicate legacy inventory IDs are deterministically separated',()=>{
  const items=normalizeInventoryItems([{id:'ore',name:'Ore'},{id:'ore',name:'Ore'}]);
  assert.equal(new Set(items.map(item=>item.instanceId)).size,2);
  assert.deepEqual(items.map(item=>item.instanceId),['ore','ore-2']);
});

test('9. Trade creation escrows the sender item inside the shared transaction',()=>{
  const source=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  assert.match(source,/createLiveItemRequest:[\s\S]*?if\(action!=='identify'\) item\.qty=Number\(item\.qty\|\|1\)-quantity;[\s\S]*?writeLiveCharacter\(transaction,refs,character\);[\s\S]*?transaction\.set\(ecosystemRef/);
});

test('10. Trade acceptance and final confirmation are guarded against replay',()=>{
  const source=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  assert.match(source,/request\.status!=='pending'/);
  assert.match(source,/request\.status!=='awaiting-sender'/);
  assert.match(source,/request\.status=accepted\?'accepted':'declined'/);
});

test('11. Received loot resolves once and terminal events do not reopen',()=>{
  assert.equal(pendingLootEvent([{id:'loot-1',type:'loot-reward',status:'accepted',resolvedAt:'2026-09-08'}]),null);
  const source=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  assert.match(source,/resolvedItemRewardIds=uniqueValues\(character\.resolvedItemRewardIds,\[eventId\]\)/);
});

test('12. Accepted magic elements persist once without duplicates',()=>{
  const first=addGrantedMagicElement({magicTypes:['Water']},'Earth Magic');
  const second=addGrantedMagicElement(first.character,'earth');
  assert.equal(first.added,true);
  assert.equal(second.added,false);
  assert.deepEqual(second.character.gmGrantedMagicTypes,['Earth']);
});

test('13. Assigned quests retain structured rewards',()=>{
  const quest=normalizeAssignedQuest({name:'The Gate',description:'Seal the gate.',reward:{xp:500,currency:{key:'gold',amount:3},items:[{name:'Key',qty:1}] }},{id:'quest-1',assignedBy:'gm-1'});
  assert.equal(quest.id,'quest-1');
  assert.match(questRewardSummary(quest.reward),/500 XP/);
  assert.match(questRewardSummary(quest.reward),/3 Crown \(Gold\)/);
  assert.equal(quest.reward.items[0].name,'Key');
});

test('14. Quest rewards cannot be claimed twice',()=>{
  const first=markQuestRewardClaimed({id:'quest-1'},'reward-1','2026-09-08T10:00:00Z');
  const second=markQuestRewardClaimed(first.quest,'reward-2','2026-09-08T11:00:00Z');
  assert.equal(first.applied,true);
  assert.equal(second.applied,false);
  assert.equal(second.quest.rewardTransactionId,'reward-1');
  assert.equal(questRewardClaimed(second.quest),true);
});

test('15. Quest and XP notifications stay closed after acknowledgement',()=>{
  assert.equal(questNoticeEvent([{id:'quest-event',type:'quest-assigned',acknowledged:true}]),null);
  assert.equal(xpNoticeEvent([{id:'xp-event',type:'xp-reward'}],new Set(['xp-event'])),null);
});

test('16. Soul Damage seals HP and only explicit long-rest recovery removes it',()=>{
  const damaged=applySoulDamage({hp:[100,100],sp:[20,20],mp:[30,30]},25).entity;
  assert.equal(soulDamageValue(damaged),25);
  assert.deepEqual(damaged.hp,[75,100]);
  const short=applyRest(damaged,'short',25).entity;
  assert.equal(soulDamageValue(short),25);
  const long=applyRest(short,'long',10).entity;
  assert.equal(soulDamageValue(long),15);
});

test('17. Rest recovery does not create absent resource fields',()=>{
  const short=applyRest({hp:[5,10]},'short');
  assert.equal(Object.hasOwn(short.entity,'sp'),false);
  assert.equal(Object.hasOwn(short.entity,'mp'),false);
});

test('18. Direct Soul Damage recovery clamps at the recorded amount',()=>{
  const damaged=applySoulDamage({hp:[40,50]},20).entity;
  const recovered=recoverSoulDamage(damaged,100);
  assert.equal(recovered.recovered,20);
  assert.equal(recovered.soulDamage,0);
});

test('19. Encounter sources preserve missing SP and MP as unrecorded',()=>{
  const resources=encounterSourceResources({health:{current:12,max:20}});
  assert.deepEqual(resources.hp,[12,20]);
  assert.equal(resources.sp,null);
  assert.equal(resources.mp,null);
  assert.equal(encounterSourceResources({hp:[20,20],mp:[0,0]}).mp,null);
});

test('20. Encounter resource edits clamp current values to maximum',()=>{
  const changed=setEncounterResource({id:'enemy-1'},'mp',90,40);
  assert.deepEqual(encounterResourcePair(changed,'mp'),[40,40]);
  assert.throws(()=>setEncounterResource(changed,'sp',1,0),/maximum greater than zero/);
});

test('21. Whole encounter saves preserve newer canonical resources',()=>{
  const incoming=[{id:'enemy-1',name:'Shade',hp:[30,30],initiative:14}];
  const persisted=[{id:'enemy-1',name:'Shade',hp:[7,30],sp:[4,10],initiative:10}];
  const [merged]=preserveEncounterResources(incoming,persisted);
  assert.deepEqual(merged.hp,[7,30]);
  assert.deepEqual(merged.sp,[4,10]);
  assert.equal(merged.initiative,14);
});

test('22. Gallery uploads enforce permanent Firebase URLs and exact image types',()=>{
  const firebase=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  const storageRules=read('storage.rules');
  assert.match(firebase,/image\/png','image\/jpeg','image\/webp','image\/gif/);
  assert.match(firebase,/\^https:\\\/\\\//i);
  assert.match(storageRules,/image\/\(png\|jpeg\|webp\|gif\)/);
  assert.match(storageRules,/8 \* 1024 \* 1024/);
});

test('23. Title revoke and storage grants use GM-authorized transactions',()=>{
  const firebase=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  assert.match(firebase,/manageCharacterTitle:[\s\S]*?requireCampaignGM[\s\S]*?titles\.splice\(index,1\)/);
  assert.match(firebase,/grantCharacterStorageSlots:[\s\S]*?requireCampaignGM[\s\S]*?storageLimit:Math\.max\(3/);
});

test('24. Encounter resources use a narrow GM-only transactional endpoint',()=>{
  const firebase=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  assert.match(firebase,/updateCampaignEncounterResource:[\s\S]*?runTransaction[\s\S]*?requireCampaignGM[\s\S]*?setEncounterResource/);
  assert.match(read('src/firebase/asteriaFirebaseService.js'),/updateEncounterResource/);
});

test('25. Theme changes update shared border, focus, and selected-state tokens',()=>{
  const theme=read('js/asteria-ui-theme-system.js');
  ['--asteria-border','--asteria-border-subtle','--asteria-border-active','--asteria-border-highlight','--asteria-focus','--asteria-button-active-bg'].forEach(token=>assert.match(theme,new RegExp(token)));
  assert.match(read('src/styles/asteria-react.css'),/var\(--asteria-button-active-bg/);
});

test('26. Live event snapshots replace old query results and subscriptions clean up',()=>{
  const hook=read('src/sessions/useCampaignLiveData.js');
  assert.match(hook,/setEvents\(mergeEvents\(\[\],\s*value\s*\|\|\s*\[\]\)\)/);
  assert.match(hook,/unsubscribers\.forEach\(unsubscribe/);
  assert.doesNotMatch(hook,/setEvents\(previous => mergeEvents/);
});

test('27. Player mutations verify the linked character owner',()=>{
  const firebase=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  ['spendCharacteristicPoints','purchaseTalentRank','recordSkillSuccess','castCharacterSpell','updateCharacterInventory','updateCharacterQuest','addJournalEntry'].forEach(name=>{
    const start=firebase.indexOf(`${name}:`);
    assert.notEqual(start,-1,`${name} is missing`);
    assert.match(firebase.slice(start,start+5200),/verifyOwnedLiveCharacter/);
  });
});

test('28. The owning dashboard mirrors canonical cross-account updates to the source character ID',()=>{
  const dashboard=read('src/dashboards/CharacterDashboard.jsx');
  assert.match(dashboard,/mirrorOwnedCharacter\(character\.sourceCharacterId\|\|character\.id,character\)/);
  assert.match(read('js/data-sync.js'),/const sourceId=character\.sourceCharacterId \|\| id;/);
});

test('29. Firebase security roles agree with runtime GM and member authorization',()=>{
  const rules=read('firestore.rules');
  assert.match(rules,/data\.roles\[request\.auth\.uid\] == 'gm'/);
  assert.match(rules,/data\.roles\[request\.auth\.uid\] == 'player'/);
  assert.match(rules,/campaign\.roles\[request\.auth\.uid\] == 'gm'/);
});

test('30. Production code contains no database wipe or destructive reset path',()=>{
  const firebase=(read('js/firebase-auth.js') + '\n' + read('functions/commands.mjs'));
  assert.doesNotMatch(firebase,/deleteCollection|recursiveDelete|resetDatabase|wipeAllCharacters/);
});

test('31. Canonical owner mirroring cannot synchronously crash the dashboard or fixture',()=>{
  const dashboard=read('src/dashboards/CharacterDashboard.jsx');
  const fixtures=read('src/devFixtures.js');
  assert.match(dashboard,/Promise\.resolve\(\)[\s\S]*?mirrorOwnedCharacter/);
  assert.match(fixtures,/saveOwnedCharacterSnapshot:[\s\S]*?ownedCharacters\[characterId\]/);
});

test('32. Generated compendium content paths exist with exact casing',()=>{
  const indexes=['js/race-compendium-data.js','js/class-compendium-data.js','js/universal-compendium-index.js','data/compendium-index-clean.json'];
  const directories=new Map();
  for(const index of indexes){
    const paths=[...new Set([...read(index).matchAll(/"(?:sourcePath|sourceFolder|contentPath)":\s*"(content\/[^"\n]+)"/g)].map(match=>match[1]))];
    assert.ok(paths.length>0,`${index}: no content paths checked`);
    for(const contentPath of paths){
      let directory=root;
      for(const segment of contentPath.split('/')){
        if(!directories.has(directory)) directories.set(directory,fs.readdirSync(directory));
        assert.ok(directories.get(directory).includes(segment),`${index}: missing or incorrectly cased ${contentPath}`);
        directory=path.join(directory,segment);
      }
    }
  }
});

let failed=0;
for(const record of cases){
  try{await record.action();console.log(`PASS ${record.name}`);}
  catch(error){failed+=1;console.error(`FAIL ${record.name}`);console.error(error.stack||error);}
}
if(failed){console.error(`\n${failed}/${cases.length} stability audit tests failed.`);process.exit(1);}
console.log(`\n${cases.length}/${cases.length} stability audit tests passed.`);
