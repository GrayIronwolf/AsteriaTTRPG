import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findFriendByAccountId,normaliseFriendAccountId,FRIEND_LOOKUP_LIMITS}
  from '../functions/friendAccountLookup.mjs';

const created='2026-11-10T00:00:00.000Z';
const identities=[
  ['alice','Grayson','01448'],
  ['bob','Asteria','00009']
];
function seed(){
  const data=new Map();
  for(const [uid,username,n] of identities){
    const lower=username.toLowerCase(),key=lower+'#'+n,id=username+'#'+n;
    data.set('users/'+uid,{uid,username,usernameLower:lower,accountId:id,
      accountIdKey:key,accountNumber:n,accountIdAssignedAt:created,
      email:uid+'@private.example',firstName:'Private Person'});
    data.set('accountIdAssignments/'+uid,{uid,username,usernameLower:lower,
      accountId:id,accountIdKey:key,accountNumber:n,createdAt:created});
    data.set('accountIdRegistry/'+key,{uid,usernameLower:lower,
      accountId:id,accountIdKey:key,accountNumber:n,createdAt:created});
  }
  return data;
}
function harness(source=seed()){
  const dbState=new Map([...source].map(([k,v])=>[k,{...v}]));
  const db={
    doc:path=>({path}),
    async runTransaction(callback){
      const patches=new Map();
      const tx={
        async get(ref){
          const data=patches.has(ref.path)?patches.get(ref.path):dbState.get(ref.path);
          return {exists:!!data,data:()=>data?{...data}:undefined};
        },
        set(ref,payload){patches.set(ref.path,{...payload});}
      };
      const value=await callback(tx);
      for(const [path,patch] of patches)dbState.set(path,patch);
      return value;
    }
  };
  const disabled=new Set();
  const auth={
    async getUser(uid){
      if(!['alice','bob'].includes(uid))throw Error('Not found');
      return {uid,disabled:disabled.has(uid)};
    }
  };
  const at=new Date('2026-11-11T01:00:00.000Z');
  const find=(uid,handle,now=at)=>findFriendByAccountId(db,auth,uid,handle,{now});
  return {dbState,disabled,find,at};
}
test('exact handle search preserves casing but never returns UID or private profile fields',async()=>{
  const {find}=harness();
  const match=await find('alice','  aStErIa#00009  ');
  assert.deepEqual(match,{found:true,username:'Asteria',accountId:'Asteria#00009'});
  const serialized=JSON.stringify(match);
  for(const word of ['bob','email','firstName','private','createdAt'])
    assert.equal(serialized.includes(word),false);
  assert.deepEqual(await find('alice','Asteria#00010'),{found:false});
});
test('exact format only, no partial names, wildcard or non-ASCII characters',()=>{
  assert.equal(normaliseFriendAccountId('GRAYSON#01448').key,'grayson#01448');
  for(const handle of ['Grayson','Grayson#1448','Grayson#014481','G#12345',
    'Grayson#abcde','Grayson*#01448','Grayson%23#01448','Grayson#01448/name',
    'Gráyson#01448',null,42,'x'.repeat(100)])
    assert.throws(()=>normaliseFriendAccountId(handle),/Invalid Account ID/);
});
test('valid misses and hits consume quota and throttle beyond both window and day ceilings',async()=>{
  const {find,dbState,at}=harness();
  for(let i=0;i<FRIEND_LOOKUP_LIMITS.perWindow;i++)
    await find('alice','Asteria#00010');
  assert.equal(dbState.get('friendLookupThrottle/alice').windowCount,10);
  assert.equal(dbState.get('friendLookupThrottle/alice').dayCount,10);
  await assert.rejects(find('alice','Asteria#00009'),/rate limit/);
  const later=new Date(at.getTime()+16*60*1000);
  assert.deepEqual(await find('alice','Asteria#00009',later),{
    found:true,username:'Asteria',accountId:'Asteria#00009'
  });
  for(let period=2;period<=4;period++){
    const time=new Date(at.getTime()+period*16*60*1000);
    const count=period===4?9:10;
    for(let j=0;j<count;j++)await find('alice','Asteria#00010',time);
  }
  await assert.rejects(find('alice','Asteria#00009',
    new Date(at.getTime()+65*60*1000)),/rate limit/);
  const dayLater=new Date(at.getTime()+25*60*60*1000);
  assert.equal((await find('alice','Asteria#00009',dayLater)).found,true);
});
test('disabled and invalid callers fail before consuming search quota',async()=>{
  const {find,disabled,dbState}=harness();
  disabled.add('alice');
  await assert.rejects(find('alice','Asteria#00009'),/unavailable/);
  disabled.delete('alice');
  await assert.rejects(find('not-an-account','Asteria#00009'),/unavailable/);
  await assert.rejects(find('alice','invalid'),/Invalid Account ID/);
  assert.equal(dbState.has('friendLookupThrottle/alice'),false);
});
test('disabled target and corrupt profiles are not discoverable',async()=>{
  const a=harness();
  a.disabled.add('bob');
  assert.deepEqual(await a.find('alice','Asteria#00009'),{found:false});
  const b=harness();
  b.dbState.get('users/bob').accountNumber='99999';
  assert.deepEqual(await b.find('alice','Asteria#00009'),{found:false});
});
test('renamed current handle resolves but old alias does not; UID never leaves the server',async()=>{
  const state=seed();
  const old=state.get('accountIdRegistry/asteria#00009');
  state.set('accountIdRegistry/asteria#00009',{...old,alias:true,
    activeAccountIdKey:'avalon#00009'});
  const next={...old,usernameLower:'avalon',accountId:'Avalon#00009',
    accountIdKey:'avalon#00009',alias:false,activeAccountIdKey:'avalon#00009'};
  state.set('accountIdRegistry/avalon#00009',next);
  for(const path of ['users/bob','accountIdAssignments/bob']){
    const doc=state.get(path);
    state.set(path,{...doc,username:'Avalon',usernameLower:'avalon',
      accountId:'Avalon#00009',accountIdKey:'avalon#00009'});
  }
  const {find}=harness(state);
  assert.deepEqual(await find('alice','Asteria#00009'),{found:false});
  assert.deepEqual(await find('alice','AVALON#00009'),
    {found:true,username:'Avalon',accountId:'Avalon#00009'});
});
test('corrupt caller identity or rate quota fails closed without rewriting reserved identities',async()=>{
  const a=harness();
  a.dbState.get('accountIdAssignments/alice').accountId='Forged#01448';
  await assert.rejects(a.find('alice','Asteria#00009'),/unavailable/);
  assert.equal(a.dbState.has('friendLookupThrottle/alice'),false);
  const b=harness();
  b.dbState.set('friendLookupThrottle/alice',{uid:'bob',
    windowStartMs:b.at.getTime(),dayStartMs:b.at.getTime(),windowCount:1,dayCount:1});
  await assert.rejects(b.find('alice','Asteria#00009'),/unavailable/);
});
test('new callable is authenticated, gated and privacy safe; Firestore is server-only',()=>{
  const entry=readFileSync(new URL('../functions/index.mjs',import.meta.url),'utf8');
  const block=entry.split('// Phase 1.2 Friends System:')[1]?.split(
    '// Authenticated username edits')[0];
  assert.ok(block);
  assert.match(block,/request.auth\?\.uid/);
  assert.match(block,/process.env.ASTERIA_FRIEND_LOOKUP_ENABLED!=='1'/);
  assert.match(block,/Object.keys\(input\).sort\(\).join/);
  assert.match(block,/findFriendByAccountId\(getFirestore\(\),getAuth\(\),request.auth.uid/);
  assert.doesNotMatch(block,/input.uid|input.targetUid/);
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.match(rules,/match \/friendLookupThrottle\/\{uid\} \{\s*allow read, write: if false/);
  assert.match(rules,/match \/accountIdRegistry\/\{accountIdKey\} \{\s*allow read, write: if false/);
});
