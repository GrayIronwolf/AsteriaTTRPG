import test from 'node:test';
import assert from 'node:assert/strict';
import {projectJournal,validateJournalDraft} from '../frontend/src/player/playerJournalModel.mjs';
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
