import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/firebase-deploy.yml', import.meta.url), 'utf8');
const section = name => workflow.split(new RegExp('^  '+name+':\\s*$', 'm'))[1]?.split(/^  [a-z_]+:\s*$/m)[0] || '';
const audit = section('campaign_backend_inventory');
const deploy = section('campaign_backend_deploy');

test('production campaign inventory is explicit, read-only and scoped to main', () => {
  assert.match(workflow, /- campaign-backend-inventory/);
  assert.match(audit, /inputs\.operation == 'campaign-backend-inventory'/);
  assert.match(audit, /github\.ref == 'refs\/heads\/main'/);
  assert.match(audit, /environment: firebase-production/);
  assert.match(audit, /gcloud functions list --project=asteria-ttrpg --regions=us-central1 --v2/);
  assert.doesNotMatch(audit, /firebase deploy|gcloud.*\b(create|update|delete|deploy)\b|firestore import|firestore export/);
});

test('staged campaign backend deploy is manually approved and limited to five new callables', () => {
  assert.match(workflow, /- campaign-backend-deploy/);
  assert.match(deploy, /inputs\.operation == 'campaign-backend-deploy'/);
  assert.match(deploy, /production_confirmation == 'DEPLOY-ASTERIA-CAMPAIGN-BACKEND'/);
  assert.match(deploy, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /environment: firebase-production/);
  assert.match(deploy, /npm run audit:production/);
  assert.match(deploy, /npm run test:rollout/);
  assert.match(deploy, /npm test/);
  assert.match(deploy, /npm run test:firebase/);
  const scope=deploy.match(/--only "([^"]+)"/)?.[1];
  assert.equal(scope, [
    'functions:asteria:asteriaCampaignUCN',
    'functions:asteria:asteriaMembershipPreparation',
    'functions:asteria:asteriaCampaignAccessCutover',
    'functions:asteria:asteriaCampaignJoinRequest',
    'functions:asteria:asteriaCampaignJoinReview'
  ].join(','));
  assert.doesNotMatch(scope, /firestore|storage|asteriaAction|asteriaInvite|Email|Notifications|SecureInvitation/);
  assert.doesNotMatch(deploy, /--only functions,firestore,storage/);
});

test('existing production deploy and default authentication remain unchanged', () => {
  assert.match(workflow, /default: auth-check/);
  assert.match(workflow, /inputs\.operation == 'deploy'/);
  assert.match(workflow, /production_confirmation == 'DEPLOY-ASTERIA-PRODUCTION'/);
  assert.match(workflow, /--only functions,firestore,storage --non-interactive/);
});
