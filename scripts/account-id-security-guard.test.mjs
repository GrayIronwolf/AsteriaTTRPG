import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {assertNewRegistrationEligible,assertAccountIdCanaryEligible,
  issueNewRegistrationAccountId,NEW_REGISTRATION_WINDOW_MS} from '../functions/accountIdentityIssuance.mjs';
import {inspectLegacyAccountIdentity} from '../functions/accountIdentityLegacy.mjs';
const now=new Date('2026-11-09T12:00:00.000Z');
const cutoff='2026-11-09T11:30:00.000Z';
const user=(uid='alice',created='2026-11-09T11:59:00.000Z')=>({
  uid,disabled:false,emailVerified:true,displayName:'Asteria',email:uid+'@example.test',
  metadata:{creationTime:created}
});
function fixture(initial={}){
  const records=new Map(Object.entries(initial));
  let lock=Promise.resolve();
  const db={records,doc:path=>({path,get:async()=>({exists:records.has(path),data:()=>structuredClone(records.get(path))})}),runTransaction(callback){
    const fn=async()=>{
      const writes=[];
      const tx={
        get:async ref=>({exists:records.has(ref.path),
          data:()=>structuredClone(records.get(ref.path))}),
        create(ref,value){
          if(records.has(ref.path)||writes.some(w=>w.path===ref.path))throw Error('duplicate');
          writes.push({type:'create',path:ref.path,value:structuredClone(value)});
        },
        update(ref,value){
          if(!records.has(ref.path))throw Error('missing');
          writes.push({type:'update',path:ref.path,value:structuredClone(value)});
        }
      };
      const result=await callback(tx);
      for(const w of writes)records.set(w.path,w.type==='create'?
        w.value:{...records.get(w.path),...w.value});
      return result;
    };
    const result=lock.then(fn);
    lock=result.then(()=>{},()=>{});return result;
  }};
  return db;
}
const profile=(uid='alice',name='Asteria')=>({
  uid,username:name,usernameLower:name.toLowerCase(),
  email:uid+'@example.test',characters:[{id:'hero',xp:100}]
});
const run=(db,u,more={})=>issueNewRegistrationAccountId(db,u,u.uid,{
  notBefore:cutoff,now,nextNumber:()=> '01416',
  rolloutMode:'canary',canaryEmailSha256:createHash('sha256').update('alice@example.test').digest('hex'),
  ...more
});

test('a new Auth account can receive a permanent number with no client-chosen ID',async()=>{
  const db=fixture({'users/alice':profile()});
  const result=await run(db,user());
  assert.equal(result.accountId,'Asteria#01416');
  assert.equal(db.records.get('accountIdRegistry/asteria#01416').uid,'alice');
  assert.deepEqual(db.records.get('users/alice').characters,[{id:'hero',xp:100}]);
});
test('idempotent issuance within the 15-minute registration window',async()=>{
  const db=fixture({'users/alice':profile()});
  await run(db,user());
  const before=structuredClone([...db.records]);
  const response=await run(db,user(),{nextNumber:()=> '99999'});
  assert.equal(response.alreadyAssigned,true);
  assert.equal(response.accountId,'Asteria#01416');
  assert.deepEqual([...db.records],before);
});
test('old Auth accounts are never eligible even with forged new profile timestamps',async()=>{
  const db=fixture({'users/alice':{
    ...profile(),createdAt:new Date(now),isNew:true,
    accountCreatedAt:now.toISOString()
  }});
  const legacy=user('alice','2024-01-01T00:00:00.000Z');
  await assert.rejects(run(db,legacy),/new registration/);
  assert.equal(db.records.size,1);
});
test('fresh signed-in legacy accounts created before rollout cutoff are rejected',async()=>{
  const old=user('alice','2026-11-09T11:29:59.000Z');
  assert.throws(()=>assertNewRegistrationEligible(old,'alice',{notBefore:cutoff,now}),
    /new registration/);
});
test('cutoff absent, malformed, future or lax fail open is forbidden',async()=>{
  const value=user();
  for(const notBefore of [undefined,'','yesterday','2026-11-09',
    '2026-11-09T12:01:00.000Z','2026-11-09T11:30:00Z','2026-11-09T11:31:00+00:00']){
    assert.throws(()=>assertNewRegistrationEligible(value,'alice',{notBefore,now}),
      /new registration/);
  }
});
test('creation must be within 15 minutes, not future, and must be trusted Auth metadata',async()=>{
  for(const created of [
    '2026-11-09T11:40:00.000Z',
    '2026-11-09T12:00:10.000Z',
    'bogus'
  ]){
    assert.throws(()=>assertNewRegistrationEligible(user('alice',created),'alice',
      {notBefore:'2026-11-09T11:00:00.000Z',now}),/new registration/);
  }
  assert.equal(NEW_REGISTRATION_WINDOW_MS,900000);
  assert.throws(()=>assertNewRegistrationEligible({...user(),metadata:{}},'alice',
    {notBefore:cutoff,now}),/new registration/);
});
test('caller identity and immutable Auth metadata cannot be replaced with browser inputs',async()=>{
  const base=user();
  const cases=[
    [{...base,uid:'bob'},'alice'],
    [{...base,disabled:true},'alice'],
    [{...base,email:''},'alice'],
    [{...base,displayName:'bad name'},'alice'],
    [{...base,displayName:' asteria '},'alice'],
    [base,'../alice'],
  ];
  for(const [u,uid] of cases)
    assert.throws(()=>assertNewRegistrationEligible(u,uid,{notBefore:cutoff,now}),
      /new registration/);
});
test('existing profile mismatches Auth username and verified email fail in transaction',async()=>{
  for(const patch of [{username:'Other'},{email:'attacker@example.test'}]){
    const db=fixture({'users/alice':{...profile(),...patch}});
    await assert.rejects(run(db,user()),/username changed|email differs/);
    assert.equal(db.records.size,1);
  }
});
test('existing accounts retain separate operator-only legacy backfill review',async()=>{
  const db=fixture({'users/alice':profile()});
  const auth={getUser:async uid=>({
    ...user(uid,'2020-01-01T00:00:00.000Z'),displayName:'Asteria'
  })};
  assert.equal((await inspectLegacyAccountIdentity(db,auth,'alice')).status,'eligible');
  await assert.rejects(run(db,await auth.getUser('alice')),/new registration/);
  assert.equal(db.records.size,1);
});
test('source callable cannot directly access unrestricted profile allocator',()=>{
  const {readFileSync}=requireRead();
  const api=readFileSync(new URL('../functions/index.mjs',import.meta.url),'utf8');
  assert.match(api,/issueNewRegistrationAccountId\(getFirestore\(\),firebaseUser,request\.auth\.uid/);
  assert.match(api,/ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE/);
  assert.match(api,/process\.env\.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'/);
  assert.doesNotMatch(api,/return await ensureAccountIdentityProfile\(getFirestore\(\),request\.auth\.uid\)/);
});
function requireRead(){return {readFileSync:sourceRead};}
import {readFileSync as sourceRead} from 'node:fs';

test('canary gate refuses unknown rollout modes and missing digest before writes',async()=>{
  for(const patch of [
    {rolloutMode:undefined},{rolloutMode:'general'},
    {canaryEmailSha256:undefined},{canaryEmailSha256:'wrong'},
    {canaryEmailSha256:'0'.repeat(64)}
  ]) {
    const db=fixture({'users/alice':profile()});
    await assert.rejects(run(db,user(),patch),/new registration/);
    assert.equal(db.records.size,1);
  }
});

test('canary requires Firebase Auth verified email and never trusts browser input',async()=>{
  const db=fixture({'users/alice':profile()});
  await assert.rejects(run(db,{...user(),emailVerified:false}),/new registration/);
  assert.equal(db.records.size,1);
  assert.throws(()=>assertAccountIdCanaryEligible(user(),'alice@example.test',{
    rolloutMode:'general',canaryEmailSha256:createHash('sha256').update('alice@example.test').digest('hex')
  }),/new registration/);
});

test('canary verified email is canonical and case-normalized',async()=>{
  const db=fixture({'users/alice':profile()});
  const uid=user();
  uid.email='ALICE@EXAMPLE.TEST';
  const result=await run(db,uid);
  assert.equal(result.accountId,'Asteria#01416');
});
