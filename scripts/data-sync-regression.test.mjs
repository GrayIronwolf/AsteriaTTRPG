import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(overrides={}) {
  const timers=new Map(),listeners=new Map(),domListeners=new Map(),storage=new Map();let id=0;let accountCallback;
  const status={textContent:'',dataset:{}};
  const counts={character:0,campaign:0,state:0,unsubscribed:0,localSaves:0};
  let user={uid:'alice'};
  const noop=()=>{};
  const window={campaigns:[],chars:{a:{id:'a',ownerUid:'alice'}},saveAsteriaState(){counts.localSaves++;},
    AsteriaAuthBridge:{getSession:()=>({uid:'alice'})},
    AsteriaFirebase:{getUser:()=>user,isReady:()=>Boolean(user),
      loadCharacters:async()=>{},loadCampaigns:async()=>[],loadState:async()=>({}),
      saveCharacter:async()=>{counts.character++;return true;},saveCampaign:async()=>{counts.campaign++;return true;},saveState:async()=>{counts.state++;return true;},
      subscribeAccountCampaigns:callback=>{accountCallback=callback;return ()=>counts.unsubscribed++;},
      subscribeCampaign:()=>()=>counts.unsubscribed++,subscribeCampaignCharacters:()=>()=>counts.unsubscribed++,
      ...overrides},
    addEventListener:(name,callback)=>listeners.set(name,callback),dispatchEvent:noop};
  const context={window,document:{hidden:false,body:{appendChild:noop},getElementById:name=>name==='asteriaSyncStatus'?status:null,addEventListener:(name,callback)=>domListeners.set(name,callback)},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    console:{log:noop,warn:noop},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    setTimeout:(callback,ms)=>{timers.set(++id,{callback,ms});return id;},clearTimeout:key=>timers.delete(key)};
  vm.runInNewContext(fs.readFileSync('js/character-access.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('js/data-sync.js','utf8'),context);
  domListeners.get('DOMContentLoaded')();
  return {window,counts,status,timers,listeners,remote:values=>accountCallback(values),setUser:value=>{user=value;},
    flush:async ms=>{for(const [key,timer] of [...timers])if(timer.ms===ms){timers.delete(key);await timer.callback();}}};
}

test('received account snapshots persist locally without scheduling cloud writes',async()=>{
  const h=harness();await h.window.AsteriaDataSync.load();
  h.remote([{id:'c',ownerUid:'alice',party:[]}]);
  assert.ok(h.counts.localSaves>0);
  assert.equal([...h.timers.values()].filter(timer=>timer.ms===900).length,0);
  assert.equal(h.counts.campaign,0);
});
test('a false save response cannot display saved status',async()=>{
  const h=harness({saveCharacter:async()=>false});
  assert.equal(await h.window.AsteriaDataSync.save(),false);
  assert.match(h.status.textContent,/save failed/);
  assert.equal(h.counts.state,0);
});
test('an edit arriving during a save is queued and persisted afterward',async()=>{
  let release;let calls=0;
  const h=harness({saveCharacter:async()=>{calls++;if(calls===1)await new Promise(resolve=>{release=resolve;});return true;}});
  const first=h.window.AsteriaDataSync.save();
  await h.window.AsteriaDataSync.save();release();await first;
  await h.flush(900);
  assert.equal(calls,2);assert.equal(h.counts.state,2);
});
test('failed account loads are retryable and concurrent loads coalesce',async()=>{
  let calls=0;const h=harness({loadCharacters:async()=>{calls++;if(calls===1)throw new Error('Quota exceeded.');}});
  await Promise.all([h.window.AsteriaDataSync.load(),h.window.AsteriaDataSync.load()]);
  assert.equal(calls,1);await h.window.AsteriaDataSync.load();assert.equal(calls,2);
  await h.window.AsteriaDataSync.load();assert.equal(calls,2);
});
test('logout disposes subscriptions and ignores late callbacks from the previous account',async()=>{
  const h=harness();await h.window.AsteriaDataSync.load();
  h.window.AsteriaDataSync.scheduleSave();h.setUser(null);
  h.listeners.get('asteria:firebase-signed-out')();
  h.setUser({uid:'bob'});h.remote([{id:'old-account',ownerUid:'alice'}]);
  assert.equal(h.window.campaigns.length,0);assert.ok(h.counts.unsubscribed>0);
  assert.equal([...h.timers.values()].filter(timer=>timer.ms===900).length,0);
});


test('viewing another account character never exports or saves it as owned',async()=>{
  const saved=[];
  const h=harness({saveCharacter:async(id,record)=>{saved.push([id,record.ownerUid]);return true;}});
  h.window.chars.b={id:'b',ownerUid:'bob',accountId:'alice'};
  h.window.session={uid:'alice',character:'b'};
  h.window.accountUsers={alice:{characters:['a','b']}};
  h.window.AsteriaAuthBridge.getSession=()=>({uid:'alice',account:'alice',character:'b',profile:{characters:['a','b']}});
  assert.equal(await h.window.AsteriaDataSync.save(),true);
  assert.deepEqual(saved,[['a','alice']]);
});
