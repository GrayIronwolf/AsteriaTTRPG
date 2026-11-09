import test from 'node:test';
import assert from 'node:assert/strict';
import {normaliseAccountUsername,validAccountNumber,randomAccountNumber,
  reserveAccountIdentity,ACCOUNT_ID_ALLOCATION_ATTEMPTS} from '../functions/accountIdentity.mjs';

function fixture(initial = {}) {
  const store = new Map(Object.entries(initial));
  let serial = Promise.resolve();
  return {
    store,
    doc(path) { return {path}; },
    runTransaction(fn) {
      const run = async () => {
        const writes = [];
        const tx = {
          async get(ref) {
            const data = store.get(ref.path);
            return {exists:store.has(ref.path),data:()=>structuredClone(data)};
          },
          create(ref, value) {
            if(store.has(ref.path) || writes.some(w=>w.path===ref.path)) throw Error('Already exists');
            writes.push({path:ref.path,value:structuredClone(value)});
          }
        };
        const result = await fn(tx);
        for(const w of writes) store.set(w.path,w.value);
        return result;
      };
      const pending = serial.then(run);
      serial = pending.then(()=>{},()=>{});
      return pending;
    }
  };
}

const reserve = (db,uid,name,numbers) => {
  let index = 0;
  return reserveAccountIdentity(db,uid,name,
    {nextNumber:()=>numbers[index++],now:new Date('2026-11-09T09:00:00Z')});
};

test('random generator always uses five decimal digits, including valid zero prefix',()=>{
  for(let i=0;i<100;i++) assert.match(randomAccountNumber(),/^\d{5}$/);
  assert.equal(validAccountNumber('00000'),true);
  assert.equal(validAccountNumber('01416'),true);
  for(const value of [0,'1234','123456','-1234',null,'12abc']) assert.equal(validAccountNumber(value),false);
});
test('username validation preserves display case and normalizes uniqueness case',()=>{
  assert.deepEqual(normaliseAccountUsername('  Asteria.One  '),
    {username:'Asteria.One',usernameLower:'asteria.one'});
  for(const value of ['', 'ab', 'a'.repeat(25), 'bad/name','bad#name','some name',null])
    assert.throws(()=>normaliseAccountUsername(value),/Username/);
});
test('new allocation atomically creates assignment and registry',async()=>{
  const db=fixture(),x=await reserve(db,'alice','Asteria',['01416']);
  assert.deepEqual(x,{username:'Asteria',accountNumber:'01416',
    accountId:'Asteria#01416',alreadyAssigned:false});
  assert.equal(db.store.get('accountIdAssignments/alice').accountIdKey,'asteria#01416');
  assert.equal(db.store.get('accountIdRegistry/asteria#01416').uid,'alice');
  assert.equal(db.store.size,2);
});
test('one username may share a number with another username',async()=>{
  const db=fixture();
  await reserve(db,'alice','Asteria',['01416']);
  const x=await reserve(db,'bob','Adventurer',['01416']);
  assert.equal(x.accountId,'Adventurer#01416');
  assert.equal(db.store.size,4);
});
test('matching username and code is unique, ignoring username case',async()=>{
  const db=fixture();
  await reserve(db,'alice','Asteria',['01416']);
  const x=await reserve(db,'bob','asteria',['01416','01417']);
  assert.equal(x.accountId,'asteria#01417');
  assert.equal(db.store.get('accountIdRegistry/asteria#01416').uid,'alice');
});
test('collision retries do not create orphan assignment or overwrite registry',async()=>{
  const db=fixture({'accountIdRegistry/asteria#00001':{uid:'somebody'}});
  const x=await reserve(db,'alice','Asteria',['00001','00002']);
  assert.equal(x.accountNumber,'00002');
  assert.equal(db.store.get('accountIdRegistry/asteria#00001').uid,'somebody');
  assert.equal(db.store.size,3);
});
test('identical requests return immutable original identity without extra writes',async()=>{
  const db=fixture();
  await reserve(db,'alice','Asteria',['00001']);
  const before=structuredClone([...db.store.entries()]);
  const x=await reserve(db,'alice','Asteria',['99999']);
  assert.equal(x.accountId,'Asteria#00001');
  assert.equal(x.alreadyAssigned,true);
  assert.deepEqual([...db.store.entries()],before);
});
test('different username cannot replace an existing assignment',async()=>{
  const db=fixture();
  await reserve(db,'alice','Asteria',['00001']);
  await assert.rejects(reserve(db,'alice','Other',['00002']),/already assigned/);
  assert.equal(db.store.size,2);
});
test('reconciliation failure blocks missing registry entry',async()=>{
  const db=fixture();
  await reserve(db,'alice','Asteria',['00001']);
  db.store.delete('accountIdRegistry/asteria#00001');
  await assert.rejects(reserve(db,'alice','Asteria',['00003']),/reconciliation/);
});
test('reconciliation failure blocks registry takeover',async()=>{
  const db=fixture();
  await reserve(db,'alice','Asteria',['00001']);
  db.store.get('accountIdRegistry/asteria#00001').uid='attacker';
  await assert.rejects(reserve(db,'alice','Asteria',['00003']),/reconciliation/);
});
test('invalid uid or generator result causes no database writes',async()=>{
  const db=fixture();
  await assert.rejects(reserve(db,'../alice','Asteria',['00001']),/Sign in/);
  await assert.rejects(reserve(db,'alice','Asteria',['abcde']),/generator/);
  assert.equal(db.store.size,0);
});
test('32 collisions fail closed without partial assignment',async()=>{
  const db=fixture(Object.fromEntries(Array.from({length:32},(_,i)=>
    ['accountIdRegistry/asteria#'+String(i).padStart(5,'0'),{uid:'other'}])));
  const values=Array.from({length:ACCOUNT_ID_ALLOCATION_ATTEMPTS},(_,i)=>String(i).padStart(5,'0'));
  await assert.rejects(reserve(db,'alice','Asteria',values),/No Account ID/);
  assert.equal(db.store.has('accountIdAssignments/alice'),false);
});
test('simultaneous claims for one key reserve two separate numbers',async()=>{
  const db=fixture();
  const [a,b]=await Promise.all([
    reserve(db,'alice','Asteria',['01234','01235']),
    reserve(db,'bob','asteria',['01234','01236'])
  ]);
  assert.notEqual(a.accountNumber,b.accountNumber);
  assert.equal(db.store.get('accountIdRegistry/asteria#'+a.accountNumber).uid,'alice');
  assert.equal(db.store.get('accountIdRegistry/asteria#'+b.accountNumber).uid,'bob');
});
