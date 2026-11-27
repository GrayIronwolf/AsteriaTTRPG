import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const cards=require('../js/asteria-index-cards.js');
const sample={asteriaId:'01-05-001-001',name:'Example Race',category:'Races'};
test('Asteria verified catalogue contains only metadata and retains all 12 priority categories',()=>{
  assert.equal(cards.categories.length,12);
  assert.equal(cards.all().length,4495);
  assert.equal(cards.placeholders().length,4495);
  assert.ok(cards.all().every(row=>/^\d{2}-\d{2}-\d{3}-\d{3}$/.test(row.asteriaId)));
  assert.ok(cards.all().every(row=>Object.keys(row).sort().join(',')==='asteriaId,category,domain,name,websiteId'));
  assert.equal(cards.forAsteria('07-05-002-025')?.name,'Red Primdale');
  assert.equal(cards.all().filter(row=>row.category==='Schematics').length,336);
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
