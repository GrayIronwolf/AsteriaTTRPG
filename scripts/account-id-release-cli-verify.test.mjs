import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyArchive,verifyCliInstall} from './account-id-release-cli-verify.mjs';

const files=[
 'accountIdentity.mjs','accountIdentityIssuance.mjs',
 'accountIdentityProfile.mjs','index.mjs','package.json'
].map(path=>({path,size:40}));

test('source archive contains exactly five allowed Account ID files',()=>{
 assert.deepEqual(verifyArchive([{files}]),{
  ready:true,fileCount:5,onlyAccountIdCode:true
 });
 for(const injected of ['emailSecret.mjs','index.js','.env','node_modules/minimatch/index.js']){
  assert.throws(()=>verifyArchive([{files:[...files,{path:injected,size:5}]}]));
 }
 assert.throws(()=>verifyArchive([{files:files.slice(1)}]));
 assert.throws(()=>verifyArchive([{files:[...files,{path:'package.json',size:5}]}]));
 assert.throws(()=>verifyArchive([{files:files.map(x=>({...x,size:0}))}]));
 assert.throws(()=>verifyArchive(null));
});
test('isolated Firebase CLI requires compatible minimatch v3 function API',()=>{
 const modules={
  './package.json':{version:'15.35.0'},
  'minimatch':Object.assign((a,b)=>a==='file.txt'&&b==='*.txt',{}),
  'minimatch/package.json':{version:'3.1.2'}
 };
 const loader=()=>name=>modules[name];
 assert.deepEqual(verifyCliInstall({directory:'/tmp/cli',loader}),{
  ready:true,cli:'15.35.0',minimatch:'3.1.2',
  minimatchCallable:true
 });
 for(const patch of [
  {'minimatch/package.json':{version:'11.0.4'}},
  {'minimatch':{minimatch:()=>true}},
  {'./package.json':{version:'15.34.0'}},
  {'minimatch':()=>false}
 ]){
  const changed={...modules,...patch};
  assert.throws(()=>verifyCliInstall({
    directory:'/tmp/cli',loader:()=>name=>changed[name]
  }));
 }
 assert.throws(()=>verifyCliInstall({directory:'relative',loader}));
});
