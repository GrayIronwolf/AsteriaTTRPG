import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectJournal,validateJournalDraft,changeJournalRows} from '../frontend/src/player/playerJournalModel.mjs';
import {playerCharacterProjection} from '../frontend/src/player/playerDashboardModel.mjs';

const source=[
  {id:'original',title:'Original entry',body:'A preserved original story',createdAt:'2026-01-01'},
  {title:'Older content',content:'Legacy saved content'},
  'Simple legacy note'
];
test('both original body and content properties survive as readable full journal text',()=>{
  const projected=projectJournal(source);
  assert.deepEqual(projected.map(entry=>entry.content),[
    'A preserved original story','Legacy saved content','Simple legacy note']);
  assert.equal(projected[0].id,'original');
  assert.equal(source[0].body,'A preserved original story');
});
test('owner journal is visible and read-only character projections do not include it',()=>{
  const character={id:'hero',ownerUid:'owner',name:'Hero',journal:source};
  const own=playerCharacterProjection(character,{owned:true});
  const other=playerCharacterProjection(character,{owned:false});
  assert.equal(own.journal[0].content,'A preserved original story');
  assert.deepEqual(other.journal,[]);
  assert.equal(JSON.stringify(other).includes('A preserved original story'),false);
});
test('journal validation rejects empty and excessive content without rewriting existing entries',()=>{
  assert.deepEqual(validateJournalDraft({title:'',body:'  A note  '}),{title:'Journal Entry',body:'A note'});
  assert.throws(()=>validateJournalDraft({body:'   '}),/1–20,000/);
  assert.throws(()=>validateJournalDraft({body:'a'.repeat(20001)}),/1–20,000/);
  assert.throws(()=>validateJournalDraft({title:'a'.repeat(121),body:'Valid'}),/120/);
});

test('journal updates existing entries by verified ID while preserving unrelated records',()=>{
  const initial=source.map(row=>typeof row==='object'?{...row}:row);
  const current=projectJournal(initial)[0];
  const changed=changeJournalRows(initial,{action:'update',entryId:current.id,
    expected:{title:current.title,content:current.content,createdAt:current.createdAt},
    draft:{title:'Revised title',body:'Revised full journal story'},
    updatedAt:'2026-11-20T01:00:00.000Z',replacementId:'journal-1234'});
  assert.equal(projectJournal(changed)[0].content,'Revised full journal story');
  assert.equal(projectJournal(changed)[0].title,'Revised title');
  assert.equal(projectJournal(changed)[0].createdAt,current.createdAt);
  assert.equal(projectJournal(changed)[0].updatedAt,'2026-11-20T01:00:00.000Z');
  assert.deepEqual(changed.slice(1),initial.slice(1));
  assert.equal(initial[0].body,'A preserved original story');
});
test('legacy string entry editing converts its index to stable matching ID',()=>{
  const rows=['A legacy note','Second entry'];
  const value=projectJournal(rows)[0];
  const changed=changeJournalRows(rows,{action:'update',entryId:value.id,
    expected:{title:value.title,content:value.content,createdAt:value.createdAt},
    draft:{title:'Edited legacy',body:'New legacy text'},
    replacementId:'journal-legacy-1234',updatedAt:'2026-11-20'});
  assert.equal(projectJournal(changed)[0].id,'journal-legacy-1234');
  assert.equal(projectJournal(changed)[0].content,'New legacy text');
  assert.equal(changed[1],rows[1]);
});
test('journal delete removes only matched entry and rejects stale or ambiguous edits',()=>{
  const rows=[{id:'journal-id-1',title:'One',body:'original',createdAt:'2026-01-01'},
    {id:'journal-id-2',title:'Two',body:'keep',createdAt:'2026-01-02'}];
  const before=projectJournal(rows)[0];
  const expected={title:before.title,content:before.content,createdAt:before.createdAt};
  const remaining=changeJournalRows(rows,{action:'delete',entryId:before.id,expected});
  assert.deepEqual(remaining,[rows[1]]);
  assert.equal(rows.length,2);
  assert.throws(()=>changeJournalRows(rows,{action:'update',entryId:before.id,
    expected:{...expected,content:'stale'},draft:{title:'Changed',body:'Changed'}}),/changed in another session/);
  assert.throws(()=>changeJournalRows([...rows,rows[0]],{action:'delete',
    entryId:before.id,expected}),/ambiguous/);
  assert.throws(()=>changeJournalRows(rows,{action:'delete',entryId:'another-entry',
    expected}),/removed or is ambiguous/);
});
test('journal edits are wired to owner transactions and disabled on read-only dashboards',()=>{
  const ui=readFileSync(new URL('../frontend/src/pages/PlayerDashboardPage.jsx',import.meta.url),'utf8');
  const service=readFileSync(new URL('../frontend/src/player/firebasePlayerDashboardService.mjs',import.meta.url),'utf8');
  assert.match(ui,/updateJournalEntry/);
  assert.match(ui,/deleteJournalEntry/);
  assert.match(ui,/Delete this journal entry permanently/);
  assert.match(ui,/disabled={locked}/);
  assert.match(service,/changeJournalRows\(sharedRows,changes\)/);
  assert.match(service,/changeJournalRows\(privateRows,changes\)/);
  assert.match(service,/gmSessionState\(sessionSnap\.data\(\)\)\.editable!==true/);
  assert.match(service,/linkedCharacterAccess/);
});
