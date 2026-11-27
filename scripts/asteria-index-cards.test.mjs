import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const cards=require('../js/asteria-index-cards.js');
const sample={asteriaId:'01-05-001-001',name:'Example Race',category:'Races'};
test('Asteria card registry remains empty until an ID assignment is verified',()=>{
  assert.equal(cards.all().length,0);
  assert.equal(cards.placeholders().length,0);
  assert.equal(cards.categories.length,12);
});
test('metadata-only mappings create Coming Soon placeholder candidates',()=>{
  assert.deepEqual(cards.preview([sample]),[{...sample,websiteId:null,domain:'race'}]);
  assert.equal(cards.preview([sample],['01-05-001-001']).length,0);
  assert.equal(cards.preview([sample],[],'item').length,0);
});
test('matched website content retains its existing definition and suppresses duplicate placeholder',()=>{
  const record={...sample,websiteId:'race:content-races-example-index'};
  assert.equal(cards.validate([record])[0].websiteId,record.websiteId);
  assert.equal(cards.preview([record]).length,0);
});
test('invalid, duplicate and unapproved metadata cannot enter the card registry',()=>{
  assert.throws(()=>cards.validate([{...sample,asteriaId:'placeholder-1'}]),/Unverified/);
  assert.throws(()=>cards.validate([sample,{...sample,name:'Duplicate Race'}]),/Duplicate/);
  assert.throws(()=>cards.validate([{...sample,description:'Vault lore'}]),/Only name/);
  assert.throws(()=>cards.validate([{...sample,category:'Other'}]),/Unknown/);
});
test('viewer is wired to the metadata-only registry without changing authored content sources',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const viewer=fs.readFileSync('js/universal-compendium-engine.js','utf8');
  assert.ok(html.includes('js/asteria-index-cards.js'));
  assert.ok(html.indexOf('js/asteria-index-cards.js')<html.indexOf('js/universal-compendium-engine.js'));
  assert.match(viewer,/function indexCardPanel\(/);
  assert.match(viewer,/Coming Soon/);
  assert.match(viewer,/api\.placeholders\(allEntries\(\)\.map\(entry=>entry\.id\)\)/);
});
