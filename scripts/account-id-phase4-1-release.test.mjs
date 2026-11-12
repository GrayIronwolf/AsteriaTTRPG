import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ACCOUNT_ID_EVIDENCE,ACCOUNT_ID_PROJECT,readRepoFile,
  inspectAccountIdReleaseSource,inspectAccountIdReleaseEvidence
} from './account-id-phase4-1-release.mjs';
import {ensureAccountIdentityProfile} from '../functions/accountIdentityProfile.mjs';
import {inspectAccountProfileDisplay} from '../src/state/accountProfileDisplay.mjs';
import {recoverPendingRegistrationProfile} from '../src/state/accountRegistrationRecovery.mjs';

const now=new Date('2026-11-09T12:00:00.000Z');
const reference='https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/123456';
const sha='a'.repeat(40);
const approved=()=>({
  schemaVersion:1,projectId:ACCOUNT_ID_PROJECT,stage:'canary',
  commitSha:sha,releaseId:'account-id-canary-1',
  reviewer:{decision:'approved',reference},
  evidence:Object.fromEntries(ACCOUNT_ID_EVIDENCE.map(category=>
    [category,{result:'pass',reference,verifiedAt:now.toISOString()}]))
});
const readerWith=(path,from,to)=>name=>{
  const contents=readRepoFile(name);
  return name===path?contents.replace(from,to):contents;
};
test('the current source is default-off and the release audit reports NO-GO',()=>{
  const audit=inspectAccountIdReleaseSource();
  assert.equal(audit.projectId,'asteria-ttrpg');
  assert.equal(audit.staticChecksPassed,true,JSON.stringify(audit.checks));
  assert.ok(audit.checks.length>=10);
  assert.ok(audit.checks.every(check=>check.pass),JSON.stringify(audit.checks));
  assert.equal(audit.releaseDecision,'NO-GO');
  assert.equal(audit.productionFlagsActivated,false);
  assert.equal(audit.productionEvidenceVerified,false);
  assert.equal(audit.productionDataChanged,false);
  assert.ok(!audit.releaseBlockers.includes(
    'legacy-accounts-can-invoke-assignment-if-server-flag-enabled'));
});
test('audit detects accidentally enabling browser registration and notifications',()=>{
  for(const flag of ['accountIds','campaignNotifications']){
    const audit=inspectAccountIdReleaseSource(
      readerWith('index.html',
        flag==='accountIds'?'accountIds:true':
          "campaignNotifications:new URLSearchParams(window.location.search).get('campaign-inapp-canary')==='1'",
        flag==='accountIds'?'accountIds:false':'campaignNotifications:true'));
    assert.equal(audit.staticChecksPassed,false);
    assert.equal(audit.releaseDecision,'NO-GO');
  }
});
test('audit detects missing server gate and exposed identity registry',()=>{
  const gate=inspectAccountIdReleaseSource(readerWith('functions/index.mjs',
    "process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'",
    "process.env.ASTERIA_ACCOUNT_IDS_ENABLED==='1'"));
  assert.equal(gate.staticChecksPassed,false);
  const registry=inspectAccountIdReleaseSource(readerWith('firestore.rules',
    'match /accountIdRegistry/{accountIdKey} {\n      allow read, write: if false;',
    'match /accountIdRegistry/{accountIdKey} {\n      allow read, write: if true;'));
  assert.equal(registry.staticChecksPassed,false);
});
test('registration issuance rejects the legacy-account bypass while backfill remains private',()=>{
  const source=inspectAccountIdReleaseSource();
  assert.ok(!source.releaseBlockers.includes('legacy-accounts-can-invoke-assignment-if-server-flag-enabled'));
  const api=readRepoFile('functions/index.mjs');
  const issuance=readRepoFile('functions/accountIdentityIssuance.mjs');
  const backfill=readRepoFile('functions/accountIdentityLegacy.mjs');
  assert.match(api,/issueNewRegistrationAccountId\(/);
  assert.match(api,/ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE/);
  assert.match(issuance,/metadata\?\.creationTime/);
  assert.match(backfill,/inspectLegacyAccountIdentity/);
  assert.doesNotMatch(api,/inspectLegacyAccountIdentity\(/);
});
test('release attestation missing, wrong project or incorrect commit fails closed',()=>{
  assert.deepEqual(inspectAccountIdReleaseEvidence(null,{now}),
    {evidenceFormatValid:false,issues:['missing-private-attestation']});
  assert.ok(inspectAccountIdReleaseEvidence({...approved(),projectId:'demo-asteria'},
    {now}).issues.includes('wrong-project'));
  assert.ok(inspectAccountIdReleaseEvidence(approved(),
    {now,expectedSha:'b'.repeat(40)}).issues.includes('unverified-commit'));
});
test('external approval and all evidence fields are mandatory',()=>{
  const manifest=approved();
  delete manifest.evidence['verified-backup-and-restore'];
  assert.ok(inspectAccountIdReleaseEvidence(manifest,{now}).issues
    .includes('missing-verified-backup-and-restore'));
  manifest.evidence['verified-backup-and-restore']={
    result:'pass',reference:'https://example.com',verifiedAt:now.toISOString()};
  assert.ok(inspectAccountIdReleaseEvidence(manifest,{now}).issues
    .includes('missing-verified-backup-and-restore'));
  const noApproval=approved();
  noApproval.reviewer.decision='unreviewed';
  assert.ok(inspectAccountIdReleaseEvidence(noApproval,{now}).issues
    .includes('missing-independent-approval'));
});
test('stale, future, and non-attested evidence cannot satisfy the release gate',()=>{
  const old=approved();
  old.evidence['cross-account-profile-isolation'].verifiedAt='2026-10-01T12:00:00.000Z';
  assert.ok(inspectAccountIdReleaseEvidence(old,{now}).issues
    .includes('stale-cross-account-profile-isolation'));
  const future=approved();
  future.evidence['cross-account-profile-isolation'].verifiedAt='2026-11-11T12:00:00.000Z';
  assert.ok(inspectAccountIdReleaseEvidence(future,{now}).issues
    .includes('stale-cross-account-profile-isolation'));
});
test('general rollout requires independently observed successful canary',()=>{
  const manifest=approved();manifest.stage='general';
  assert.ok(inspectAccountIdReleaseEvidence(manifest,{now}).issues
    .includes('missing-observed-canary'));
  manifest.evidence['canary-observed-and-approved']={
    result:'pass',reference,verifiedAt:now.toISOString()};
  assert.equal(inspectAccountIdReleaseEvidence(manifest,{now}).evidenceFormatValid,true);
});
test('even correctly formatted evidence is explicitly not production approval',()=>{
  assert.equal(inspectAccountIdReleaseEvidence(approved(),{now,expectedSha:sha})
    .evidenceFormatValid,true);
  const script=readFileSync(new URL('./account-id-phase4-1-release.mjs',import.meta.url),'utf8');
  assert.match(script,/const decision='NO-GO'/);
  assert.match(script,/process.exitCode=1/);
  assert.doesNotMatch(script,/firebase deploy|setDoc\(|\.set\(|listUsers\(/);
});
function fixture(accounts){
  const store=new Map(Object.entries(accounts));
  let lock=Promise.resolve();
  const db={store,doc:path=>({path}),runTransaction(fn){
    const execute=async()=>{
      const writes=[];
      const tx={
        get:async ref=>({exists:store.has(ref.path),data:()=>structuredClone(store.get(ref.path))}),
        create(ref,value){
          if(store.has(ref.path)||writes.some(x=>x.path===ref.path))throw Error('collision');
          writes.push({kind:'create',path:ref.path,value:structuredClone(value)});
        },
        update(ref,value){
          if(!store.has(ref.path))throw Error('profile missing');
          writes.push({kind:'update',path:ref.path,value:structuredClone(value)});
        }
      };
      const result=await fn(tx);
      for(const w of writes)store.set(w.path,w.kind==='update'?
        {...store.get(w.path),...w.value}:w.value);
      return result;
    };
    const result=lock.then(execute);
    lock=result.then(()=>{},()=>{});
    return result;
  }};
  return db;
}
const profile=(uid,username)=>({uid,username,usernameLower:username.toLowerCase(),
  firstName:'Character',lastName:'Owner',email:uid+'@example.test',
  characters:[{id:'hero',xp:1900}],role:'account'});
test('end-to-end uniqueness and preservation survive concurrent same-username accounts',async()=>{
  const db=fixture({'users/alice':profile('alice','Asteria'),
    'users/bob':profile('bob','asteria')});
  let a=0,b=0;
  const [first,second]=await Promise.all([
    ensureAccountIdentityProfile(db,'alice',{nextNumber:()=>['01416','01417'][a++]}),
    ensureAccountIdentityProfile(db,'bob',{nextNumber:()=>['01416','01418'][b++]})
  ]);
  assert.notEqual(first.accountNumber,second.accountNumber);
  assert.equal(db.store.size,6);
  for(const [uid,result] of [['alice',first],['bob',second]]){
    const p=db.store.get('users/'+uid);
    assert.equal(p.accountId,result.accountId);
    assert.deepEqual(p.characters,[{id:'hero',xp:1900}]);
    assert.equal(db.store.get('accountIdRegistry/'+p.accountIdKey).uid,uid);
    assert.equal(inspectAccountProfileDisplay({uid,authEmail:uid+'@example.test',profile:p})
      .accountId,result.accountId);
    assert.equal(inspectAccountProfileDisplay({
      uid:uid==='alice'?'bob':'alice',profile:p
    }).accountId,null);
  }
});
test('pending registration recovery cannot overwrite another account identity',async()=>{
  const user=profile('alice','Asteria');
  user.accountNumber='01416';
  user.accountId='Asteria#01416';
  const read=async()=>structuredClone(user);
  const transaction=async fn=>fn({
    read,
    create:()=>{throw Error('should not create');},
    patch:patch=>Object.assign(user,patch)
  });
  await recoverPendingRegistrationProfile({uid:'alice',authEmail:'alice@example.test',
    draft:{uid:'alice',email:'alice@example.test',username:'Asteria',
      firstName:'Character',lastName:'Owner'},transaction,readCanonical:read});
  assert.equal(user.accountId,'Asteria#01416');
  assert.deepEqual(user.characters,[{id:'hero',xp:1900}]);
  await assert.rejects(recoverPendingRegistrationProfile({
    uid:'bob',authEmail:'bob@example.test',
    draft:{uid:'bob',email:'bob@example.test',username:'Asteria',
      firstName:'Character',lastName:'Owner'},transaction,readCanonical:read
  }),/manual review/);
  assert.equal(user.accountId,'Asteria#01416');
});
