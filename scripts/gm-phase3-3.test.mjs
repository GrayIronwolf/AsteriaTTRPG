import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 GM_CARD_TEMPLATES,GM_CARD_THEMES,GM_CARD_FIELDS,defaultGMCharacterCard,
 normalizeGMCharacterCard,validateGMCharacterCard,safeGMCardPortrait,
 updateGMLibraryCard,moveGMCardField,toggleGMCardField,gmCharacterCardSections
} from '../src/state/gmCharacterCardModel.mjs';
import {libraryDraft,updateGMLibrary,gmNPCCreatureLibrary} from '../src/state/gmNpcCreatureLibraryModel.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Three card layouts and finishes, default GM privacy',()=>{
 assert.deepEqual(GM_CARD_TEMPLATES.map(x=>x.id),['portrait','dossier','tactical']);
 assert.deepEqual(GM_CARD_THEMES.map(x=>x.id),['obsidian','slate','parchment']);
 const npc=defaultGMCharacterCard('npc'),creature=defaultGMCharacterCard('creature');
 assert.equal(npc.template,'portrait');
 assert.equal(creature.template,'tactical');
 assert.ok(npc.fields.includes('personality')&&creature.fields.includes('hp'));
 assert.ok(!npc.fields.includes('notes'));
 assert.equal(new Set(GM_CARD_FIELDS.map(x=>x.id)).size,GM_CARD_FIELDS.length);
 assert.equal(validateGMCharacterCard(npc,'npc').ok,true);
});

test('Card settings reject unsafe attributes and arbitrary record fields',()=>{
 const untrusted={version:99,template:'bad',theme:'invalid',tagline:' a '.repeat(120),
   portraitUrl:'javascript:alert(1)',fields:['name','notes','notes','role','__proto__','hp','role'],
   ownerUid:'user-private',visibility:'public',isPublished:true};
 const card=normalizeGMCharacterCard(untrusted,'npc');
 assert.equal(card.template,'portrait');assert.equal(card.theme,'obsidian');
 assert.ok(card.tagline.length<=100);assert.equal(card.portraitUrl,'');
 assert.deepEqual(card.fields,['notes','role','hp']);
 assert.equal(card.ownerUid,undefined);assert.equal(card.visibility,undefined);
 assert.equal(validateGMCharacterCard(untrusted,'npc').ok,false);
 assert.equal(validateGMCharacterCard({template:'invalid'},'npc').ok,false);
 assert.equal(validateGMCharacterCard({theme:'invalid'},'npc').ok,false);
 assert.equal(validateGMCharacterCard({fields:['hp','hp']},'creature').ok,false);
 assert.equal(validateGMCharacterCard({fields:['fake']},'creature').ok,false);
 assert.equal(validateGMCharacterCard({tagline:'a'.repeat(101)},'npc').ok,false);
});

test('Portraits are HTTPS or safe local paths, never executable or credential URLs',()=>{
 for(const url of [
 'javascript:alert(1)','data:image/png;base64,AAAA','blob:some-value',
 'http://untrusted.example.com/image.png','https://user:password@example.com/a.jpg',
 '../admin/portrait.jpg','assets/../secrets.jpg','images/%2e%2e/secret.jpg',
 'https://example.com/img.png#fragment','x'.repeat(601)
 ])assert.equal(safeGMCardPortrait(url),'',url.slice(0,30));
 assert.equal(safeGMCardPortrait('https://example.com/img.png'),'https://example.com/img.png');
 assert.equal(safeGMCardPortrait('images/asteria/portrait.png'),'images/asteria/portrait.png');
 assert.equal(safeGMCardPortrait('assets/characters/npc.webp'),'assets/characters/npc.webp');
 assert.equal(validateGMCharacterCard({portraitUrl:'data:image/png;base64,AAAA'},'npc').ok,false);
});

test('Visibility and field ordering never alter the underlying NPC data',()=>{
 const original=defaultGMCharacterCard('npc');
 const moved=moveGMCardField(original,'npc','personality',-1);
 assert.notDeepEqual(moved.fields,original.fields);
 assert.deepEqual(moveGMCardField(original,'npc','not-a-field',1),original);
 const notes=toggleGMCardField(original,'npc','notes',true);
 assert.equal(notes.fields.at(-1),'notes');
 const hidden=toggleGMCardField(notes,'npc','personality',false);
 assert.ok(!hidden.fields.includes('personality'));
 assert.equal(new Set(hidden.fields).size,hidden.fields.length);
 assert.ok(!original.fields.includes('notes'));
 const record={name:'Vaelryn',personality:'Patient',notes:'Confidential',hp:20};
 assert.equal(gmCharacterCardSections(record,original).some(x=>x.private),false);
 assert.equal(gmCharacterCardSections(record,notes).find(x=>x.id==='notes').private,true);
 assert.equal(record.notes,'Confidential');
});

test('Saving a card patches exactly one existing NPC, preserving everything else',()=>{
 const world={
  npcs:[{id:'npc-a',name:'Astra',notes:'Secret',legacyFlag:'keep'},
    {id:'npc-b',name:'Boren',faction:'Guild'}],
  creatures:[{id:'creature-a',name:'Dire Wulf',hp:50,xpReward:100}],
  factions:[{id:'faction-a'}],regions:[{id:'region-a'}]
 };
 const before=JSON.stringify(world);
 const settings={template:'dossier',theme:'parchment',tagline:'Royal Courier',
  portraitUrl:'images/characters/astra.png',fields:['role','faction','description']};
 const result=updateGMLibraryCard(world,'npc','npc-a',settings);
 assert.equal(result.ok,true,result.error);
 assert.deepEqual(Object.keys(result.patch),['npcs']);
 assert.equal(result.patch.npcs[0].card.tagline,'Royal Courier');
 assert.equal(result.patch.npcs[0].notes,'Secret');
 assert.equal(result.patch.npcs[0].legacyFlag,'keep');
 assert.deepEqual(result.patch.npcs[1],world.npcs[1]);
 assert.equal(JSON.stringify(world),before);
 assert.equal(updateGMLibraryCard(world,'npc','missing-id',settings).ok,false);
 assert.equal(updateGMLibraryCard(world,'official','official:wolf',settings).ok,false);
 assert.equal(updateGMLibraryCard(world,'npc','legacy-npc-0',settings).ok,false);
});

test('Card persists through legacy Phase 3.1 creature editor updates',()=>{
 const world={creatures:[{id:'creature-wolf',name:'Winter Wolf',hp:60,xpReward:100}]};
 const first=updateGMLibraryCard(world,'creature','creature-wolf',{
  template:'tactical',theme:'slate',fields:['hp','ac','xpReward']});
 assert.equal(first.ok,true);
 const merged={...world,...first.patch};
 const changed=updateGMLibrary(merged,'creature',libraryDraft('creature',{
  name:'Winter Wolf Alpha',hp:80,xpReward:120
 }),'creature-wolf');
 assert.equal(changed.ok,true);
 assert.deepEqual(changed.record.card,first.card);
 assert.equal(changed.record.hp,80);
 assert.equal(gmNPCCreatureLibrary({...world,...changed.patch}).rows[0].card.theme,'slate');
});

test('GM-only library integration renders responsive cards, studio and explicit save',()=>{
 const studio=read('src/dashboards/GMCharacterCards.jsx');
 const library=read('src/dashboards/GMNpcCreatureLibrary.jsx');
 const model=read('src/state/gmCharacterCardModel.mjs');
 const css=read('src/styles/gm-character-cards.css');
 const mount=read('src/app/mountDashboard.jsx');
 const dashboard=read('src/dashboards/GMDashboard.jsx');
 assert.match(dashboard,/AsteriaCharacterAccess\.isGM\(/);
 assert.match(library,/GMCharacterCardStudio/);
 assert.match(library,/GMCharacterCardPreview/);
 assert.match(library,/aria-pressed=\{galleryView\}/);
 assert.match(library,/updateGMLibraryCard\(world,cardTarget.kind,cardTarget.id,settings\)/);
 assert.match(library,/saveSection\('world',result.patch\)/);
 assert.match(studio,/GMCharacterCardPreview record=\{record\} settings=\{draft\}/);
 assert.match(studio,/Save Character Card/);
 assert.match(studio,/GM_CARD_THEMES\.map/);
 assert.match(studio,/GM_CARD_TEMPLATES\.map/);
 assert.match(studio,/role="status" aria-live="polite"/);
 assert.match(studio,/readOnly\?/);
 assert.match(model,/kind==='official'/);
 assert.match(css,/\[data-theme="parchment"\]/);
 assert.match(css,/\[data-template="tactical"\]/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(mount,/import '\.\.\/styles\/gm-character-cards\.css'/);
 assert.doesNotMatch(model+studio,/setDoc\(|updateDoc\(|httpsCallable|firebaseService|localStorage/);
});

test('Official cards read-only, no duplicate gameplay or Obsidian dependency',()=>{
 const cards=read('src/dashboards/GMCharacterCards.jsx');
 const model=read('src/state/gmCharacterCardModel.mjs');
 const library=read('src/dashboards/GMNpcCreatureLibrary.jsx');
 assert.match(cards,/record\.official\?'Official Compendium'/);
 assert.match(cards,/readOnly=Boolean\(record.official\)/);
 assert.match(library,/onSave=\{cardTarget.kind==='official'\?undefined:saveCard\}/);
 assert.match(model,/libraryCollectionKey\(kind\)/);
 assert.doesNotMatch(model+cards,/gmReputation|Obsidian|createCharacter|FirebaseStorage/);
});
