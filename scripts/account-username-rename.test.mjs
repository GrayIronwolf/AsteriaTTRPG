import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renameAccountIdentity} from '../functions/accountIdentityUsername.mjs';

const uid='alice',date='2026-11-10T00:00:00.000Z';
const seed=()=>{
  const number='01448',username='Grayson',lower='grayson';
  return new Map([
    ['users/'+uid,{uid,username,usernameLower:lower,accountId:username+'#'+number,accountIdKey:lower+'#'+number,accountNumber:number,accountIdAssignedAt:date,displayName:username}],
    ['accountIdAssignments/'+uid,{uid,username,usernameLower:lower,accountId:username+'#'+number,accountIdKey:lower+'#'+number,accountNumber:number,createdAt:date}],
    ['accountIdRegistry/'+lower+'#'+number,{uid,usernameLower:lower,accountId:username+'#'+number,accountIdKey:lower+'#'+number,accountNumber:number,createdAt:date}]
  ]);
};
function mock(initial=seed()){
  const state=new Map(initial),db={
    doc:path=>({path}),
    async runTransaction(fn){
      const changes=new Map(),creates=new Set();
      const tx={
        async get(ref){
          const obj=changes.has(ref.path)?changes.get(ref.path):state.get(ref.path);
          return {exists:obj!==undefined,data:()=>({...obj})};
        },
        create(ref,data){if(state.has(ref.path)||creates.has(ref.path))throw Error('Already exists.');creates.add(ref.path);changes.set(ref.path,{...data});},
        update(ref,data){if(!state.has(ref.path)&&!changes.has(ref.path))throw Error('Not found.');changes.set(ref.path,{...(changes.get(ref.path)||state.get(ref.path)),...data});}
      };
      const result=await fn(tx);
      for(const [key,value] of changes)state.set(key,value);
      return result;
    }
  };
  return {db,state};
}
const rename=(db,username,expected='Grayson#01448')=>renameAccountIdentity(db,uid,username,{expectedAccountId:expected,now:new Date('2026-11-11T00:00:00.000Z')});
test('atomic rename keeps UID and number, and reserves old handle as alias',async()=>{
  const {db,state}=mock();
  const r=await rename(db,'Astria');
  assert.equal(r.accountId,'Astria#01448');
  assert.equal(r.accountNumber,'01448');
  assert.equal(r.previousAccountId,'Grayson#01448');
  assert.equal(state.get('users/alice').accountId,'Astria#01448');
  assert.equal(state.get('users/alice').displayName,'Astria');
  assert.equal(state.get('accountIdAssignments/alice').accountNumber,'01448');
  assert.equal(state.get('accountIdRegistry/astria#01448').uid,'alice');
  assert.equal(state.get('accountIdRegistry/grayson#01448').alias,true);
  assert.equal(state.get('accountIdRegistry/grayson#01448').activeAccountIdKey,'astria#01448');
});
test('collision with the same username and number rejects with zero writes',async()=>{
  const data=seed();
  data.set('accountIdRegistry/astria#01448',{uid:'bob',accountIdKey:'astria#01448',accountNumber:'01448',usernameLower:'astria'});
  const {db,state}=mock(data);const before=JSON.stringify([...state]);
  await assert.rejects(rename(db,'Astria'),/unavailable/);
  assert.equal(JSON.stringify([...state]),before);
});
test('other five-digit numbers can reuse a username safely',async()=>{
  const data=seed();
  data.set('accountIdRegistry/astria#99999',{uid:'bob',usernameLower:'astria',accountNumber:'99999',accountIdKey:'astria#99999',accountId:'Astria#99999'});
  const {db}=mock(data);assert.equal((await rename(db,'Astria')).accountId,'Astria#01448');
});
test('case-only edits update public handle and remain unique',async()=>{
  const {db,state}=mock();
  const r=await rename(db,'GRAYSON');
  assert.equal(r.accountId,'GRAYSON#01448');
  assert.equal(state.get('accountIdRegistry/grayson#01448').accountId,'GRAYSON#01448');
  assert.equal(state.size,3);
});
test('username errors and stale identity are rejected, with unchanged data',async()=>{
  const {db,state}=mock(),before=JSON.stringify([...state]);
  for(const value of ['a','abc def','a/b','x'.repeat(25),''])await assert.rejects(rename(db,value));
  await assert.rejects(rename(db,'Astria','Other#01448'),/Refresh/);
  assert.equal(JSON.stringify([...state]),before);
});
test('missing or corrupt assignment requires reconciliation',async()=>{
  const data=seed();
  data.delete('accountIdAssignments/alice');
  await assert.rejects(rename(mock(data).db,'Astria'),/reconciliation/);
  const corrupt=seed();corrupt.get('accountIdAssignments/alice').accountNumber='01111';
  await assert.rejects(rename(mock(corrupt).db,'Astria'),/reconciliation/);
});
test('reverting to an owned alias reactivates it without losing number',async()=>{
  const {db,state}=mock();
  await rename(db,'Astria');
  const r=await renameAccountIdentity(db,'alice','Grayson',{expectedAccountId:'Astria#01448'});
  assert.equal(r.accountId,'Grayson#01448');
  assert.equal(state.get('accountIdRegistry/grayson#01448').alias,false);
  assert.equal(state.get('accountIdRegistry/astria#01448').alias,true);
});
test('browser cannot edit account registry or username directly',()=>{
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.match(rules,/!changed\.hasAny\(\['username', 'usernameLower', 'uid'\]\)/);
  assert.match(rules,/match \/accountIdRegistry\/\{accountIdKey\} \{\s*allow read, write: if false/);
});
