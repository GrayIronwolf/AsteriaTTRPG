import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {resolveAuthRuntime} from '../frontend/src/auth/authPolicy.mjs';
import {
  createFirebaseRuntimeOwner,validateFirebaseRuntime,assertFirebaseApp
} from '../frontend/src/firebase/firebaseRuntime.mjs';
import {createFirebaseClientAdapters} from '../frontend/src/firebase/firebaseClientAdapters.mjs';

const production=resolveAuthRuntime({enabled:true,mode:'production',hostname:'example.com'});
const emulator=resolveAuthRuntime({enabled:true,mode:'emulator',hostname:'localhost'});
const read=path=>readFileSync(resolve(import.meta.dirname,'../'+path),'utf8');

function mockedSDK({existing=null,failPersistence=false}={}){
  const calls={init:0,delete:0,auth:0,firestore:0,functions:0,storage:0,
    authConnect:0,firestoreConnect:0,functionsConnect:0,storageConnect:0,
    persistence:0,region:[],paths:[]};
  let app=existing;
  const sdk={
    appSdk:{
      getApps:()=>app?[app]:[],
      getApp:()=>app,
      initializeApp:config=>{calls.init++;app={name:'[DEFAULT]',options:config};return app;},
      deleteApp:async()=>{calls.delete++;app=null;}
    },
    authSdk:{
      getAuth:()=>{calls.auth++;return {name:'auth'};},
      connectAuthEmulator:()=>{calls.authConnect++;},
      setPersistence:async(_auth,selected)=>{calls.persistence++;if(failPersistence)throw Error('persistence failed');calls.persistenceType=selected;},
      inMemoryPersistence:'memory',
      browserLocalPersistence:'browser'
    },
    firestoreSdk:{
      getFirestore:()=>{calls.firestore++;return {name:'firestore'};},
      connectFirestoreEmulator:()=>{calls.firestoreConnect++;}
    },
    functionsSdk:{
      getFunctions:(_app,region)=>{calls.functions++;calls.region.push(region);return {name:'functions'};},
      connectFunctionsEmulator:()=>{calls.functionsConnect++;}
    },
    storageSdk:{
      getStorage:()=>{calls.storage++;return {name:'storage'};},
      connectStorageEmulator:()=>{calls.storageConnect++;}
    }
  };
  return {calls,sdk,loadSdk:async()=>sdk,get app(){return app;}};
}
test('runtime fails closed on missing opt-in, modes, project IDs and modified configuration',()=>{
  assert.throws(()=>validateFirebaseRuntime({enabled:false}),/disabled/);
  assert.throws(()=>validateFirebaseRuntime({...production,mode:'other'}),/production or emulator/);
  assert.throws(()=>validateFirebaseRuntime({...production,projectId:'rogue'}),/configuration/);
  assert.throws(()=>validateFirebaseRuntime({...production,config:{...production.config,storageBucket:'another'}}),/configuration/);
  assert.equal(validateFirebaseRuntime(production).projectId,'asteria-ttrpg');
  assert.equal(validateFirebaseRuntime(emulator).projectId,'demo-asteria');
});
test('the same runtime promise is returned for parallel connections, including both Auth and Storage',async()=>{
  const m=mockedSDK(),owner=createFirebaseRuntimeOwner({loadSdk:m.loadSdk});
  const first=owner.connect(emulator),second=owner.connect(emulator);
  assert.equal(first,second);
  const [a,b]=await Promise.all([first,second]);
  assert.strictEqual(a,b);
  assert.equal(a.mode,'emulator');
  assert.equal(m.calls.init,1);
  assert.deepEqual([m.calls.auth,m.calls.firestore,m.calls.storage,m.calls.functions],[1,1,1,1]);
  assert.deepEqual([m.calls.authConnect,m.calls.firestoreConnect,m.calls.storageConnect,m.calls.functionsConnect],[1,1,1,1]);
  assert.equal(m.calls.persistence,1);
  assert.deepEqual(m.calls.region,['us-central1']);
  assert.strictEqual(a.adapters.auth.instance,a.auth);
  assert.strictEqual(a.adapters.firestore.instance,a.db);
  assert.strictEqual(a.adapters.storage.instance,a.storage);
  assert.strictEqual(a.adapters.functions.instance,a.functions);
  assert.strictEqual(a.adapters.firestore.sdk,a.firestoreSdk);
  assert.strictEqual(a.adapters.storage.sdk,a.storageSdk);
  assert(Object.isFrozen(a)&&Object.isFrozen(a.adapters));
  assert.throws(()=>owner.connect(production),/changed without a full page reload/);
});
test('production reuses matching default app and never enables emulators',async()=>{
  const existing={name:'[DEFAULT]',options:production.config};
  const m=mockedSDK({existing});
  const result=await createFirebaseRuntimeOwner({loadSdk:m.loadSdk}).connect(production);
  assert.strictEqual(result.app,existing);
  assert.equal(m.calls.init,0);
  assert.equal(m.calls.authConnect+m.calls.firestoreConnect+m.calls.functionsConnect+m.calls.storageConnect,0);
  assert.equal(m.calls.persistence,1);
});
test('incompatible initialized app, name or multiple apps refuse to start',async()=>{
  assert.throws(()=>assertFirebaseApp({name:'another',options:production.config},production.config),/incompatible/);
  assert.throws(()=>assertFirebaseApp({name:'[DEFAULT]',options:{...production.config,projectId:'another'}},production.config),/incompatible/);
  assert.throws(()=>assertFirebaseApp({name:'[DEFAULT]',options:{...production.config,storageBucket:'different'}},production.config),/incompatible/);
  const rogue=mockedSDK({existing:{name:'[DEFAULT]',options:production.config}});
  await assert.rejects(
    createFirebaseRuntimeOwner({loadSdk:rogue.loadSdk}).connect(emulator),/incompatible/);
  assert.equal(rogue.calls.init,0);
  assert.equal(rogue.calls.delete,0);
  const m=mockedSDK();m.sdk.appSdk.getApps=()=>[{name:'one'},{name:'two'}];
  await assert.rejects(createFirebaseRuntimeOwner({loadSdk:m.loadSdk}).connect(emulator),/already initialized/);
});
test('failed initial adapter is not cached; a later safe retry initializes again',async()=>{
  const m=mockedSDK({failPersistence:true});
  const owner=createFirebaseRuntimeOwner({loadSdk:m.loadSdk});
  await assert.rejects(owner.connect(emulator),/persistence failed/);
  assert.equal(m.calls.delete,1);
  m.sdk.authSdk.setPersistence=async()=>{m.calls.persistence++;};
  const recovered=await owner.connect(emulator);
  assert.equal(recovered.projectId,emulator.projectId);
  assert.equal(m.calls.init,2);
  assert.equal(m.calls.delete,1);
});
test('SDK dependency contract is complete, immutable and fails on partial wiring',()=>{
  const m=mockedSDK();
  const partial={app:{},auth:{},db:{},storage:{},functions:{},...m.sdk};
  const valid=createFirebaseClientAdapters(partial);
  assert.strictEqual(valid.dependencies.auth,partial.auth);
  assert.strictEqual(valid.dependencies.storageSdk,m.sdk.storageSdk);
  assert(Object.isFrozen(valid.dependencies)&&Object.isFrozen(valid.adapters.auth));
  assert.throws(()=>createFirebaseClientAdapters({...partial,storage:null}),/All initialized/);
});
test('single SDK loader owns app and emulator setup across all migrated features',()=>{
  const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  const shared=read('frontend/src/firebase/firebaseRuntime.mjs');
  const bootstrap=read('frontend/src/auth/AuthBootstrap.jsx');
  const client=read('frontend/src/firebase/firebaseClientAdapters.mjs');
  assert.match(adapter,/connectFirebaseRuntime\(runtime\)/);
  assert.match(shared,/setPersistence\(auth/);
  assert.match(shared,/getApps\(\)/);
  assert.match(shared,/connectAuthEmulator/);
  assert.match(shared,/connectFirestoreEmulator/);
  assert.match(shared,/connectStorageEmulator/);
  assert.match(shared,/getFunctions\(app,'us-central1'\)/);
  assert.match(bootstrap,/VITE_ASTERIA_AUTH_ENABLED === 'true'/);
  assert.doesNotMatch(adapter,/initializeApp\(|connectAuthEmulator|connectFirestoreEmulator|connectStorageEmulator/);
  assert.doesNotMatch(client,/initializeApp|firebase\/app|onSnapshot|localStorage/);
  // Domain-specific readers and writers keep the existing paths and rules,
  // but cannot construct or connect their own independent Firebase app.
  const directories=['auth','campaigns','combat','dashboard','digitalGM','economy',
    'forge','friends','notifications','player','progression'];
  for(const folder of directories){
    for(const file of readdirSync(resolve(import.meta.dirname,'../frontend/src/'+folder))
      .filter(name=>/firebase.*Service\.mjs$|firebaseAuthAdapter\.mjs$/.test(name))){
      const contents=read('frontend/src/'+folder+'/'+file);
      assert.doesNotMatch(contents,/initializeApp\(|getApps\(|connect(?:Auth|Firestore|Storage|Functions)Emulator\(/,file);
      assert.doesNotMatch(contents,/window\.AsteriaFirebase|legacyBridge/,file);
    }
  }
});
