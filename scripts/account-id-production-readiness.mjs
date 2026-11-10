/**
 * Read-only Account ID production activation inventory.
 *
 * Lists the deployed function's state and safe boolean configuration, then
 * compares the currently published Firestore rules with the reviewed repo file.
 * Never prints environment values, access tokens, rules text, user records
 * or service account details. Never writes to Firebase or Google Cloud.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROJECT='asteria-ttrpg';
export const REGION='us-central1';
const FUNCTION='asteriaAccountIdentity';
const RELEASE='projects/asteria-ttrpg/releases/cloud.firestore';
const RULESET=/^projects\/asteria-ttrpg\/rulesets\/[A-Za-z0-9_-]+$/;
const CUTOFF=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));

export function normalizeRules(value) {
  return typeof value==='string' ?
    value.replace(/\r\n/g,'\n').replace(/[ \t]+$/gm,'').trim() : null;
}

/** Classification contains no secret values or account identifiers. */
export function inspectActivationState(func,release,ruleset,localRules) {
  const exactName='projects/'+PROJECT+'/locations/'+REGION+'/functions/'+FUNCTION;
  const functionState=func?.name===exactName && func?.state==='ACTIVE' ?
    'ACTIVE' : 'NOT VERIFIED ACTIVE';
  const env=func?.serviceConfig?.environmentVariables;
  const flag=env && Object.prototype.hasOwnProperty.call(env,'ASTERIA_ACCOUNT_IDS_ENABLED') ?
    env.ASTERIA_ACCOUNT_IDS_ENABLED : undefined;
  const issuance=func===null ? 'UNVERIFIED' :
    flag==='1' ? 'ENABLED - REVIEW REQUIRED' :
    flag===undefined || flag==='' || flag==='0' ? 'DISABLED' : 'UNEXPECTED VALUE';
  const cutoff=env?.ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE;
  const cutoffState=func===null ? 'UNVERIFIED' :
    cutoff===undefined || cutoff==='' ? 'NOT SET' :
    typeof cutoff==='string' && CUTOFF.test(cutoff) &&
      Number.isFinite(Date.parse(cutoff)) && new Date(cutoff).toISOString()===cutoff ?
      'CANONICAL UTC CONFIGURED' : 'INVALID - REVIEW REQUIRED';
  const remoteFiles=release?.name===RELEASE && RULESET.test(release.rulesetName||'') &&
    ruleset?.name===release.rulesetName && Array.isArray(ruleset?.source?.files) ?
    ruleset.source.files : null;
  // A multi-file release is not treated as verified from a single local file.
  const remote=remoteFiles?.length===1 ? remoteFiles[0]?.content : null;
  const sourceStatus=remote===null || typeof remote!=='string' ||
    typeof localRules!=='string' ? 'UNVERIFIED' :
    normalizeRules(remote)===normalizeRules(localRules) ?
      'EXACT SOURCE MATCH' : 'DIFFERENT - REVIEW REQUIRED';
  return Object.freeze({
    project:PROJECT,region:REGION,functionState,
    issuance,registrationCutoff:cutoffState,firestoreRules:sourceStatus,
    existingAccountReconciliation:'NOT PERFORMED',
    accountIdWrites:'NONE',
    decision:'ACTIVATION NOT AUTHORISED'
  });
}

export function renderSummary(report) {
  return [
    '## Asteria Account ID - read-only production activation inventory',
    '',
    '| Check | Result |',
    '| --- | --- |',
    '| Firebase project | '+report.project+' |',
    '| Function region | '+report.region+' |',
    '| Account ID callable | '+report.functionState+' |',
    '| Server-side new Account ID issuance | '+report.issuance+' |',
    '| Auth registration creation-time cutoff | '+report.registrationCutoff+' |',
    '| Published Firestore rules vs reviewed repo source | '+report.firestoreRules+' |',
    '| Existing user Auth/Firestore reconciliation | '+report.existingAccountReconciliation+' |',
    '| User records changed | '+report.accountIdWrites+' |',
    '',
    '**Decision: '+report.decision+'.**',
    '',
    'This is not a canary, account migration, restore test or production activation.',
    'No access tokens, function environment values, live rules content or user data were logged.',
    'Do not enable registration or backfill existing accounts based on this inventory alone.',
    ''
  ].join('\n');
}

function requireAuthorizedContext(env=process.env) {
  if(env.GITHUB_ACTIONS!=='true' ||
     env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG' ||
     env.GITHUB_REF!=='refs/heads/main' ||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch' ||
     env.ASTERIA_AUDIT_OPERATION!=='account-id-activation-audit')
    throw new Error('Read-only audit must run from the authorised production GitHub workflow.');
}
export {requireAuthorizedContext};

function gcloud(args) {
  return execFileSync('gcloud',args,{
    encoding:'utf8',maxBuffer:5*1024*1024,timeout:60000,
    stdio:['ignore','pipe','pipe']
  });
}
async function getJSON(path,token) {
  const response=await fetch('https://firebaserules.googleapis.com/v1/'+path,{
    method:'GET',headers:{Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw new Error('Read-only Firebase Rules API unavailable.');
  return response.json();
}
export async function auditLive() {
  requireAuthorizedContext();
  let func=null,release=null,ruleset=null;
  try {
    func=JSON.parse(gcloud(['functions','describe',FUNCTION,
      '--project='+PROJECT,'--region='+REGION,'--gen2','--format=json']));
  }catch {
    // Never include raw gcloud error output or environment variables in logs.
    process.stderr.write('Cloud Function read-only inventory unavailable.\n');
  }
  try {
    const token=gcloud(['auth','print-access-token']).trim();
    if(!token)throw new Error('Missing credentials');
    release=await getJSON(RELEASE,token);
    if(!RULESET.test(release?.rulesetName||''))
      throw new Error('Unexpected release identifier');
    ruleset=await getJSON(release.rulesetName,token);
  }catch {
    // Report incomplete evidence without dumping token, rules or API responses.
    release=null;ruleset=null;
    process.stderr.write('Published Firestore rules comparison unavailable.\n');
  }
  const expected=readFileSync(resolve(ROOT,'firestore.rules'),'utf8');
  const result=inspectActivationState(func,release,ruleset,expected);
  const summary=renderSummary(result);
  process.stdout.write(summary+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
  // No readiness status from this report can authorise an activation.
  return result;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3 || process.argv[2]!=='--live'){
    process.stderr.write('Only the authorised read-only --live operation is supported.\n');
    process.exitCode=2;
  }else{
    auditLive().catch(()=>{
      process.stderr.write('Account ID production inventory was not completed.\n');
      process.exitCode=2;
    });
  }
}
