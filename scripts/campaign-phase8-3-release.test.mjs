import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectPhase83Source,evaluatePhase83Attestation,REQUIRED_EVIDENCE}
  from './campaign-phase8-3-release.mjs';

const now=new Date('2026-11-09T01:00:00.000Z');
const sha='b'.repeat(40);
const ref='https://github.com/GrayIronwolf/AsteriaTTRPG/actions/runs/123';
function evidence(){
  return Object.fromEntries(REQUIRED_EVIDENCE.map(k=>
    [k,{result:'pass',reference:ref,verifiedAt:now.toISOString()}]));
}
function attestation(extra={}){
  return {schemaVersion:1,projectId:'asteria-ttrpg',stage:'canary',
    releaseId:'release-2026-11-09-canary',commitSha:sha,
    reviewer:{decision:'approved',reference:ref},
    evidence:evidence(),...extra};
}
test('approved code is safe by default and supplies a fail-closed source report',()=>{
  const status=inspectPhase83Source();
  assert.equal(status.projectId,'asteria-ttrpg');
  assert.equal(status.staticChecksPassed,true,JSON.stringify(status.checks));
  assert.equal(status.productionEvidenceVerified,false);
  assert.equal(status.featureFlagsActivated,false);
  assert.equal(status.productionMigrationPerformed,false);
  assert.ok(status.checks.length>=6);
});
test('source guard fails when a website feature flag becomes active',()=>{
  const state=inspectPhase83Source(path=>{
    const value=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    return path==='index.html'?
      value.replace("campaignNotifications:new URLSearchParams(window.location.search).get('campaign-inapp-canary')==='1'",'campaignNotifications:true'):value;
  });
  assert.equal(state.staticChecksPassed,false);
  assert.ok(state.checks.some(x=>x.id==='website-flags-remain-off'&&!x.pass));
});
test('source guard fails when a server switch loses its explicit off-by-default condition',()=>{
  const state=inspectPhase83Source(path=>{
    const value=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    return path==='functions/index.mjs'?
      value.replace("process.env.ASTERIA_MEMBERSHIP_CUTOVER_ENABLED!=='1'","true"):value;
  });
  assert.equal(state.staticChecksPassed,false);
  assert.ok(state.checks.some(x=>x.id==='backend-permission-gates-present'&&!x.pass));
});
test('source guard rejects automatic Firebase backend deployment configuration',()=>{
  const state=inspectPhase83Source(path=>{
    const value=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    return path==='.github/workflows/firebase-deploy.yml'?
      value+'\npush:\n  branches: [main]\n':value;
  });
  assert.equal(state.staticChecksPassed,false);
  assert.ok(state.checks.some(x=>x.id==='manual-firebase-deployment'&&!x.pass));
});
test('missing or empty attestation never qualifies as a production authorization',()=>{
  assert.equal(evaluatePhase83Attestation(null,{now,expectedSha:sha}).ready,false);
  assert.equal(evaluatePhase83Attestation({}, {now,expectedSha:sha}).ready,false);
});
test('structurally complete private evidence supports format readiness only',()=>{
  const result=evaluatePhase83Attestation(attestation(),{now,expectedSha:sha});
  assert.equal(result.ready,true);
  assert.deepEqual(result.issues,[]);
});
test('a missing, stale, failed or non-HTTPS evidence reference blocks activation',()=>{
  for(const missing of ['backup-restored-and-verified','cross-account-and-device-tested',
    'non-escalating-rollback-rehearsed','suspended-removed-banned-access-denied']){
    const doc=attestation();
    delete doc.evidence[missing];
    const result=evaluatePhase83Attestation(doc,{now,expectedSha:sha});
    assert.equal(result.ready,false,missing);
    assert.ok(result.issues.includes('unverified-'+missing));
  }
  const broken=attestation();
  broken.evidence['character-xp-inventory-integrity']={
    result:'pass',reference:'http://example.com/proof',verifiedAt:now.toISOString()
  };
  assert.equal(evaluatePhase83Attestation(broken,{now}).ready,false);
  broken.evidence['character-xp-inventory-integrity']={
    result:'pass',reference:ref,verifiedAt:'2020-01-01T00:00:00.000Z'
  };
  assert.ok(evaluatePhase83Attestation(broken,{now}).issues
    .includes('stale-character-xp-inventory-integrity'));
});
test('rejects untrusted project, different commit, absent human review and bad decision',()=>{
  const other=attestation({projectId:'demo-asteria'});
  assert.ok(evaluatePhase83Attestation(other,{now}).issues.includes('wrong-production-project'));
  const wrong=attestation();
  assert.ok(evaluatePhase83Attestation(wrong,{now,expectedSha:'c'.repeat(40)}).issues
    .includes('commit-not-verified'));
  const noReview=attestation({reviewer:{decision:'approved',reference:'https://example.com'}});
  // Operator must independently authenticate the evidence; URL formatting alone
  // can never prove ownership, a signed attestation or real test execution.
  assert.equal(evaluatePhase83Attestation(noReview,{now}).ready,false);
  const declined=attestation({reviewer:{decision:'declined',reference:ref}});
  assert.equal(evaluatePhase83Attestation(declined,{now}).ready,false);
});
test('general availability requires an observed, recent canary',()=>{
  const noCanary=attestation({stage:'general'});
  assert.ok(evaluatePhase83Attestation(noCanary,{now}).issues
    .includes('missing-observed-canary'));
  const withCanary=attestation({stage:'general'});
  withCanary.evidence['successful-canary-monitoring']={
    result:'pass',reference:ref,verifiedAt:now.toISOString()
  };
  assert.equal(evaluatePhase83Attestation(withCanary,{now}).ready,true);
});
test('public repository contains no signed approval, live activation or cloud credentials',()=>{
  const file=readFileSync(new URL('../.github/workflows/firebase-deploy.yml',import.meta.url),'utf8');
  assert.match(file,/workflow_dispatch/);
  assert.doesNotMatch(file,/ASTERIA_MEMBERSHIP_CUTOVER_ENABLED=1/);
  assert.doesNotMatch(file,/ASTERIA_EMAIL_DELIVERY_ENABLED=1/);
  assert.doesNotMatch(file,/schedule:\s*\n/);
});
