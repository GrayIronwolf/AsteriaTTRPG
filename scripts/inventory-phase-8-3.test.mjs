import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playerStashItems,playerAvailableLoot,gmVisibleStashes,gmLootReviewRows} from '../src/state/partyLootViewModel.mjs';

const partyLoot={
  stashes:[
    {id:'open',name:'Party Chest',status:'open',items:[
      {id:'sword',name:'Iron Sword',qty:2,ownerUid:'alice'},
      {id:'secret',name:'Cursed Sword',trueName:'Cursed Sword',identified:false,qty:1,gmNotes:'curse'}]},
    {id:'closed',name:'Locked Vault',status:'closed',items:[]},
    {id:'deleted',name:'Expired Cache',status:'deleted',items:[]}
  ],
  loot:[
    {id:'public',visibility:'revealed',status:'available',kind:'item',title:'Ruins cache',source:'Crypt',
      item:{id:'a',name:'Cursed Crown',trueName:'Cursed Crown',identified:false,qty:1,gmNotes:'secret'}},
    {id:'coins',visibility:'revealed',status:'available',kind:'currency',title:'Gold Cache',source:'Cave',currencyCopper:42},
    {id:'claimed',visibility:'revealed',status:'claimed',kind:'item',title:'Old sword',item:{name:'Iron Sword',qty:1}},
    {id:'hidden',visibility:'hidden',status:'available',kind:'item',title:'GM Hidden Drop',gmNotes:'mystery'}
  ],
  drafts:[
    {id:'draft',visibility:'hidden',status:'available',kind:'item',title:'Secret treasure',secretItem:{name:'GM sword',qty:1}},
    {id:'cancelled',visibility:'hidden',status:'cancelled',kind:'currency',title:'Expired Drop'}
  ]
};
test('Phase 8.3 player stash searches only public display names',()=>{
  assert.deepEqual(playerStashItems(partyLoot.stashes[0],'sword').map(x=>x.id),['sword']);
  assert.deepEqual(playerStashItems(partyLoot.stashes[0],'cursed'),[]);
  const unknown=playerStashItems(partyLoot.stashes[0],'unidentified')[0];
  assert.equal(unknown.name,'Unidentified Item');
  assert.equal(JSON.stringify(unknown).includes('Cursed'),false);
  assert.equal(JSON.stringify(unknown).includes('ownerUid'),false);
});
test('Phase 8.3 player treasure filters exclude drafts, hidden and claimed items and do not search true names',()=>{
  assert.deepEqual(playerAvailableLoot(partyLoot).map(x=>x.id),['public','coins']);
  assert.deepEqual(playerAvailableLoot(partyLoot,{kind:'currency'}).map(x=>x.id),['coins']);
  assert.deepEqual(playerAvailableLoot(partyLoot,{search:'crypt'}).map(x=>x.id),['public']);
  assert.deepEqual(playerAvailableLoot(partyLoot,{search:'cursed'}),[]);
  assert.deepEqual(playerAvailableLoot(partyLoot,{search:'GM Hidden'}),[]);
  assert.equal(JSON.stringify(playerAvailableLoot(partyLoot)).includes('Cursed Crown'),false);
  assert.equal(JSON.stringify(playerAvailableLoot(partyLoot)).includes('gmNotes'),false);
});
test('Phase 8.3 GM stash/status and loot queue searches do not mutate source',()=>{
  assert.deepEqual(gmVisibleStashes(partyLoot,{status:'open'}).map(x=>x.id),['open']);
  assert.deepEqual(gmVisibleStashes(partyLoot,{search:'vault'}).map(x=>x.id),['closed']);
  assert.deepEqual(gmLootReviewRows(partyLoot,{search:'secret'}).hidden.map(x=>x.id),['draft']);
  assert.deepEqual(gmLootReviewRows(partyLoot,{kind:'currency'}).revealed.map(x=>x.id),['coins']);
  assert.deepEqual(gmLootReviewRows(partyLoot,{status:'claimed'}).revealed.map(x=>x.id),['claimed']);
  assert.equal(partyLoot.loot[0].status,'available');
  assert.deepEqual(gmLootReviewRows({}).revealed,[]);
  assert.deepEqual(gmVisibleStashes({}),[]);
});
test('Phase 8.3 new selectors are read-only and existing trusted actions remain in place',()=>{
  const model=readFileSync(new URL('../src/state/partyLootViewModel.mjs',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/dashboards/PartyLootWorkspace.jsx',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/styles/asteria-react.css',import.meta.url),'utf8');
  for(const token of ['playerStashItems','playerAvailableLoot','gmVisibleStashes','gmLootReviewRows'])
    assert.match(ui,new RegExp(token));
  for(const token of ['movePartyStashItem','claimPartyLoot','managePartyStash','managePartyLootDrop','splitPartyLootCurrency'])
    assert.match(ui,new RegExp('firebaseService\\.'+token));
  assert.match(ui,/No matching available treasure/);
  assert.match(ui,/No matching containers/);
  assert.match(ui,/No matching revealed loot/);
  assert.match(css,/\.react-party-loot-filters/);
  assert.doesNotMatch(model,/firebaseService|runTransaction|setDoc|updateDoc|fetch\(/);
});
