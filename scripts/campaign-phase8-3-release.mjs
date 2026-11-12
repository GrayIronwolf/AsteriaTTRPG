/**
 * Phase 8.3 production rollout preflight. Offline, read-only and fail-closed.
 * It NEVER authenticates to Firebase, writes Firestore, dispatches Actions,
 * enables any feature, sends email, or deploys rules/functions/website files.
 *
 * A structurally complete attestation still requires a human to review its
 * external evidence: this tool checks format/freshness, not authenticity.
 */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const PROJECT='asteria-ttrpg';
const SHA=/^[a-f0-9]{40}$/i;
const STAGES=new Set(['canary','general']);
const ALL_FLAGS=Object.freeze([
  'serverCampaignUCN','campaignJoinPreview','campaignJoinRequests',
  'campaignJoinReview','campaignPlayerRoster','campaignMemberControls',
  'campaignRolePermissions','campaignCharacterLinks',
  'campaignCharacterApproval','campaignCharacterLifecycle',
  'secureInvitationManager','secureInvitationAcceptance',
  'emailInvitationControls','campaignNotifications'
]);
const SERVER_GATES=Object.freeze([
  'ASTERIA_MEMBERSHIP_STAGING_ENABLED',
  'ASTERIA_MEMBERSHIP_CUTOVER_ENABLED',
  'ASTERIA_JOIN_REQUESTS_ENABLED',
  'ASTERIA_JOIN_REVIEW_ENABLED',
  'ASTERIA_MEMBER_CONTROLS_ENABLED',
  'ASTERIA_ROLE_PERMISSIONS_ENABLED',
  'ASTERIA_CHARACTER_LINK_REQUESTS_ENABLED',
  'ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED',
  'ASTERIA_CHARACTER_LIFECYCLE_ENABLED',
  'ASTERIA_SECURE_INVITATIONS_ENABLED',
  'ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
  'ASTERIA_INVITATION_MANAGER_ENABLED',
  'ASTERIA_PLAYER_ROSTER_ENABLED',
  'ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'
]);
export const REQUIRED_EVIDENCE=Object.freeze([
  'backup-restored-and-verified',
  'production-rules-and-functions-reviewed',
  'production-project-and-configuration-verified',
  'migration-per-campaign-reconciled',
  'owner-gm-player-co-gm-authenticated',
  'cross-account-and-device-tested',
  'suspended-removed-banned-access-denied',
  'character-xp-inventory-integrity',
  'invitations-and-notifications-private',
  'monitoring-alerts-and-response-owner',
  'non-escalating-rollback-rehearsed'
]);
const nowDate=v=>v instanceof Date&&Number.isFinite(v.getTime())?v:null;
const hasText=x=>typeof x==='string'&&x.trim().length>0&&x.length<=500;
const validUrl=x=>typeof x==='string'&&/^https:\/\//.test(x)&&
  x.length<1025&&!/[\r\n\s]/.test(x)&&
  !/https:\/\/(?:localhost|127\.0\.0\.1|example\.com)(?:\/|:|$)/i.test(x);
const result=(id,pass)=>({id,pass:Boolean(pass)});
const here=resolve(fileURLToPath(new URL('..',import.meta.url)));
export function repoReader(path){
  return readFileSync(resolve(here,path),'utf8');
}
/** Inspect guarded source as a necessary but NOT sufficient release condition. */
export function inspectPhase83Source(read=repoReader){
  const html=read('index.html');
  const backend=read('functions/index.mjs');
  const migration=read('functions/campaignMigrationRehearsal.mjs');
  const workflow=read('.github/workflows/firebase-deploy.yml');
  const rules=read('firestore.rules');
  const storage=read('storage.rules');
  const flags=html.match(/AsteriaFeatureFlags\s*=\s*Object\.freeze\(\{([^}]*)\}\)/);
  const values=flags?Object.fromEntries(
    [...flags[1].matchAll(/([A-Za-z0-9]+)\s*:\s*(true|false)/g)]
      .map(m=>[m[1],m[2]==='true'])
  ):{};
  // A URL-limited test flag is OFF by default and never enables general
  // availability. Treat only the canonical reviewed query expression as
  // an acceptable opt-in; arbitrary dynamic expressions still fail closed.
  const canary=JSON.parse(read('config/asteria-release.json')).inAppCanary;
  const canaryAllowed=new Set([
    'campaignJoinPreview','campaignJoinRequests','campaignJoinReview',
    'secureInvitationManager','secureInvitationAcceptance',
    'campaignNotifications','campaignFriendRecipients',
    'campaignFriendInvitations'
  ]);
  const canaryExpression="new URLSearchParams(window.location.search).get('campaign-inapp-canary')==='1'";
  const flagBody=flags?.[1]||'';
  const safeSite=ALL_FLAGS.every(key=>values[key]===false||
    (canary?.enabled===true&&canary?.mode==='test-only'&&
      canary?.migrationAllowed===false&&canary?.emailAllowed===false&&
      canaryAllowed.has(key)&&
      flagBody.includes(key+':'+canaryExpression)));
  const checks=[
    result('website-flags-remain-off',safeSite),
    result('backend-permission-gates-present',SERVER_GATES.every(x=>
      new RegExp('process\\.env\\.'+x+'\\s*!==\\s*[\\x27\\x22]1[\\x27\\x22]').test(backend)
    )),
    result('legacy-staging-not-auto-deployed',migration.includes('assertDemoMigrationTarget(db)')&&
      migration.includes("projectId!=='demo-asteria'")&&
      migration.includes("if(stage)assertDemoMigrationTarget(db)")),
    result('manual-firebase-deployment',/\bworkflow_dispatch\b/.test(workflow)&&
      /\benvironment:\s*firebase-production\b/.test(workflow)&&
      /--project asteria-ttrpg\b/.test(workflow)&&
      !/^\s*push\s*:/m.test(workflow)&&!/^\s*schedule\s*:/m.test(workflow)),
    result('v2-firestore-active-member-check',rules.includes('activeV2Member')&&
      rules.includes('membershipSchemaVersion')),
    result('v2-storage-membership-check',storage.includes('membershipSchemaVersion')&&
      storage.includes('v2Member'))
  ];
  return {projectId:PROJECT,checks,staticChecksPassed:checks.every(x=>x.pass),
    productionEvidenceVerified:false,
    featureFlagsActivated:false,
    productionMigrationPerformed:false};
}

/**
 * A signed-off evidence record is operational input and must NEVER be
 * committed to GitHub, logged with personal details, or assumed authentic
 * merely because it satisfies this schema.
 */
export function evaluatePhase83Attestation(manifest,{
  now=new Date(),expectedSha=null
}={}){
  const issues=[];
  const date=nowDate(now);
  if(!date)throw Error('Invalid audit clock');
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))
    return {ready:false,issues:['missing-private-release-attestation']};
  if(manifest.schemaVersion!==1)issues.push('unsupported-attestation-schema');
  if(manifest.projectId!==PROJECT)issues.push('wrong-production-project');
  if(!STAGES.has(manifest.stage))issues.push('invalid-rollout-stage');
  if(!SHA.test(manifest.commitSha||'')||
    (expectedSha&&manifest.commitSha!==expectedSha))
    issues.push('commit-not-verified');
  if(!hasText(manifest.releaseId))issues.push('missing-release-id');
  const reviewer=manifest.reviewer;
  if(reviewer?.decision!=='approved'||!validUrl(reviewer?.reference))
    issues.push('missing-external-approval');
  const evidence=manifest.evidence;
  for(const kind of REQUIRED_EVIDENCE){
    const att=evidence?.[kind];
    if(att?.result!=='pass'||!validUrl(att?.reference)){
      issues.push('unverified-'+kind);continue;
    }
    const verified=typeof att.verifiedAt==='string'&&att.verifiedAt?
      new Date(att.verifiedAt):new Date(NaN);
    const age=date.getTime()-verified.getTime();
    if(!Number.isFinite(age)||age<0||age>7*24*60*60*1000)
      issues.push('stale-'+kind);
  }
  if(manifest.stage==='general'){
    const canary=evidence?.['successful-canary-monitoring'];
    if(canary?.result!=='pass'||!validUrl(canary?.reference))
      issues.push('missing-observed-canary');
    else{
      const time=new Date(canary.verifiedAt||'');
      const age=date.getTime()-time.getTime();
      if(!Number.isFinite(age)||age<0||age>7*24*60*60*1000)
        issues.push('stale-observed-canary');
    }
  }
  return {ready:issues.length===0,issues};
}
function reportText(report){return JSON.stringify(report,null,2)+'\n';}
function main(){
  const args=process.argv.slice(2);
  const audit=args.includes('--audit');
  const release=args.includes('--require-ready');
  if(audit===release)throw Error('Choose exactly one of --audit or --require-ready.');
  const staticState=inspectPhase83Source();
  if(audit){
    process.stdout.write(reportText({...staticState,
      releaseDecision:'NO-GO (no independently verified production evidence)'}));
    if(!staticState.staticChecksPassed)process.exitCode=1;
    return;
  }
  const at=args.indexOf('--attestation');
  const path=at>=0?args[at+1]:null;
  if(!path){
    process.stderr.write('NO-GO: a privately reviewed --attestation file is required.\n');
    process.exitCode=1;return;
  }
  let manifest;
  try{manifest=JSON.parse(readFileSync(path,'utf8'));}
  catch{
    process.stderr.write('NO-GO: attestation unavailable or invalid JSON.\n');
    process.exitCode=1;return;
  }
  const verdict=evaluatePhase83Attestation(manifest,{
    expectedSha:process.env.GITHUB_SHA||null
  });
  const allowed=staticState.staticChecksPassed&&verdict.ready;
  process.stdout.write(reportText({decision:allowed?'EVIDENCE-FORMAT-READY':'NO-GO',
    staticChecksPassed:staticState.staticChecksPassed,
    issues:verdict.issues,
    note:'Requires separate authenticated human verification of actual evidence; does not trigger deployment.'}));
  if(!allowed)process.exitCode=1;
}
if(process.argv[1]&&
  resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main();
}
