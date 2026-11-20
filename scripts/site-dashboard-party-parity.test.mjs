import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 projectPartyMembers,projectPartyWorkspace,projectPartyMessages,projectPartyPresence,
 validatePartyNotes,validatePartyMessage,validatePartyOrganization
} from '../frontend/src/player/playerPartyModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const campaign={party:['hero','mage'],characters:{
 hero:{name:'Hero',klass:'Ranger',level:3},
 mage:{name:'Mage',klass:'Wizard',level:4}
}};
const members=projectPartyMembers(campaign,[
 {id:'hero',name:'Hero',level:3,hp:[12,20]},
 {id:'mage',name:'Mage',level:4,hp:[14,18]}
]);
test('Phase 2.5: public party roster preserves class, level and HP safely',()=>{
 assert.equal(members.length,2);
 assert.equal(members[0].name,'Hero');
 assert.deepEqual(members[0].hp,[12,20]);
 assert.equal(members[1].level,4);
 assert.deepEqual(projectPartyMembers(campaign,[]).map(row=>row.id),['hero','mage']);
});
test('Phase 2.5: shared notes and organizations are projected without unrelated members',()=>{
 const result=projectPartyWorkspace({sharedNotes:'A common quest',
  organizations:[{id:'organization-one',name:'The Seekers',type:'Adventure Party',
   notes:'Meet at dawn',memberCharacterIds:['hero','another-campaign-character']}]},members);
 assert.equal(result.sharedNotes,'A common quest');
 assert.equal(result.organizations[0].name,'The Seekers');
 assert.deepEqual(result.organizations[0].memberCharacterIds,['hero']);
});
test('Phase 2.5: party chat renders recent messages chronologically and rejects outsider records',()=>{
 const events=[
  {id:'msg-two',characterId:'mage',text:'Second',createdAt:'2026-11-20T02:00:00Z'},
  {id:'msg-one',characterId:'hero',text:'First',createdAt:'2026-11-20T01:00:00Z'},
  {id:'msg-other',characterId:'outsider',text:'Hidden',createdAt:'2026-11-20T03:00:00Z'}
 ];
 const projected=projectPartyMessages(events,members);
 assert.deepEqual(projected.map(x=>x.text),['First','Second']);
 assert.equal(JSON.stringify(projected).includes('Hidden'),false);
});
test('Phase 2.5: session presence only exposes linked party character IDs',()=>{
 const result=projectPartyPresence([
  {characterId:'hero',online:true},{characterId:'mage',online:false},
  {characterId:'outsider',online:true}],members);
 assert.deepEqual(result,['hero']);
});
test('Phase 2.5: party write inputs are validated before Firebase authorization',()=>{
 assert.equal(validatePartyNotes('shared'),'shared');
 assert.throws(()=>validatePartyNotes('x'.repeat(20001)),/20,000/);
 assert.equal(validatePartyMessage(' hello '),'hello');
 assert.throws(()=>validatePartyMessage(''),/party message/);
 assert.throws(()=>validatePartyMessage('x'.repeat(2001)),/2,000/);
 assert.deepEqual(validatePartyOrganization({name:' Guild ',type:'Guild'}),
  {name:'Guild',type:'Guild'});
 assert.throws(()=>validatePartyOrganization({name:'Bad',type:'Unknown'}),/supported type/);
});
test('Phase 2.5: restored party uses existing Auth, Firestore and server-owned organization action',()=>{
 const service=read('frontend/src/player/firebasePlayerDashboardService.mjs');
 const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
 const ui=read('frontend/src/player/PlayerPartyWorkspace.jsx');
 assert.match(service,/function watchParty/);
 assert.match(service,/partyChat/);
 assert.match(service,/sessions',sid,'presence/);
 assert.match(service,/active/);
 assert.match(service,/matchesOwnedSource/);
 assert.match(service,/partyEditContext/);
 assert.match(service,/expected/);
 assert.match(service,/action:'createPartyOrganization'/);
 assert.match(service,/gmSessionState\(sessionSnap\.data\(\)\)\.editable!==true/);
 assert.match(ui,/Live Party Chat/);
 assert.match(ui,/Save Shared Notes/);
 assert.match(ui,/Form a Party or Organization/);
 assert.match(ui,/site-player-party/);
 assert.match(page,/PlayerPartyWorkspace/);
 assert.doesNotMatch(ui,/window\.AsteriaFirebase|initializeApp\(/);
});
