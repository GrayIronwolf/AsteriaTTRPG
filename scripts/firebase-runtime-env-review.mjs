/**
 * Cloud Functions for Firebase reserves these runtime environment names.
 * They are injected or managed by Google and must never be staged in .env.
 * Ref: https://firebase.google.com/docs/functions/config-env#reserved_environment_variables
 * Keep this list separate from reviewed ASTERIA_* application gates.
 */
const reservedExact=new Set([
  'CLOUD_RUNTIME_CONFIG','ENTRY_POINT','GCP_PROJECT','GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT','FUNCTION_TRIGGER_TYPE','FUNCTION_NAME',
  'FUNCTION_MEMORY_MB','FUNCTION_TIMEOUT_SEC','FUNCTION_IDENTITY',
  'FUNCTION_REGION','FUNCTION_TARGET','FUNCTION_SIGNATURE_TYPE',
  'K_SERVICE','K_REVISION','PORT','K_CONFIGURATION',
  // Google-managed Eventarc metadata observed in Gen2 production.
  'EVENTARC_CLOUD_EVENT_SOURCE','EVENTARC_CLOUD_EVENT_TYPE'
]);
const reservedPrefixes=['X_GOOGLE_','EXT_','FIREBASE_'];
export function isGoogleManagedRuntimeKey(key){
  return typeof key==='string' &&
    (reservedExact.has(key)||reservedPrefixes.some(prefix=>key.startsWith(prefix)));
}
export function reviewFunctionEnvironment(raw,approvedFlags){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw Error('Live Cloud Function environment is missing or malformed.');
  const approved=new Set(approvedFlags);
  const result={};
  for(const [key,value] of Object.entries(raw)){
    if(approved.has(key)){
      if(value!=='0'&&value!=='1')
        throw Error('Unreviewed binary feature gate: '+key);
      result[key]=value;
    }else if(isGoogleManagedRuntimeKey(key)){
      if(typeof value!=='string')
        throw Error('Invalid Google-managed runtime metadata: '+key);
    }else{
      throw Error('Unexpected existing Cloud Function environment key: '+key);
    }
  }
  return result;
}
