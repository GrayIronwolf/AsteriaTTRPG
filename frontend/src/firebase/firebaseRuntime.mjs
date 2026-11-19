/**
 * Phase 8.1 — the sole Firebase SDK/bootstrap owner in the React/Vite app.
 * Auth, Firestore, Functions and Storage share ONE default app and selected
 * project. No domain service may initialize Firebase or connect emulators.
 *
 * The preview imports this module without importing Firebase SDK chunks:
 * SDKs are loaded only after the explicit AuthBootstrap opt-in.
 */
import {
  PRODUCTION_FIREBASE_CONFIG,EMULATOR_FIREBASE_CONFIG
} from '../auth/authPolicy.mjs';
import {createFirebaseClientAdapters} from './firebaseClientAdapters.mjs';

const CONFIG_KEYS=Object.freeze(['apiKey','authDomain','projectId','storageBucket','appId']);
const expectedConfiguration=mode=>
  mode==='production'?PRODUCTION_FIREBASE_CONFIG:EMULATOR_FIREBASE_CONFIG;

export function validateFirebaseRuntime(runtime){
  if(!runtime||runtime.enabled!==true)
    throw Error('React Firebase is disabled. An explicit runtime is required.');
  if(runtime.mode!=='production'&&runtime.mode!=='emulator')
    throw Error('Choose a production or emulator Firebase runtime explicitly.');
  const expected=expectedConfiguration(runtime.mode);
  if(runtime.projectId!==expected.projectId||
    !runtime.config||CONFIG_KEYS.some(key=>runtime.config[key]!==expected[key]))
    throw Error('Firebase runtime configuration does not match the selected Asteria project.');
  return Object.freeze({mode:runtime.mode,projectId:expected.projectId,config:expected});
}

export function assertFirebaseApp(app,config){
  if(!app||!app.options||CONFIG_KEYS.some(key=>app.options[key]!==config[key])||
     (app.name!==undefined&&app.name!=='[DEFAULT]'))
    throw Error('An existing Firebase app has incompatible Asteria configuration.');
  return app;
}

async function loadProductionSdk(){
  const [appSdk,authSdk,firestoreSdk,functionsSdk,storageSdk]=await Promise.all([
    import('firebase/app'),import('firebase/auth'),import('firebase/firestore'),
    import('firebase/functions'),import('firebase/storage')
  ]);
  return {appSdk,authSdk,firestoreSdk,functionsSdk,storageSdk};
}

async function openRuntime(definition,loadSdk){
  const {appSdk,authSdk,firestoreSdk,functionsSdk,storageSdk}=await loadSdk();
  if([appSdk,authSdk,firestoreSdk,functionsSdk,storageSdk].some(x=>!x))
    throw Error('The complete Asteria Firebase SDK set is required.');
  const existing=appSdk.getApps();
  // The React root never owns a second/named Firebase client.
  if(!Array.isArray(existing)||existing.length>1)
    throw Error('Another Firebase application is already initialized.');
  const created=existing.length===0;
  const app=assertFirebaseApp(
    created?appSdk.initializeApp(definition.config):appSdk.getApp(),
    definition.config
  );
  try{
    const auth=authSdk.getAuth(app);
    const db=firestoreSdk.getFirestore(app);
    const functions=functionsSdk.getFunctions(app,'us-central1');
    const storage=storageSdk.getStorage(app);
    if(definition.mode==='emulator'){
      authSdk.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
      firestoreSdk.connectFirestoreEmulator(db,'127.0.0.1',8080);
      functionsSdk.connectFunctionsEmulator(functions,'127.0.0.1',5001);
      storageSdk.connectStorageEmulator(storage,'127.0.0.1',9199);
    }
    await authSdk.setPersistence(auth,typeof window==='undefined'?
      authSdk.inMemoryPersistence:authSdk.browserLocalPersistence);
    const clients=createFirebaseClientAdapters({
      app,auth,db,functions,storage,authSdk,firestoreSdk,functionsSdk,storageSdk
    });
    return Object.freeze({
      mode:definition.mode,projectId:definition.projectId,app,
      adapters:clients.adapters,...clients.dependencies
    });
  }catch(error){
    // A failed initial connection must not strand an incompatible app for the
    // next attempt. Never delete a default app owned by another initializer.
    if(created&&typeof appSdk.deleteApp==='function')
      await appSdk.deleteApp(app).catch(()=>{});
    throw error;
  }
}

/** Creates an isolated owner for deterministic unit tests, not another app.
 * Production code exports only the single module-level owner below.
 */
export function createFirebaseRuntimeOwner({loadSdk=loadProductionSdk}={}){
  if(typeof loadSdk!=='function')throw TypeError('Firebase SDK loader is required.');
  let state=null;
  return Object.freeze({
    connect(runtime){
      const selected=validateFirebaseRuntime(runtime);
      const key=selected.mode+':'+selected.projectId;
      if(state){
        if(state.key!==key)
          throw Error('Firebase project or runtime mode changed without a full page reload.');
        return state.promise;
      }
      const promise=openRuntime(selected,loadSdk);
      state={key,promise};
      promise.catch(()=>{if(state?.promise===promise)state=null;});
      return promise;
    }
  });
}

const firebaseRuntimeOwner=createFirebaseRuntimeOwner();
export const connectFirebaseRuntime=runtime=>firebaseRuntimeOwner.connect(runtime);
