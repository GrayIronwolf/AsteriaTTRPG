/**
 * Stage only Asteria-owned, explicitly reviewed Cloud Function feature gates.
 *
 * Google Cloud Functions Gen2 adds runtime metadata to the deployed function's
 * serviceConfig.environmentVariables. Its keys can change independently of
 * this repository (EVENTARC_*, FUNCTION_*, LOG_EXECUTION_ID, etc.).
 * A list of recognized Google keys is inherently incomplete and caused three
 * consecutive failed deployment attempts.
 *
 * This package does not use non-Asteria custom environment configuration:
 * the scoped function's application config is in approved ASTERIA_* gates;
 * its signing secret is separately verified in secretEnvironmentVariables.
 * Never copy runtime metadata (or other unrelated values) to staged .env.
 *
 * Unknown ASTERIA_* names and non-binary gate values MUST fail closed.
 */
export function reviewFunctionEnvironment(raw,approvedFlags){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    throw Error('Live Cloud Function environment is missing or malformed.');
  if(!Array.isArray(approvedFlags)||
     approvedFlags.some(key=>typeof key!=='string'||!key.startsWith('ASTERIA_')))
    throw Error('Invalid reviewed Asteria feature gate contract.');
  const approved=new Set(approvedFlags);
  if(approved.size!==approvedFlags.length)
    throw Error('Duplicate reviewed Asteria feature gate.');
  const result={};
  for(const [key,value] of Object.entries(raw)){
    // All non-Asteria values are platform/unowned configuration and must never
    // be copied into an Asteria-only staged environment package.
    if(!key.startsWith('ASTERIA_'))continue;
    if(!approved.has(key))
      throw Error('Unreviewed Asteria application environment variable: '+key);
    if(value!=='0'&&value!=='1')
      throw Error('Unreviewed binary feature gate: '+key);
    result[key]=value;
  }
  return result;
}
