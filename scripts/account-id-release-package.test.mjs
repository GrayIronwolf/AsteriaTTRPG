import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  releasePackageFiles,extractAccountIdCallable,
  verifyStagingContext,stageReleasePackage
} from './account-id-release-package.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('functions/index.mjs');
const productionEnv={
  GITHUB_ACTIONS:'true',CI:'true',RUNNER_TEMP:'/tmp/asteria-ci-runner',
  GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
  ASTERIA_ACCOUNT_ID_SCOPED_DEPLOY:'1',
  ASTERIA_DEPLOY_PROJECT:'asteria-ttrpg'
};
test('release package isolates one exact Account ID callable without campaign secrets',()=>{
 const p=releasePackageFiles();
 assert.deepEqual(Object.keys(p.files).sort(),[
  'firebase.json','functions/accountIdentity.mjs',
  'functions/accountIdentityIssuance.mjs','functions/accountIdentityProfile.mjs',
  'functions/index.mjs','functions/package.json'].sort());
 assert.equal(p.versions.cli,'15.35.0');
 assert.equal(p.versions.admin,'14.5.0');
 assert.equal(p.versions.functions,'7.4.0');
 assert.equal(p.mainCodebase,'asteria');
 assert.equal(p.production,'asteria-ttrpg');
 assert.equal(p.deployment,'functions:asteria:asteriaAccountIdentity');
 const packageJson=JSON.parse(p.files['functions/package.json']);
 assert.equal(packageJson.main,'index.mjs');
 assert.deepEqual(Object.keys(packageJson.dependencies).sort(),
   ['firebase-admin','firebase-functions'].sort());
 assert.equal(packageJson.devDependencies,undefined);
 assert.equal(packageJson.overrides,undefined);
 assert.equal(packageJson.scripts,undefined);
 assert.equal(JSON.parse(p.files['firebase.json']).functions[0].source,'functions');
 assert.equal(JSON.parse(p.files['firebase.json']).functions[0].codebase,'asteria');
 assert.ok(p.files['functions/index.mjs'].includes(
   source.slice(source.indexOf(
     '// Phase 1.3: authenticated, server-controlled Account ID finalization.')).trimEnd()));
 for(const val of Object.values(p.files)){
   assert.doesNotMatch(val,/ASTERIA_RESEND_API_KEY|ASTERIA_SECURE_INVITE_SIGNING_KEY/);
 }
});
test('source tampering and unexpected exports fail closed',()=>{
 for(const changed of [
  source.replace("process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'",
    "process.env.ASTERIA_ACCOUNT_IDS_ENABLED==='1'"),
  source.replace('ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE','clientCutoff'),
  source.replace(
    'issueNewRegistrationAccountId(getFirestore(),firebaseUser,request.auth.uid,',
    'issueNewRegistrationAccountId(getFirestore(),data.uid,request.auth.uid,'),
  source+'\nexport const unsafe=onCall({});',
  source.replace('// Phase 1.3: authenticated, server-controlled Account ID finalization.',
    '// marker gone')
 ])assert.throws(()=>extractAccountIdCallable(changed));
});
test('production staging requires explicit manual approval and no automatic trigger',()=>{
 assert.equal(verifyStagingContext('production',productionEnv),
   '/tmp/asteria-ci-runner/asteria-account-id-release');
 for(const [key,value] of Object.entries({
  GITHUB_REF:'refs/heads/other',
  GITHUB_EVENT_NAME:'push',
  ASTERIA_ACCOUNT_ID_SCOPED_DEPLOY:'0',
  ASTERIA_DEPLOY_PROJECT:'demo-asteria',
  GITHUB_ACTIONS:'false',
  CI:'false',
  RUNNER_TEMP:'relative-path'
 })){
  assert.throws(()=>verifyStagingContext('production',{...productionEnv,[key]:value}),key);
 }
 assert.throws(()=>verifyStagingContext('other',productionEnv));
 assert.throws(()=>verifyStagingContext('ci',productionEnv));
 assert.equal(verifyStagingContext('ci',{
   ...productionEnv,GITHUB_EVENT_NAME:'pull_request'
 }),'/tmp/asteria-ci-runner/asteria-account-id-release');
});
test('staging writes only the verified six files in runner temporary directory',()=>{
 const writes=new Map(),mkdirs=[];
 const result=stageReleasePackage('production',{
  env:productionEnv,reader:read,exists:()=>false,
  mkdir:path=>mkdirs.push(path),
  write:(path,value)=>writes.set(path,value)
 });
 assert.equal(writes.size,6);
 assert.equal(result.sourceFiles,6);
 assert.equal(result.selectedDeployment,'functions:asteria:asteriaAccountIdentity');
 assert.equal(result.productionWritesPerformed,false);
 assert.equal(result.accountIdsEnabled,false);
 assert.deepEqual([...writes.keys()].sort(),[
  '/tmp/asteria-ci-runner/asteria-account-id-release/firebase.json',
  '/tmp/asteria-ci-runner/asteria-account-id-release/functions/accountIdentity.mjs',
  '/tmp/asteria-ci-runner/asteria-account-id-release/functions/accountIdentityProfile.mjs',
  '/tmp/asteria-ci-runner/asteria-account-id-release/functions/accountIdentityIssuance.mjs',
  '/tmp/asteria-ci-runner/asteria-account-id-release/functions/index.mjs',
  '/tmp/asteria-ci-runner/asteria-account-id-release/functions/package.json'
 ].sort());
 assert.ok(mkdirs.length>=6);
 assert.throws(()=>stageReleasePackage('production',{
  env:productionEnv,reader:read,exists:()=>true,
  write:()=>{throw Error('unexpected write')}
 }));
});
test('wrong SDK or codebase aborts staging before any writes',()=>{
 const files={
  'package.json':read('package.json'),
  'package-lock.json':read('package-lock.json'),
  'firebase.json':read('firebase.json'),
  'functions/index.mjs':read('functions/index.mjs')
 };
 for(const key of ['functions/accountIdentity.mjs',
   'functions/accountIdentityProfile.mjs','functions/accountIdentityIssuance.mjs'])
     files[key]=read(key);
 const cases=[
  ['package.json',JSON.stringify({...JSON.parse(files['package.json']),main:'src/index.js'})],
  ['firebase.json',JSON.stringify({...JSON.parse(files['firebase.json']),
    functions:[{source:'functions',codebase:'different',runtime:'nodejs22'}]})],
  ['package-lock.json',JSON.stringify({...JSON.parse(files['package-lock.json']),
    packages:{...JSON.parse(files['package-lock.json']).packages,
      'node_modules/firebase-tools':{version:'0.0.0'}}})]
 ];
 for(const [key,value] of cases){
   const reader=name=>name===key?value:files[name];
   const writes=[];
   assert.throws(()=>stageReleasePackage('production',{
     env:productionEnv,reader,exists:()=>false,
     write:(...args)=>writes.push(args),mkdir:()=>{}
   }));
   assert.equal(writes.length,0);
 }
});
test('source staging has no shell execution, credential access, or production changes',()=>{
 const s=read('scripts/account-id-release-package.mjs');
 assert.doesNotMatch(s,/\b(?:spawn|execFile|execSync)\(/);
 assert.doesNotMatch(s,/writeFileSync\(.*(?:firebase\.json|index\.html|functions\/index\.mjs)/);
 assert.match(s,/RUNNER_TEMP/);
 assert.match(s,/AST\-?ERIA_ACCOUNT_ID_SCOPED_DEPLOY/);
});
