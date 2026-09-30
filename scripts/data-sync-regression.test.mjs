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

test('cached campaigns and character links do not start streams before access is confirmed',async()=>{
  const watched=[];
  const h=harness({subscribeCampaign:id=>{watched.push(id);return ()=>{};}});
  h.window.campaigns=[{id:'removed',ownerUid:'alice'}];
  h.window.chars.a.sharedCampaignId='removed';
  await h.window.AsteriaDataSync.load();
  assert.deepEqual(watched,[]);
  h.remote([{id:'current',ownerUid:'gm',roles:{alice:'player'}}]);
  assert.deepEqual(watched,['current']);
  assert.ok(h.window.campaigns.some(c=>c.id==='removed'),'A stale cache must not be destructively deleted');
});

function campaignBrowserMethod(name,dependencies,functions=[]) {
  const source=fs.readFileSync('js/firebase-auth.js','utf8');
  const declarations=functions.map(name=>{
    const start=source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const end=source.slice(start+1).search(/\n(?:async )?function /);
    return source.slice(start,start+1+end);
  }).join('\n');
  const start=source.indexOf(`  ${name}:`),end=source.indexOf('\n  },',start)+4;
  return Function(...Object.keys(dependencies),`${declarations}\nreturn ${start<0?name:`({${source.slice(start,end)}}).${name}`};`)(...Object.values(dependencies));
}

test('unreadable and removed saved campaigns do not trigger roster reads or false delivery errors',async()=>{
  const calls=[],errors=[];
  let result='denied';
  const load=campaignBrowserMethod('loadSharedCampaignDetails',{
    db:{},doc:(_db,...parts)=>parts.join('/'),collection:(_db,...parts)=>parts.join('/'),
    getDoc:async path=>{calls.push(path);if(result==='denied')throw Object.assign(new Error('Denied'),{code:'permission-denied'});return {exists:()=>false};},
    getDocs:async()=>{throw Error('Roster read should not be attempted');},
    reportSyncError:(...args)=>errors.push(args),mergeSharedCampaign:()=>{throw Error('An inaccessible campaign must not be promoted');}
  },['loadSharedCampaignDetails']);
  assert.equal(await load('stale',{ownerUid:'alice'}),null);
  result='removed';assert.equal(await load('deleted',{ownerUid:'alice'}),null);
  assert.deepEqual(calls,['campaigns/stale','campaigns/deleted']);assert.deepEqual(errors,[]);
});

test('discovery publishes only verified campaign records and retains authorized legacy role links',()=>{
  const watchers=new Map(),emissions=[],errors=[];let stopped=0;
  const subscribe=campaignBrowserMethod('subscribeAccountCampaigns',{
    db:{},currentUser:{uid:'alice'},doc:(_db,...parts)=>parts.join('/'),collection:(_db,...parts)=>parts.join('/'),
    campaignMembershipQueries:()=>['owner-query','gm-query','player-query'],linkedCampaignIdsFromOwnedCharacters:()=>['stale'],
    onSnapshot:(path,_options,success,failure)=>{watchers.set(path,{success,failure});return ()=>{stopped++;};},
    reportSyncError:(...args)=>errors.push(args),mergeSharedCampaign:(a,b)=>({...a,...b})
  });
  const unsubscribe=subscribe(campaigns=>emissions.push(campaigns));
  const collectionSnapshot=(rows,fromCache=false)=>({metadata:{fromCache},forEach:callback=>rows.forEach(row=>callback({id:row.id,data:()=>row}))});
  const documentSnapshot=(record,fromCache=false)=>({metadata:{fromCache},exists:()=>Boolean(record),data:()=>record});
  watchers.get('users/alice/campaigns').success(collectionSnapshot([{id:'stale',ownerUid:'alice'},{id:'legacy',ownerUid:'gm'}]));
  assert.deepEqual(emissions.at(-1),[]);
  watchers.get('owner-query').success(collectionSnapshot([{id:'cached-only',ownerUid:'alice'}],true));
  assert.deepEqual(emissions.at(-1),[]);
  watchers.get('campaigns/stale').failure({code:'permission-denied'});
  assert.deepEqual(errors,[]);
  watchers.get('campaigns/legacy').success(documentSnapshot({id:'legacy',ownerUid:'gm',roles:{alice:'player'}}));
  watchers.get('player-query').success(collectionSnapshot([{id:'current',ownerUid:'gm',playerUids:['alice']} ]));
  assert.deepEqual(emissions.at(-1).map(c=>c.id).sort(),['current','legacy']);
  watchers.get('campaigns/legacy').failure({code:'permission-denied'});
  assert.deepEqual(emissions.at(-1).map(c=>c.id),['current']);
  const count=emissions.length;unsubscribe();
  watchers.get('player-query').success(collectionSnapshot([{id:'late'}]));
  assert.equal(emissions.length,count);assert.equal(stopped,6);
});

test('background discovery errors do not break an open dashboard; its actual stream errors still surface',async()=>{
  const {createServer}=await import('vite'),React=await import('react'),Renderer=await import('react-test-renderer');
  const originalNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),originalWindow=globalThis.window;
  const target=new EventTarget(),noop=()=>{},emit=value=>(_id,callback)=>{callback(value,{fromCache:false});return noop;};
  globalThis.window=Object.assign(target,{setInterval,clearInterval,AsteriaFirebase:{isReady:()=>true,getUser:()=>({uid:'alice'}),
    subscribeCampaign:emit({id:'current'}),subscribeCampaignCharacters:emit({a:{id:'a',ownerUid:'alice'}}),subscribeLiveSession:emit({status:'idle'}),
    subscribePartyWorkspace:emit({}),subscribePartyChat:emit([]),subscribeCampaignItemEcosystem:emit({}),subscribeCampaignEvents:emit([]),subscribeCampaignEncounter:emit({}),
    subscribeCustomItems:callback=>{callback([]);return noop;}}});
  Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
  const server=await createServer({configFile:false,server:{middlewareMode:true}});let view,latest;
  try {
    const {useCampaignLiveData}=await server.ssrLoadModule('/src/sessions/useCampaignLiveData.js');
    function Probe(){latest=useCampaignLiveData('current',{characterId:'a'});return null;}
    await Renderer.act(async()=>{view=Renderer.create(React.createElement(Probe));});
    assert.equal(latest.error,'');assert.equal(latest.loading,false);
    const fail=detail=>Renderer.act(async()=>target.dispatchEvent(new CustomEvent('asteria:firebase-sync-error',{detail:{code:'permission-denied',message:'Denied',...detail}})));
    await fail({scope:'campaign-membership-listener',uid:'alice'});
    await fail({scope:'campaign-discovery-link',campaignId:'current',uid:'alice'});
    await fail({scope:'campaign-listener',campaignId:'other'});
    await fail({scope:'campaign-listener',campaignId:'current',uid:'previous-account'});
    assert.equal(latest.error,'');assert.ok(latest.character);
    await fail({scope:'campaign-listener',campaignId:'current'});
    assert.equal(latest.error,'Denied');assert.equal(latest.connectionState,'error');
  } finally {
    if(view)await Renderer.act(async()=>view.unmount());await server.close();
    if(originalNavigator)Object.defineProperty(globalThis,'navigator',originalNavigator);else delete globalThis.navigator;
    if(originalWindow)globalThis.window=originalWindow;else delete globalThis.window;
  }
});
