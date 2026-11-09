import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(
  new URL('../.github/workflows/firebase-deploy.yml',import.meta.url),'utf8'
);
const authBlock=workflow.split(/^  auth_check:\s*$/m)[1]?.split(/^  backup_audit:\s*$/m)[0]||'';
const auditBlock=workflow.split(/^  backup_audit:\s*$/m)[1]?.split(/^  deploy:\s*$/m)[0]||'';
const deployBlock=workflow.split(/^  deploy:\s*$/m)[1]||'';

test('manual only: no push, schedule or pull request deploy trigger',()=>{
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_run):/m);
  assert.match(workflow,/^  cancel-in-progress: false$/m);
});
test('the default workflow action is read-only authentication',()=>{
  assert.match(workflow,/^      operation:\n(?:.*\n)*?        default: auth-check/m);
  assert.match(authBlock,/inputs\.operation == 'auth-check'/);
  assert.match(authBlock,/github\.ref == 'refs\/heads\/main'/);
  assert.match(authBlock,/environment: firebase-production/);
  assert.match(authBlock,/id-token: write/);
  assert.match(authBlock,/google-github-actions\/auth@v3/);
  assert.match(authBlock,/vars\.FIREBASE_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(authBlock,/vars\.FIREBASE_DEPLOY_SERVICE_ACCOUNT/);
  assert.match(authBlock,/test "\$AUTH_PROJECT_ID" = "asteria-ttrpg"/);
  assert.doesNotMatch(authBlock,/firebase deploy|firebase functions:|firestore.*write|gcloud .* (deploy|delete|update|create|set-iam-policy)/);
  assert.match(authBlock,/gcloud functions list/);
});
test('any production deploy requires two explicit manual inputs, main and environment',()=>{
  assert.match(deployBlock,/github\.ref == 'refs\/heads\/main'/);
  assert.match(deployBlock,/github\.event_name == 'workflow_dispatch'/);
  assert.match(deployBlock,/inputs\.operation == 'deploy'/);
  assert.match(deployBlock,/inputs\.production_confirmation == 'DEPLOY-ASTERIA-PRODUCTION'/);
  assert.match(deployBlock,/environment: firebase-production/);
  assert.match(deployBlock,/npm run audit:production/);
  assert.match(deployBlock,/npm test/);
  assert.match(deployBlock,/npm run test:firebase/);
  assert.match(deployBlock,/npx firebase deploy --project asteria-ttrpg --only functions,firestore,storage --non-interactive/);
});
test('identity check cannot modify the configured project or bypass Workload Identity',()=>{
  assert.match(authBlock,/project_id: asteria-ttrpg/);
  assert.match(authBlock,/gcloud functions list --project=asteria-ttrpg/);
  assert.doesNotMatch(workflow,/credentials_json|serviceAccount.*\.json|firebase login:ci|FIREBASE_TOKEN/);
});

test('backup-audit is a separate manual metadata-only job with main-branch and environment checks',()=>{
  assert.match(workflow,/          - backup-audit/);
  assert.match(auditBlock,/inputs\.operation == 'backup-audit'/);
  assert.match(auditBlock,/github\.ref == 'refs\/heads\/main'/);
  assert.match(auditBlock,/environment: firebase-production/);
  assert.match(auditBlock,/id-token: write/);
  assert.match(auditBlock,/google-github-actions\/auth@v3/);
  assert.match(auditBlock,/vars\.FIREBASE_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(auditBlock,/ASTERIA_AUDIT_OPERATION: backup-audit/);
  assert.match(auditBlock,/node scripts\/firebase-production-backup-audit\.mjs --live/);
  assert.doesNotMatch(auditBlock,/firebase deploy|gcloud .* (deploy|delete|update|create|set-iam-policy)|firestore export|firestore import|storage cp/);
  assert.match(workflow,/default: auth-check/);
});
