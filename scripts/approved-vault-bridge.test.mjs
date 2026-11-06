import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {syncApprovedContent}=require('./import-approved-vault.cjs');
const page=(title='Public Primdale',code='07-05-001-001')=>
 ['---','title: '+title,'slug: public-primdale','domain: item','id: '+code,
 'Asteria ID Index Code: '+code,'visibility: public','publish: true',
 'publicationApproved: true','categoryPath:','  - Flora','  - Flowers',
 'tags:','  - public','---','','# '+title,'','This is a player-safe definition.',''].join('\n');
function fixture(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'asteria-bridge-'));
 const source=path.join(dir,'vault','publish','public');
 const out=path.join(dir,'website','docs','vault-import-preview');
 fs.mkdirSync(source,{recursive:true});
 try{return fn({source,out,write:(rel,contents)=>{const f=path.join(source,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,contents);}});}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('an empty private export produces no public files or empty pull request',()=>fixture(({source,out})=>{
 const result=syncApprovedContent({source,out});
 assert.equal(result.definitions,0);
 assert.equal(fs.existsSync(out),false);
}));
test('only explicitly approved public Markdown is staged, with permanent IDs',()=>fixture(({source,out,write})=>{
 write('items/public-primdale/index.md',page());
 const result=syncApprovedContent({source,out});
 assert.equal(result.definitions,1);
 assert.deepEqual(result.manifest.definitions.map(x=>x.id),['07-05-001-001']);
 const output=fs.readFileSync(path.join(out,'items/public-primdale/index.md'),'utf8');
 assert.match(output,/Asteria ID Index Code: 07-05-001-001/);
 assert.match(output,/This is a player-safe definition/);
 assert.doesNotMatch(output,/publicationApproved:/);
 assert.ok(fs.existsSync(path.join(out,'manifest.json')));
 const second=syncApprovedContent({source,out,dryRun:true});
 assert.equal(second.definitions,1);
}));
test('drafts, secret headings, internal links, unknown files and unsafe markup fail closed',()=>fixture(({source,out,write})=>{
 const rel='items/public-primdale/index.md';
 const bad=[
 page().replace('publicationApproved: true','publicationApproved: false'),
 page().replace('visibility: public','visibility: gm-only'),
 page().replace('publish: true','publish: false'),
 page().replace('This is a player-safe definition.','## GM Notes\nThe traitor is the king.'),
 page().replace('This is a player-safe definition.','[[Private Notes]]'),
 page().replace('This is a player-safe definition.','<script>alert(1)</script>'),
 page().replace('id: 07-05-001-001','id: 07-05-001-002')
 ];
 for(const content of bad){
  write(rel,content);
  assert.throws(()=>syncApprovedContent({source,out}),/Approved vault export:/);
 }
 write(rel,page());
 write('items/public-primdale/secret.md','secret');
 assert.throws(()=>syncApprovedContent({source,out}),/unexpected file/);
}));
test('publishing cannot silently change an existing definition ID',()=>fixture(({source,out,write})=>{
 write('items/public-primdale/index.md',page());
 syncApprovedContent({source,out});
 write('items/public-primdale/index.md',page('Public Primdale','07-05-001-002'));
 assert.throws(()=>syncApprovedContent({source,out}),/permanent ID changed/);
}));
test('duplicate IDs across distinct categories are rejected',()=>fixture(({source,out,write})=>{
 write('items/public-primdale/index.md',page());
 const other=page().replace('slug: public-primdale','slug: other').replace('domain: item','domain: race');
 write('races/other/index.md',other);
 assert.throws(()=>syncApprovedContent({source,out}),/duplicate public Asteria ID/);
}));
