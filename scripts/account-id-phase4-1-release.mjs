/**
 * Asteria Account IDs Phase 4.1 — offline release readiness.
 * This module is read-only; it never connects to Firebase, allocates IDs,
 * scans accounts, sends emails, sets flags, deploys or runs migrations.
 *
 * Passing static source checks is NOT permission to release. A real release
 * requires a separately verified, restricted evidence record and remediation
 * of the legacy-identity callable exposure before either flag is enabled.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const ACCOUNT_ID_PROJECT='asteria-ttrpg';
export const ACCOUNT_ID_EVIDENCE=Object.freeze([
  'verified-backup-and-restore',
  'existing-accounts-reconciled',
  'legacy-caller-boundary-reviewed',
  'production-rules-and-callable-verified',
  'registration-and-recovery-canary',
  'concurrent-uniqueness-and-collision-test',
  'cross-account-profile-isolation',
  'mobile-tablet-desktop-signin-signout',
  'account-id-display-and-copy',
  'monitoring-and-abort-owner',
  'safe-rollback-rehearsed'
]);
const SHA=/^[a-f0-9]{40}$/i;
const REF=/^https:\/\/[^\s/?#]+(?:\/[^\s]*)?$/i;
const MODES=new Set(['canary','general']);
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
export const readRepoFile=path=>readFileSync(resolve(root,path),'utf8');
const check=(name,pass)=>({name,pass:Boolean(pass)});
function strictFlagOff(source,name){
  const flags=source.match(/AsteriaFeatureFlags\s*=\s*Object\.freeze\(\{([^}]*)\}\)/);
  return Boolean(flags&&new RegExp('(?:^|,)\\s*'+name+'\\s*:\\s*false(?:,|$)').test(flags[1]));
}
/**
 * The server callable currently checks active Auth state and the flag, but
 * does not use the per-account legacy eligibility review. We flag that as a
 * documented production-release blocker, NOT a test failure for CI.
 */
export function inspectAccountIdReleaseSource(read=readRepoFile){
  const html=read('index.html');
  const api=read('functions/index.mjs');
  const binder=read('functions/accountIdentityProfile.mjs');
  const legacy=read('functions/accountIdentityLegacy.mjs');
  const rules=read('firestore.rules');
  const workflow=read('.github/workflows/firebase-deploy.yml');
  const registration=read('js/firebase-auth.js');
  const profile=read('js/asteria-account-profile.js');
  const menu=read('js/asteria-account-menu.js');
  const tests=read('package.json');
  const checks=[
    check('account-id-browser-rollout-disabled',strictFlagOff(html,'accountIds')),
    check('notifications-browser-rollout-disabled',strictFlagOff(html,'campaignNotifications')),
    check('account-id-callable-server-gated',
      api.includes("process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'")),
    check('no-uid-or-number-in-client-ensure-request',
      api.includes("Object.keys(data).length!==1||data.action!=='ensure'")&&
      registration.includes("httpsCallable(functionsClient,'asteriaAccountIdentity')")),
    check('account-id-registry-not-readable-by-clients',
      /match \/accountIdAssignments\/\{uid\} \{\s*allow read, write: if false;/.test(rules)&&
      /match \/accountIdRegistry\/\{accountIdKey\} \{\s*allow read, write: if false;/.test(rules)),
    check('immutable-profile-binder-atomic',
      binder.includes('db.runTransaction(async tx=>')&&
      binder.includes('tx.create(assignmentRef,assignment)')&&
      binder.includes('tx.create(registryRef,')&&
      binder.includes('tx.update(profileRef,')),
    check('legacy-backfill-not-publicly-exported',
      legacy.includes('inspectLegacyAccountIdentity')&&
      legacy.includes('BACKFILL-ACCOUNT-ID:')&&
      !api.includes('backfillLegacyAccountIdentity')&&
      !api.includes('accountIdentityLegacy')),
    check('new-registration-opt-in-only',
      registration.includes('accountIdRegistrationEnabled(window.AsteriaFeatureFlags)')),
    check('account-id-profile-fresh-read-only',
      registration.includes("getDocFromServer(doc(db,'users',uid))")&&
      profile.includes('readAccountProfileForDisplay')&&
      !profile.includes('ensureAccountIdentityProfile(')),
    check('account-menu-and-logout-still-present',
      html.includes('id="accountMenuProfile"')&&
      html.includes('id="accountMenuLogout"')&&
      menu.includes('window.logout?.()')),
    check('deployment-remains-manual',
      /^on:\s*\n\s*workflow_dispatch:/m.test(workflow)&&
      !/^\s{2}(push|pull_request|schedule|workflow_run):/m.test(workflow)&&
      workflow.includes("inputs.production_confirmation == 'DEPLOY-ASTERIA-PRODUCTION'")),
    check('full-automated-regression-suites-configured',
      tests.includes('test:account-id')&&
      tests.includes('test:account-menu')&&
      tests.includes('test:account-profile')&&
      tests.includes('test:firebase'))
  ];
  // Separate release gate deliberately fails while the callable can allocate
  // an ID to any authenticated legacy account after server flag activation.
  const unsafeLegacyCallableBoundary=
    api.includes("ensureAccountIdentityProfile(getFirestore(),request.auth.uid)") &&
    !api.includes('inspectLegacyAccountIdentity(');
  const blockers=[];
  if(unsafeLegacyCallableBoundary)
    blockers.push('legacy-accounts-can-invoke-assignment-if-server-flag-enabled');
  if(!checks.every(x=>x.pass))
    blockers.push('source-safety-check-failed');
  return {
    projectId:ACCOUNT_ID_PROJECT,checks,
    staticChecksPassed:checks.every(x=>x.pass),
    releaseBlockers:blockers,
    productionEvidenceVerified:false,
    productionFlagsActivated:false,
    productionDataChanged:false,
    releaseDecision:'NO-GO'
  };
}

const hasText=value=>typeof value==='string'&&
  value.length>0&&value.length<=200&&value.trim()===value;
function validReference(value){
  if(typeof value!=='string'||value.length>1024||!REF.test(value))return false;
  try{
    const u=new URL(value);
    return !['localhost','127.0.0.1','example.com','example.org'].includes(u.hostname.toLowerCase());
  }catch{return false;}
}
function freshDate(value,now){
  const parsed=typeof value==='string'?new Date(value):new Date(NaN);
  const age=now.getTime()-parsed.getTime();
  return Number.isFinite(age)&&age>=0&&age<=7*24*60*60*1000;
}
/**
 * An attestation is merely an external input. Syntax checks cannot validate
 * evidence authenticity. Do not commit real evidence or personal user data.
 */
export function inspectAccountIdReleaseEvidence(manifest,{
  now=new Date(),expectedSha=null
}={}){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error('Invalid release clock');
  const issues=[];
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))
    return {evidenceFormatValid:false,issues:['missing-private-attestation']};
  if(manifest.schemaVersion!==1)issues.push('invalid-schema');
  if(manifest.projectId!==ACCOUNT_ID_PROJECT)issues.push('wrong-project');
  if(!MODES.has(manifest.stage))issues.push('invalid-stage');
  if(!SHA.test(manifest.commitSha||'') ||
     (expectedSha && manifest.commitSha!==expectedSha))
    issues.push('unverified-commit');
  if(!hasText(manifest.releaseId))issues.push('missing-release-id');
  if(manifest.reviewer?.decision!=='approved' ||
     !validReference(manifest.reviewer?.reference))
    issues.push('missing-independent-approval');
  for(const category of ACCOUNT_ID_EVIDENCE){
    const value=manifest.evidence?.[category];
    if(value?.result!=='pass'||!validReference(value?.reference))
      issues.push('missing-'+category);
    else if(!freshDate(value.verifiedAt,now))
      issues.push('stale-'+category);
  }
  if(manifest.stage==='general'){
    const canary=manifest.evidence?.['canary-observed-and-approved'];
    if(canary?.result!=='pass'||!validReference(canary.reference)||
       !freshDate(canary.verifiedAt,now))
      issues.push('missing-observed-canary');
  }
  return {evidenceFormatValid:issues.length===0,issues};
}
function main(){
  const args=process.argv.slice(2);
  const audit=args.includes('--audit'),requireReady=args.includes('--require-ready');
  if(audit===requireReady)
    throw Error('Choose exactly one of --audit or --require-ready.');
  const source=inspectAccountIdReleaseSource();
  if(audit){
    process.stdout.write(JSON.stringify(source,null,2)+'\n');
    if(!source.staticChecksPassed)process.exitCode=1;
    return;
  }
  const i=args.indexOf('--attestation');
  let manifest=null;
  if(i>=0&&args[i+1]){
    try{manifest=JSON.parse(readFileSync(args[i+1],'utf8'));}
    catch{process.stderr.write('NO-GO: private release evidence could not be opened.\n');}
  }
  const evidence=inspectAccountIdReleaseEvidence(manifest,{
    expectedSha:process.env.GITHUB_SHA||null
  });
  const decision='NO-GO';
  // Independent review and remediation are not automated or implied by JSON.
  process.stdout.write(JSON.stringify({decision,staticChecksPassed:source.staticChecksPassed,
    blockers:source.releaseBlockers,issues:evidence.issues,
    evidenceFormatValid:evidence.evidenceFormatValid,
    note:'Requires separate, independently verified operational approval; never activates features.'},null,2)+'\n');
  process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main();
