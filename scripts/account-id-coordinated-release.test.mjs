import test from 'node:test';
import assert from 'node:assert/strict';
import {completeAccountIdRelease,APPROVAL} from './account-id-coordinated-release.mjs';

const status=async()=>({issuance:'DISABLED',rollout:'UNVERIFIED AUTO-CANARY',cutoff:'NOT SET'});
const inventory=async()=>({mode:'preview',decision:'READY',
  summary:{eligible:2,alreadyAssigned:1,manualReview:0}});
const migrated=async()=>({mode:'apply',decision:'COMPLETED',
  summary:{eligible:2,alreadyAssigned:1,assigned:2,manualReview:0,failed:0}});
const active=async()=>({issuance:'ENABLED',rollout:'GENERAL PUBLIC RELEASE',
  generalRelease:'APPROVED',cutoff:'CONFIGURED'});
const supplied=(opts={})=>{
  const actions=[];
  const input={
    status:async()=>{actions.push('status');return status();},
    preview:async()=>{actions.push('preview');return inventory();},
    approve:async()=>{actions.push('approval');return APPROVAL;},
    apply:async()=>{actions.push('apply');return migrated();},
    activate:async()=>{actions.push('activate');return active();},
    ...opts
  };
  return {input,actions};
};
test('one operator command completes preview, approval, migration, activation in order',async()=>{
  const {input,actions}=supplied();
  const outcome=await completeAccountIdRelease(input);
  assert.deepEqual(actions,['status','preview','approval','apply','activate']);
  assert.equal(outcome.result,'BACKEND ACTIVATED; PUBLISH WEBSITE');
  assert.equal(outcome.existing.assigned,2);
});
test('unexpected server mode is rejected before inventory or writes',async()=>{
  const {input,actions}=supplied({status:async()=>({issuance:'ENABLED',cutoff:'CONFIGURED',rollout:'general'})});
  await assert.rejects(completeAccountIdRelease(input),/Unexpected existing backend/);
  assert.deepEqual(actions,[]);
});
test('review exceptions prevent consent, migration and activation',async()=>{
  const {input,actions}=supplied({preview:async()=>({
    mode:'preview',decision:'REVIEW REQUIRED',
    summary:{eligible:2,alreadyAssigned:1,manualReview:1}
  })});
  await assert.rejects(completeAccountIdRelease(input),/reconciliation/);
  assert.deepEqual(actions,['status']);
});
test('refused confirmation performs zero writes',async()=>{
  const {input,actions}=supplied({approve:async()=> 'not approved'});
  await assert.rejects(completeAccountIdRelease(input),/approval/);
  assert.deepEqual(actions,['status','preview']);
});
test('migration error prevents backend activation',async()=>{
  let activated=false;
  const {input}=supplied({apply:async()=>{throw new Error('one record invalid');},
    activate:async()=>{activated=true;return active();}});
  await assert.rejects(completeAccountIdRelease(input),/one record invalid/);
  assert.equal(activated,false);
});
test('incomplete migration cannot enable new-account issuance',async()=>{
  let activated=false;
  const {input}=supplied({apply:async()=>({
    mode:'apply',decision:'INCOMPLETE',summary:{failed:1,manualReview:0}
  }),activate:async()=>{activated=true;return active();}});
  await assert.rejects(completeAccountIdRelease(input),/Migration incomplete/);
  assert.equal(activated,false);
});
test('incomplete server activation is never reported as completed',async()=>{
  const {input}=supplied({activate:async()=>({issuance:'DISABLED',rollout:'GENERAL PUBLIC RELEASE',
    generalRelease:'APPROVED',cutoff:'CONFIGURED'})});
  await assert.rejects(completeAccountIdRelease(input),/activation was not confirmed/);
});
