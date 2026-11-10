import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isApprovedImpersonatedCredential} from './account-id-cloud-shell-credentials.mjs';
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

test('Cloud Shell launcher uses keyless service-account ADC and no IAM mutations',()=>{
  const sh=readFileSync(new URL('./account-id-cloud-shell-release.sh',import.meta.url),'utf8');
  assert.match(sh,/gcloud auth print-access-token --impersonate-service-account/);
  assert.match(sh,/gcloud auth application-default login --impersonate-service-account/);
  assert.match(sh,/node scripts\/account-id-coordinated-release\.mjs --project/);
  assert.doesNotMatch(sh,/gcloud iam service-accounts (?:keys create|add-iam-policy-binding)/);
  assert.doesNotMatch(sh,/gcloud projects add-iam-policy-binding/);
  assert.doesNotMatch(sh,/--key-file|service-account-key\.json/);
});

test('Cloud Shell reads effective ADC config location rather than assuming home directory',()=>{
  const sh=readFileSync(new URL('./account-id-cloud-shell-release.sh',import.meta.url),'utf8');
  assert.match(sh,/gcloud info --format='value\(config\.paths\.global_config_dir\)'/);
  assert.match(sh,/adc_path="\$config_dir\/application_default_credentials\.json"/);
  assert.match(sh,/GOOGLE_APPLICATION_CREDENTIALS="\$adc_path"/);
  assert.doesNotMatch(sh,/env -u GOOGLE_APPLICATION_CREDENTIALS/);
  assert.doesNotMatch(sh,/HOME.*application_default_credentials/);
});
test('saved impersonated credentials must match expected Firebase Admin service account',()=>{
  const dir=mkdtempSync(join(tmpdir(),'asteria-adc-check-'));
  try{
    const account='firebase-adminsdk-test@asteria-ttrpg.iam.gserviceaccount.com';
    const file=join(dir,'application_default_credentials.json');
    const good={
      type:'impersonated_service_account',
      service_account_impersonation_url:'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/'+account+':generateAccessToken'
    };
    writeFileSync(file,JSON.stringify(good));
    assert.equal(isApprovedImpersonatedCredential(file,account),true);
    assert.equal(isApprovedImpersonatedCredential(file,'firebase-adminsdk-other@asteria-ttrpg.iam.gserviceaccount.com'),false);
    writeFileSync(file,JSON.stringify({...good,type:'authorized_user'}));
    assert.equal(isApprovedImpersonatedCredential(file,account),false);
    writeFileSync(file,JSON.stringify({...good,service_account_impersonation_url:'https://wrong.example/v1/projects/-/serviceAccounts/'+account+':generateAccessToken'}));
    assert.equal(isApprovedImpersonatedCredential(file,account),false);
    assert.equal(isApprovedImpersonatedCredential(join(dir,'missing'),account),false);
  } finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
