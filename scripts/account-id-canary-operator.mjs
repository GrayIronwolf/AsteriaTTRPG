/**
 * Asteria Account ID: interactive, account-owner-operated Cloud Shell tool.
 * No GitHub runner, accounts, Firestore, or unrelated function deployments.
 *
 * Commands:
 *   node scripts/account-id-canary-operator.mjs status
 *   node scripts/account-id-canary-operator.mjs stage
 *   node scripts/account-id-canary-operator.mjs stage-auto
 *   node scripts/account-id-canary-operator.mjs enable
 *   node scripts/account-id-canary-operator.mjs disable
 *   node scripts/account-id-canary-operator.mjs release-general
 *
 * No email, digest, access token, environment map or UID is printed.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';

export const NAME='projects/asteria-ttrpg/locations/us-central1/functions/asteriaAccountIdentity';
const BASE='https://cloudfunctions.googleapis.com/v2/';
const MATCH=/^[0-9a-f]{64}$/;
const MAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEYS=Object.freeze({
  enabled:'ASTERIA_ACCOUNT_IDS_ENABLED',
  mode:'ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE',
  digest:'ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256',
  cutoff:'ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE',
  general:'ASTERIA_ACCOUNT_IDS_GENERAL_RELEASE_APPROVED'
});
const abort=message=>{throw new Error(message)};

export function describeCanary(fn) {
  if(fn?.name!==NAME || fn?.state!=='ACTIVE')
    return {ready:false,state:'FUNCTION NOT VERIFIED ACTIVE'};
  const vars=fn.serviceConfig?.environmentVariables||{};
  const flag=vars[KEYS.enabled];
  const mode=vars[KEYS.mode];
  const digest=vars[KEYS.digest];
  const cutoff=vars[KEYS.cutoff];
  const safeCutoff=typeof cutoff==='string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cutoff) &&
    Number.isFinite(Date.parse(cutoff)) && new Date(cutoff).toISOString()===cutoff;
  return {
    ready:true,
    issuance:flag==='1'?'ENABLED':flag===undefined||flag==='0'?'DISABLED':'UNEXPECTED VALUE',
    singleAccount:['canary','auto-canary'].includes(mode)&&MATCH.test(digest||'')?'CONFIGURED':'NOT CONFIGURED',
    rollout:mode==='canary'?'VERIFIED-EMAIL CANARY':mode==='auto-canary'?'UNVERIFIED AUTO-CANARY':mode==='general'?'GENERAL PUBLIC RELEASE':'NOT CONFIGURED',
    generalRelease:mode==='general' && vars[KEYS.general]==='1'?'APPROVED':'NOT APPROVED',
    cutoff:safeCutoff?'CONFIGURED':!cutoff?'NOT SET':'INVALID'
  };
}

export function proposedEnvironment(fn,operation,{email,now=new Date()}={}) {
  // Cloud Functions v2 exposes updateTime, not etag. Require a stable
  // timestamp and inspect it again immediately before writing.
  if(fn?.name!==NAME || fn?.state!=='ACTIVE' ||
     typeof fn?.updateTime!=='string' ||
     !Number.isFinite(Date.parse(fn.updateTime)) ||
     !fn.serviceConfig || typeof fn.serviceConfig!=='object' ||
     Array.isArray(fn.serviceConfig) ||
     (fn.serviceConfig.environmentVariables!==undefined &&
       (typeof fn.serviceConfig.environmentVariables!=='object' ||
        fn.serviceConfig.environmentVariables===null ||
        Array.isArray(fn.serviceConfig.environmentVariables))))
    abort('Function inventory incomplete; no changes made.');
  // Google Cloud may omit an empty environmentVariables map entirely.
  const current=fn.serviceConfig.environmentVariables||{};
  const vars={...current};
  if(operation==='stage'||operation==='stage-auto'){
    if(current[KEYS.enabled]==='1')
      abort('Existing issuance is enabled; stop and review before staging.');
    if(typeof email!=='string'||!MAIL.test(email.trim()))
      abort('Valid tester email required; no changes made.');
    vars[KEYS.enabled]='0';
    vars[KEYS.mode]=operation==='stage-auto'?'auto-canary':'canary';
    vars[KEYS.digest]=createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
    delete vars[KEYS.general];
    delete vars[KEYS.cutoff];
  }else if(operation==='release-general'){
    // One production configuration update after code, CI and migration review.
    // Existing Auth accounts remain excluded by the fresh server-side cutoff.
    if(current[KEYS.enabled]==='1')
      abort('Issuance is already enabled; review status instead of re-releasing.');
    if(!(now instanceof Date)||!Number.isFinite(now.valueOf()))
      abort('Invalid UTC clock.');
    vars[KEYS.enabled]='1';
    vars[KEYS.mode]='general';
    vars[KEYS.general]='1';
    vars[KEYS.cutoff]=now.toISOString();
    delete vars[KEYS.digest];
  }else if(operation==='enable'){
    if(current[KEYS.enabled]!=='0' ||
       !['canary','auto-canary'].includes(current[KEYS.mode]) ||
       !MATCH.test(current[KEYS.digest]||'') ||
       current[KEYS.cutoff])
      abort('Canary was not safely staged or is already active. No changes made.');
    if(!(now instanceof Date)||!Number.isFinite(now.valueOf()))
      abort('Invalid UTC clock.');
    vars[KEYS.cutoff]=now.toISOString();
    vars[KEYS.enabled]='1';
  }else if(operation==='disable'){
    vars[KEYS.enabled]='0';
  }else abort('Unsupported operation');
  return {name:NAME,serviceConfig:{environmentVariables:vars}};
}

/**
 * Cloud Functions v2 Function has no etag. Compare the server's updateTime
 * and current runtime variables again before PATCH; abort if either changes.
 * This is a best-effort race guard, not an atomic revision precondition.
 */
export function assertInventoryUnchanged(before,after) {
  if(before?.name!==NAME || after?.name!==NAME ||
     before?.state!=='ACTIVE' || after?.state!=='ACTIVE' ||
     !before.updateTime || before.updateTime!==after.updateTime ||
     !before.serviceConfig || !after.serviceConfig ||
     !isDeepStrictEqual(
       before.serviceConfig.environmentVariables||{},
       after.serviceConfig.environmentVariables||{}
     ))
    abort('Function changed during confirmation; no changes made. Run status and review.');
}

function authToken() {
  return execFileSync('gcloud',['auth','print-access-token'],{
    encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000
  }).trim();
}
function fetchJSON(url,token,opts={}) {
  return fetch(url,{
    ...opts,headers:{Authorization:'Bearer '+token,
      'Content-Type':'application/json'},
    signal:AbortSignal.timeout(30000)
  }).then(async response=>{
    if(!response.ok)abort('Google Cloud operation unavailable (HTTP '+response.status+').');
    return response.json();
  });
}
async function getFunction(token) {
  const fn=await fetchJSON(BASE+NAME,token);
  if(fn.name!==NAME)abort('Unexpected Cloud Function identity.');
  return fn;
}
async function awaitOperation(operation,token) {
  if(!/^projects\/asteria-ttrpg\/locations\/us-central1\/operations\/[A-Za-z0-9_-]+$/.test(operation?.name||''))
    abort('Unexpected Cloud operation response. Check read-only status.');
  for(let attempt=0;attempt<100;attempt++){
    const op=await fetchJSON(BASE+operation.name,token);
    if(op.done){
      if(op.error)abort('Cloud Function update did not complete. Review Cloud operations.');
      return;
    }
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  abort('Cloud operation has not completed; check read-only status before retrying.');
}

export async function run({action,token,ask=async()=>'',api={get:getFunction,
  update:async(fn,body,token)=>{
    const result=await fetchJSON(BASE+NAME+
      '?updateMask=serviceConfig.environmentVariables',token,{
      method:'PATCH',body:JSON.stringify(body)
    });
    await awaitOperation(result,token);
  }
}}){
  const current=await api.get(token);
  if(action==='status'){
    const state=describeCanary(current);
    if(!state.ready)abort(state.state);
    return state;
  }
  let input;
  if(action==='stage'||action==='stage-auto'){
    input=(await ask('Enter the approved test email (not printed): ')).trim();
  }else if(action==='release-general'){
    const reply=await ask('Release automatic Account IDs to ALL new registrations? Type RELEASE-GENERAL: ');
    if(reply!=='RELEASE-GENERAL')abort('No changes made. Explicit approval required.');
  }else if(action==='enable'){
    const reply=await ask('Enable Account ID issuance for ONE approved new test registration now? Type ENABLE: ');
    if(reply!=='ENABLE')abort('No changes made. Explicit approval required.');
  }else if(action==='disable'){
    const reply=await ask('Disable all new Account ID issuance now? Type DISABLE: ');
    if(reply!=='DISABLE')abort('No changes made. Explicit approval required.');
  }else abort('Allowed actions: status, stage, stage-auto, enable, disable');
  const proposed=proposedEnvironment(current,action,{email:input});
  const fresh=await api.get(token);
  assertInventoryUnchanged(current,fresh);
  await api.update(fresh,proposed,token);
  const final=await api.get(token);
  const state=describeCanary(final);
  if(['stage','stage-auto'].includes(action) && (state.issuance!=='DISABLED'||state.singleAccount!=='CONFIGURED'||state.cutoff!=='NOT SET'))
    abort('Post-update staging verification failed.');
  if(action==='release-general' && (state.issuance!=='ENABLED'||state.rollout!=='GENERAL PUBLIC RELEASE'||
      state.generalRelease!=='APPROVED'||state.cutoff!=='CONFIGURED'||state.singleAccount!=='NOT CONFIGURED'))
    abort('General release verification failed. Disable issuance and review.');
  if(action==='enable' && (state.issuance!=='ENABLED'||state.singleAccount!=='CONFIGURED'||state.cutoff!=='CONFIGURED'))
    abort('Post-update activation verification failed. Run disable if uncertain.');
  if(action==='disable' && state.issuance!=='DISABLED')
    abort('Post-update disabling verification failed.');
  return state;
}

const invoked=process.argv[1]?.endsWith('/account-id-canary-operator.mjs');
if(invoked){
  const action=process.argv[2];
  if(!['status','stage','stage-auto','enable','disable','release-general'].includes(action)||process.argv.length!==3){
    process.stderr.write('Usage: node account-id-canary-operator.mjs status|stage|stage-auto|enable|disable|release-general\n');
    process.exitCode=2;
  }else{
    (async()=>{
      // Cloud Shell is operator-controlled; never request a password in this tool.
      const rl=createInterface({input:stdin,output:stdout});
      try {
        const state=await run({action,token:authToken(),
          ask:prompt=>rl.question(prompt)});
        stdout.write(
          'Account ID callable: ACTIVE\n'+
          'New issuance: '+state.issuance+'\n'+
          'Single-email canary: '+state.singleAccount+'\n'+
          'Rollout: '+state.rollout+'\n'+
          'Registration cutoff: '+state.cutoff+'\n'+
          'General release approval: '+state.generalRelease+'\n'
        );
      }finally{rl.close();}
    })().catch(error=>{
      process.stderr.write('Account ID operator: '+error.message+'\n');
      process.exitCode=1;
    });
  }
}
