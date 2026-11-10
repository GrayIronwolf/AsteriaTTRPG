import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLegacyAccountIdentity,backfillLegacyAccountIdentity} from '../functions/accountIdentityLegacy.mjs';

const clone=x=>structuredClone(x);
function fixture(profilePatch={},authPatch={}) {
  const records=new Map([['users/alice',{uid:'alice',username:'Asteria',
    usernameLower:'asteria',email:'alice@example.test',firstName:'Keep',...profilePatch}]]);
  let chain=Promise.resolve();
  const db={projectId:'demo-asteria',records,doc(path){
    return {path,get:async()=>({exists:records.has(path),data:()=>clone(records.get(path))})};
  },runTransaction(callback){
    const fn=async()=>{
      const pending=[];
      const tx={
        get:async ref=>({exists:records.has(ref.path),data:()=>clone(records.get(ref.path))}),
        create(ref,data){if(records.has(ref.path)||pending.some(x=>x.path===ref.path))throw Error('duplicate');
          pending.push({kind:'create',path:ref.path,data:clone(data)});},
        update(ref,data){if(!records.has(ref.path))throw Error('missing');
          pending.push({kind:'update',path:ref.path,data:clone(data)});}
      };
      const result=await callback(tx);
      for(const p of pending)records.set(p.path,p.kind==='create'?p.data:{...records.get(p.path),...p.data});
      return result;
    };
    const done=chain.then(fn);chain=done.then(()=>{},()=>{});return done;
  }};
  const auth={getUser:async uid=>({uid,displayName:'Asteria',email:'alice@example.test',
    disabled:false,...authPatch})};
  return {db,auth,records};
}
const approval=()=>({enabled:true,confirmation:'BACKFILL-ACCOUNT-ID:alice',
  projectId:'demo-asteria',nextNumber:()=> '01416'});

test('preview never writes and allows verified legacy account',async()=>{
  const f=fixture();assert.deepEqual(await inspectLegacyAccountIdentity(f.db,f.auth,'alice'),
    {uid:'alice',status:'eligible',username:'Asteria'});assert.equal(f.records.size,1);
});
test('operator flag, UID confirmation and project identity are mandatory',async()=>{
  const f=fixture();
  for(const opt of [{},{enabled:true},{...approval(),confirmation:'wrong'},
    {...approval(),projectId:'other'}])
    await assert.rejects(backfillLegacyAccountIdentity(f.db,f.auth,'alice',opt),/disabled|project/);
  assert.equal(f.records.size,1);
});
test('successful one-account migration creates permanent and profile records',async()=>{
  const f=fixture();const result=await backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval());
  assert.equal(result.accountId,'Asteria#01416');
  assert.equal(f.records.get('users/alice').firstName,'Keep');
  assert.equal(f.records.get('accountIdRegistry/asteria#01416').uid,'alice');
  assert.equal(f.records.size,3);
});
test('repeated backfill is idempotent',async()=>{
  const f=fixture();await backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval());
  const before=clone([...f.records]);
  assert.equal((await backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval())).status,'already-assigned');
  assert.deepEqual([...f.records],before);
});
test('ambiguous legacy users cannot be migrated',async()=>{
  for(const [p,a] of [[{uid:'other'},{}],[{username:'bad username'},{}],
    [{usernameLower:'wrong'},{}],[{email:'other@example.test'},{}],
    [{},{displayName:'Other'}],[{},{disabled:true}],[{accountNumber:'00001'},{}]]){
    const f=fixture(p,a);
    assert.equal((await inspectLegacyAccountIdentity(f.db,f.auth,'alice')).status,'manual-review');
    await assert.rejects(backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval()),/manual reconciliation/);
    assert.equal(f.records.size,1);
  }
});
test('tampered existing registry is blocked',async()=>{
  const f=fixture();await backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval());
  f.records.get('accountIdRegistry/asteria#01416').uid='attacker';
  assert.equal((await inspectLegacyAccountIdentity(f.db,f.auth,'alice')).status,'manual-review');
});
test('transaction rejects username change after preflight',async()=>{
  const f=fixture(),original=f.db.runTransaction.bind(f.db);
  f.db.runTransaction=fn=>{f.records.get('users/alice').username='Altered';return original(fn);};
  await assert.rejects(backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval()),
    /changed after legacy review/);
  assert.equal(f.records.has('accountIdAssignments/alice'),false);
});
test('no automatic callable or bulk migration is exposed',async()=>{
  const {readFileSync}=await import('node:fs');
  const code=readFileSync(new URL('../functions/accountIdentityLegacy.mjs',import.meta.url),'utf8');
  const index=readFileSync(new URL('../functions/index.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/listUsers\(|onCall\(/);
  assert.doesNotMatch(index,/backfillLegacyAccountIdentity|accountIdentityLegacy/);
});

test('legacy profile with no uid gets a permanent ID only after Auth checks',async()=>{
  const f=fixture();
  delete f.records.get('users/alice').uid;
  const before=clone(f.records.get('users/alice'));
  assert.deepEqual(await inspectLegacyAccountIdentity(f.db,f.auth,'alice'),
    {uid:'alice',status:'eligible',username:'Asteria'});
  assert.deepEqual(f.records.get('users/alice'),before);
  const result=await backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval());
  assert.equal(result.accountId,'Asteria#01416');
  assert.equal(f.records.get('users/alice').uid,'alice');
  assert.equal(f.records.get('users/alice').firstName,'Keep');
  assert.equal(f.records.get('accountIdRegistry/asteria#01416').uid,'alice');
});
test('legacy missing uid is not repaired when Auth profile fails validation',async()=>{
  const f=fixture({}, {email:'wrong@example.test'});
  delete f.records.get('users/alice').uid;
  assert.equal((await inspectLegacyAccountIdentity(f.db,f.auth,'alice')).status,'manual-review');
  await assert.rejects(backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval()),
    /manual reconciliation/);
  assert.equal(f.records.get('users/alice').uid,undefined);
  assert.equal(f.records.has('accountIdAssignments/alice'),false);
});
test('conflicting explicit uid is never overwritten during a migration',async()=>{
  const f=fixture({uid:'other'});
  assert.equal((await inspectLegacyAccountIdentity(f.db,f.auth,'alice')).reason,'profile-uid-conflict');
  await assert.rejects(backfillLegacyAccountIdentity(f.db,f.auth,'alice',approval()),
    /manual reconciliation/);
  assert.equal(f.records.get('users/alice').uid,'other');
  assert.equal(f.records.has('accountIdAssignments/alice'),false);
});
