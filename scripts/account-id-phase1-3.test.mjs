import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureAccountIdentityProfile} from '../functions/accountIdentityProfile.mjs';

const now=new Date('2026-11-09T09:30:00.000Z');
const clone=x=>structuredClone(x);
function fixture(initial={}) {
  const store=new Map(Object.entries(initial));
  let lock=Promise.resolve();
  return {store,doc:path=>({path}),runTransaction(fn){
    const execute=async()=>{
      const writes=[];
      const tx={
        get:async ref=>({exists:store.has(ref.path),data:()=>clone(store.get(ref.path))}),
        create(ref,data){
          if(store.has(ref.path)||writes.some(w=>w.path===ref.path)) throw Error('Duplicate');
          writes.push({kind:'create',path:ref.path,data:clone(data)});
        },
        update(ref,data){
          if(!store.has(ref.path)) throw Error('Missing profile');
          writes.push({kind:'update',path:ref.path,data:clone(data)});
        }
      };
      const result=await fn(tx);
      for(const write of writes)store.set(write.path,write.kind==='update'?
        {...store.get(write.path),...write.data}:write.data);
      return result;
    };
    const result=lock.then(execute);
    lock=result.then(()=>{},()=>{});
    return result;
  }};
}
const profile=(uid,username)=>({uid,username,usernameLower:username.toLowerCase(),
  firstName:'Test',characters:[],role:'account'});
function ensure(db,uid,numbers){
  let i=0;
  return ensureAccountIdentityProfile(db,uid,{now,nextNumber:()=>numbers[i++]});
}
test('persists an ID in profile, private assignment and unique registry atomically',async()=>{
  const db=fixture({'users/alice':profile('alice','Asteria')});
  const r=await ensure(db,'alice',['01416']);
  assert.deepEqual(r,{username:'Asteria',accountNumber:'01416',
    accountId:'Asteria#01416',alreadyAssigned:false,profileRepaired:false});
  assert.equal(db.store.get('users/alice').accountIdAssignedAt,now.toISOString());
  assert.equal(db.store.get('accountIdRegistry/asteria#01416').uid,'alice');
  assert.equal(db.store.get('users/alice').firstName,'Test');
  assert.equal(db.store.size,3);
});
test('different usernames may share the same suffix',async()=>{
  const db=fixture({'users/a':profile('a','Asteria'),'users/b':profile('b','Other')});
  await ensure(db,'a',['00005']);
  assert.equal((await ensure(db,'b',['00005'])).accountId,'Other#00005');
});
test('matching username case variants collide and retry',async()=>{
  const db=fixture({'users/a':profile('a','Asteria'),'users/b':profile('b','asteria')});
  await ensure(db,'a',['00005']);
  assert.equal((await ensure(db,'b',['00005','00006'])).accountNumber,'00006');
});
test('repeating the same request keeps the original permanent identity',async()=>{
  const db=fixture({'users/a':profile('a','Asteria')});
  await ensure(db,'a',['00001']);
  const before=clone([...db.store]);
  const r=await ensure(db,'a',['99999']);
  assert.equal(r.accountId,'Asteria#00001');
  assert.equal(r.alreadyAssigned,true);
  assert.deepEqual([...db.store],before);
});
test('repairs missing profile projection only for consistent existing records',async()=>{
  const db=fixture({'users/a':profile('a','Asteria')});
  await ensure(db,'a',['00001']);
  for(const field of ['accountId','accountNumber','accountIdKey','accountIdAssignedAt'])
    delete db.store.get('users/a')[field];
  const r=await ensure(db,'a',['00099']);
  assert.equal(r.profileRepaired,true);
  assert.equal(db.store.get('users/a').accountId,'Asteria#00001');
});
test('partially forged profile projection fails without any allocation',async()=>{
  const db=fixture({'users/a':{...profile('a','Asteria'),accountNumber:'00001'}});
  await assert.rejects(ensure(db,'a',['00002']),/reconciliation/);
  assert.equal(db.store.size,1);
});
test('missing profile, invalid username and mismatched owner fail closed',async()=>{
  const db=fixture({'users/a':profile('wrong','Asteria'),
    'users/b':{uid:'b',username:'invalid@email'}});
  await assert.rejects(ensure(db,'a',['00001']),/ownership/);
  await assert.rejects(ensure(db,'b',['00001']),/Username/);
  await assert.rejects(ensure(db,'none',['00001']),/Create the account profile/);
  assert.equal(db.store.size,2);
});
test('assigned username cannot be changed without reconciliation',async()=>{
  const db=fixture({'users/a':profile('a','Asteria')});
  await ensure(db,'a',['00001']);
  db.store.get('users/a').username='Other';
  await assert.rejects(ensure(db,'a',['00002']),/reconciliation/);
});
test('registry corruption prevents silent profile repair',async()=>{
  const db=fixture({'users/a':profile('a','Asteria')});
  await ensure(db,'a',['00001']);
  db.store.get('accountIdRegistry/asteria#00001').uid='attacker';
  await assert.rejects(ensure(db,'a',['00001']),/reconciliation/);
});
test('competing UID claims never reserve the same username and suffix',async()=>{
  const db=fixture({'users/a':profile('a','Asteria'),'users/b':profile('b','asteria')});
  const [a,b]=await Promise.all([
    ensure(db,'a',['01234','01235']),ensure(db,'b',['01234','01236'])
  ]);
  assert.notEqual(a.accountNumber,b.accountNumber);
  assert.equal(db.store.get('accountIdRegistry/asteria#'+a.accountNumber).uid,'a');
  assert.equal(db.store.get('accountIdRegistry/asteria#'+b.accountNumber).uid,'b');
});
test('simultaneous retries for one UID converge on one assignment',async()=>{
  const db=fixture({'users/a':profile('a','Asteria')});
  const [a,b]=await Promise.all([ensure(db,'a',['01234']),ensure(db,'a',['45678'])]);
  assert.equal(a.accountId,b.accountId);
  assert.equal(db.store.size,3);
});
test('invalid number generator fails before writes',async()=>{
  const db=fixture({'users/a':profile('a','Asteria')});
  await assert.rejects(ensure(db,'a',['bad']),/generator/);
  assert.equal(db.store.size,1);
});
test('backend callable requires a feature flag and refuses client-selected UID/username',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../functions/index.mjs',import.meta.url),'utf8');
  assert.match(source,/export const asteriaAccountIdentity=onCall/);
  assert.match(source,/process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'/);
  assert.match(source,/Object.keys\(data\).length!==1\|\|data.action!=='ensure'/);
  assert.match(source,/getUser\(request.auth.uid\)/);
  assert.match(source,/issueNewRegistrationAccountId\(getFirestore\(\),firebaseUser,request.auth.uid/);
  assert.match(source,/ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE/);
});
