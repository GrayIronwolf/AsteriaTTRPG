/**
 * Phase 8.1: the stable SDK dependency contract for domain services.
 * No Firebase SDK imports, app construction, persistence, or network access.
 * Every domain receives references to the same initialized services.
 */
export function createFirebaseClientAdapters({
  app,auth,db,storage,functions,authSdk,firestoreSdk,storageSdk,functionsSdk
}={}){
  if(!app||!auth||!db||!storage||!functions||
     !authSdk||!firestoreSdk||!storageSdk||!functionsSdk)
    throw TypeError('All initialized Firebase services are required.');
  const adapters=Object.freeze({
    auth:Object.freeze({instance:auth,sdk:authSdk}),
    firestore:Object.freeze({instance:db,sdk:firestoreSdk}),
    storage:Object.freeze({instance:storage,sdk:storageSdk}),
    functions:Object.freeze({instance:functions,sdk:functionsSdk})
  });
  // A single injectible SDK contract prevents features importing a second
  // Firebase client. Services still enforce ownership using their own rules.
  const dependencies=Object.freeze({
    auth:adapters.auth.instance,authSdk:adapters.auth.sdk,
    db:adapters.firestore.instance,firestoreSdk:adapters.firestore.sdk,
    storage:adapters.storage.instance,storageSdk:adapters.storage.sdk,
    functions:adapters.functions.instance,functionsSdk:adapters.functions.sdk
  });
  return Object.freeze({app,adapters,dependencies});
}
