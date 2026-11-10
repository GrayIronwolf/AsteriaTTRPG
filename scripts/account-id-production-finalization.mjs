/** Read-only release preparation: never enables flags or accesses account data. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(resolve(root,path),'utf8');
const check=(name,ok)=>({name,pass:ok===true});

export function inspectAccountIdProductionFinalization(reader=read){
  const html=reader('index.html');
  const auth=reader('js/firebase-auth.js');
  const api=reader('functions/index.mjs');
  const issue=reader('functions/accountIdentityIssuance.mjs');
  const rules=reader('firestore.rules');
  const legacy=reader('functions/accountIdentityLegacy.mjs');
  const cli=reader('scripts/account-id-legacy-operator.mjs');
  const workflow=reader('.github/workflows/firebase-deploy.yml');
  const accountDeployJob=workflow.split('\n  account_id_deploy:\n')[1]?.split(/\n  [a-z_]+:\n/)[0]||'';
  const firebase=JSON.parse(reader('.firebaserc'));
  const tests=JSON.parse(reader('package.json'));
  const checks=[
    check('production-target-unchanged',firebase.projects?.production==='asteria-ttrpg'&&
      firebase.projects?.default==='demo-asteria'),
    check('browser-account-ids-disabled',html.includes('accountIds:false')),
    check('notifications-still-disabled',html.includes('campaignNotifications:false')),
    check('server-identity-gate-required',api.includes("process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'")&&
      api.includes('ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE')),
    check('production-canary-boundary-required',
      api.includes('ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE') &&
      api.includes('ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256') &&
      issue.includes('assertAccountIdCanaryEligible(authUser,email,') &&
      issue.includes("rolloutMode!=='canary'") &&
      issue.includes('authUser?.emailVerified!==true')),
    check('authenticated-creation-cutoff-required',
      issue.includes('authUser.metadata?.creationTime')&&
      issue.includes('created<cutoff.getTime()')&&
      issue.includes('now.getTime()-created>NEW_REGISTRATION_WINDOW_MS')&&
      issue.includes('expectedEmail:email')),
    check('fresh-canonical-registration-read',
      auth.includes("getDocFromServer(doc(db,'users',cred.user.uid))")&&
      auth.includes("getDocFromServer(doc(db,'users',user.uid))")),
    check('private-account-id-registry',
      rules.includes('match /accountIdRegistry/{accountIdKey} {\n      allow read, write: if false;')&&
      rules.includes('match /accountIdAssignments/{uid} {\n      allow read, write: if false;')),
    check('operator-migration-requires-uid-confirmation',
      cli.includes('BACKFILL-ACCOUNT-ID:')&&
      cli.includes('ASTERIA_LEGACY_ACCOUNT_IDS_BACKFILL_ENABLED')&&
      legacy.includes('inspectLegacyAccountIdentity')&&
      !api.includes('backfillLegacyAccountIdentity')),
    check('manual-release-workflow-only',
      workflow.startsWith('name: Deploy Firebase backend (manual)\non:\n  workflow_dispatch:')&&
      workflow.includes('          - account-id-inventory')&&
      workflow.includes('          - account-id-callable-deploy')&&
      workflow.includes("inputs.operation == 'account-id-inventory'")&&
      workflow.includes("inputs.operation == 'account-id-callable-deploy'")&&
      workflow.includes("inputs.production_confirmation == 'DEPLOY-ASTERIA-ACCOUNT-ID-CALLABLE'")&&
      workflow.includes("inputs.production_confirmation == 'DEPLOY-ASTERIA-PRODUCTION'")&&
      !/^\s{2}(push|pull_request|schedule|workflow_run):/m.test(workflow)),
    check('account-id-callable-only-deploy',
      accountDeployJob.includes('node scripts/account-id-release-package.mjs --stage-production')&&
      accountDeployJob.includes('node scripts/account-id-release-cli-verify.mjs --check')&&
      accountDeployJob.includes('working-directory: ${{ runner.temp }}/asteria-account-id-release')&&
      accountDeployJob.includes('npm ci --prefix "$RUNNER_TEMP/asteria-account-id-release/functions"')&&
      accountDeployJob.includes('firebase-tools@15.35.0')&&
      accountDeployJob.includes("ASTERIA_ACCOUNT_ID_SCOPED_DEPLOY: '1'")&&
      accountDeployJob.includes('ASTERIA_DEPLOY_PROJECT: asteria-ttrpg')&&
      accountDeployJob.includes('--only functions:asteria:asteriaAccountIdentity')&&
      accountDeployJob.includes('for fn in asteriaAccountIdentity asteriaAction asteriaInvite')&&
      !accountDeployJob.includes('--only functions,firestore,storage')&&
      !accountDeployJob.includes('backfillLegacyAccountIdentity(')),
    check('full-tests-connected',
      tests.scripts?.['test:account-id']?.includes('account-id-legacy-operator.test.mjs')&&
      tests.scripts?.['test:account-id']?.includes('account-id-production-finalization.test.mjs')&&
      Boolean(tests.scripts?.['test:firebase'])),
  ];
  const safe=checks.every(row=>row.pass);
  return {sourceChecksPassed:safe,decision:safe?'SOURCE-READY / PRODUCTION-NOT-ACTIVATED':'NO-GO',
    checks,productionDeploymentPerformed:false,
    accountIdsActivated:false,legacyAccountsMigrated:false,liveUserDataRead:false,
    operationalGatesPending:[
      'Review currently deployed Firebase Functions and Rules in a read-only inventory',
      'Review existing user Auth and Firestore records privately and reconcile mismatch cases',
      'Obtain explicit scoped approval for callable-only deploy',
      'Configure immutable server rollout cutoff and enable server flag only after approved canary',
      'Activate website accountIds flag only after server gate and canary verification',
      'Reconcile and approve each existing-account assignment independently',
      'Complete manual device testing, monitoring and abort checklist'
    ]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length!==3||process.argv[2]!=='--check'){
    process.stderr.write('Only read-only --check mode is supported.\n');
    process.exitCode=1;
  }else{
    const result=inspectAccountIdProductionFinalization();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(!result.sourceChecksPassed)process.exitCode=1;
  }
}
