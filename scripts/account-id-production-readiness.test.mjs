import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectActivationState,renderSummary,requireAuthorizedContext,
  normalizeRules
} from './account-id-production-readiness.mjs';

const project='asteria-ttrpg';
const name='projects/'+project+'/locations/us-central1/functions/asteriaAccountIdentity';
const releaseName='projects/'+project+'/releases/cloud.firestore';
const rulesetName='projects/'+project+'/rulesets/abc123';
const rules='rules_version = \'2\';\nservice cloud.firestore { match /databases/{database}/documents {} }\n';
const f=(env={})=>({name,state:'ACTIVE',serviceConfig:{environmentVariables:env}});
const release={name:releaseName,rulesetName};
const ruleset={name:rulesetName,source:{files:[{name:'firestore.rules',content:rules}]}};
const audit=(functionData=f(),re=release,rs=ruleset,source=rules)=>
  inspectActivationState(functionData,re,rs,source);

test('active callable, disabled issuance and matching published rules are reported without values',()=>{
  const result=audit(f({ASTERIA_ACCOUNT_IDS_ENABLED:'0'}));
  assert.equal(result.functionState,'ACTIVE');
  assert.equal(result.issuance,'DISABLED');
  assert.equal(result.registrationCutoff,'NOT SET');
  assert.equal(result.verifiedEmailCanary,'NOT SET');
  assert.equal(result.firestoreRules,'EXACT SOURCE MATCH');
  assert.equal(result.decision,'ACTIVATION NOT AUTHORISED');
  assert.equal(result.accountIdWrites,'NONE');
  assert.ok(!JSON.stringify(result).includes('ASTERIA_ACCOUNT_IDS'));
});

test('missing function inventory is not assumed safe',()=>{
  const result=audit(null,null,null);
  assert.equal(result.functionState,'NOT VERIFIED ACTIVE');
  assert.equal(result.issuance,'UNVERIFIED');
  assert.equal(result.registrationCutoff,'UNVERIFIED');
  assert.equal(result.verifiedEmailCanary,'UNVERIFIED');
  assert.equal(result.firestoreRules,'UNVERIFIED');
});

test('server issuance explicitly enabled is prominently classified without value leakage',()=>{
  const result=audit(f({ASTERIA_ACCOUNT_IDS_ENABLED:'1',
    ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE:'2026-11-10T00:00:00.000Z'}));
  assert.equal(result.issuance,'ENABLED - REVIEW REQUIRED');
  assert.equal(result.registrationCutoff,'CANONICAL UTC CONFIGURED');
  assert.equal(result.decision,'ACTIVATION NOT AUTHORISED');
});

test('invalid cutoff cannot throw and fails closed',()=>{
  for(const cutoff of ['bogus','2026-99-99T00:00:00.000Z','2026-11-10','2026-11-10T00:00:00Z']){
    assert.equal(audit(f({ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE:cutoff}))
      .registrationCutoff,'INVALID - REVIEW REQUIRED');
  }
});

test('unknown gate value does not appear disabled',()=>{
  assert.equal(audit(f({ASTERIA_ACCOUNT_IDS_ENABLED:'true'})).issuance,'UNEXPECTED VALUE');
});

test('rules mismatch, incorrect release or multiple source files are not matched',()=>{
  assert.equal(audit(f(),release,{...ruleset,source:{files:[{name:'firestore.rules',content:'other'}]}})
    .firestoreRules,'DIFFERENT - REVIEW REQUIRED');
  assert.equal(audit(f(),{name:'other',rulesetName},ruleset).firestoreRules,'UNVERIFIED');
  assert.equal(audit(f(),release,{...ruleset,source:{files:[{content:rules},{content:rules}]}})
    .firestoreRules,'UNVERIFIED');
  assert.equal(audit(f(),release,{...ruleset,name:'projects/other/rulesets/one'})
    .firestoreRules,'UNVERIFIED');
});

test('normalisation changes only line endings and trailing whitespace',()=>{
  assert.equal(normalizeRules('abc \r\nxyz\r\n'),'abc\nxyz');
  assert.notEqual(normalizeRules('allow read: if false;'),normalizeRules('allow read: if true;'));
});

test('safe summary has no secrets, account IDs or raw rules source',()=>{
  const report=audit(f({ASTERIA_ACCOUNT_IDS_ENABLED:'1'}));
  const summary=renderSummary(report);
  assert.match(summary,/ACTIVATION NOT AUTHORISED/);
  assert.doesNotMatch(summary,/rules_version|ASTERIA_ACCOUNT_IDS|secret|Authorization: Bearer/);
});

test('execution is restricted to manually dispatched production workflow on main',()=>{
  const valid={
    GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'GrayIronwolf/AsteriaTTRPG',
    GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',
    ASTERIA_AUDIT_OPERATION:'account-id-activation-audit'
  };
  assert.doesNotThrow(()=>requireAuthorizedContext(valid));
  for(const key of Object.keys(valid)){
    assert.throws(()=>requireAuthorizedContext({...valid,[key]:'unexpected'}));
  }
});

test('canary configuration is classified without printing email digest',()=>{
  const digest='a'.repeat(64);
  const report=audit(f({ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE:'canary',
    ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256:digest}));
  assert.equal(report.verifiedEmailCanary,'VERIFIED-EMAIL CANARY CONFIGURED');
  assert.ok(!JSON.stringify(report).includes(digest));
  assert.equal(audit(f({ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE:'general',
    ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256:digest})).verifiedEmailCanary,
  'INVALID OR INCOMPLETE');
  assert.equal(audit(f({ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE:'canary'})).verifiedEmailCanary,
  'INVALID OR INCOMPLETE');
});

test('read-only audit distinguishes unverified one-email auto-canary without leaking digest',()=>{
  const digest='b'.repeat(64);
  const result=audit(f({ASTERIA_ACCOUNT_IDS_ENABLED:'0',
    ASTERIA_ACCOUNT_IDS_ROLLOUT_MODE:'auto-canary',
    ASTERIA_ACCOUNT_IDS_CANARY_EMAIL_SHA256:digest}));
  assert.equal(result.issuance,'DISABLED');
  assert.equal(result.verifiedEmailCanary,'UNVERIFIED-EMAIL AUTO-CANARY CONFIGURED');
  assert.equal(result.decision,'ACTIVATION NOT AUTHORISED');
  assert.ok(!JSON.stringify(result).includes(digest));
  assert.match(renderSummary(result),/UNVERIFIED-EMAIL AUTO-CANARY CONFIGURED/);
});
