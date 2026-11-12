import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  FLAG_OWNERS,inspectCoordinatedSource,evaluateProductionSnapshot,
  renderReleaseReport
} from './campaign-coordinated-readiness.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const copied=o=>JSON.parse(JSON.stringify(o));
const expected=inspectCoordinatedSource().manifest.backend.deployedFunctions;
function snapshot(){
 const names=[...expected,'asteriaCampaignNotifications'];
 const functions=names.map(name=>({name:'projects/asteria-ttrpg/locations/us-central1/functions/'+name,state:'ACTIVE'}));
 const descriptions=Object.fromEntries(names.map(name=>[
   name,{
     name:'projects/asteria-ttrpg/locations/us-central1/functions/'+name,state:'ACTIVE',
     serviceConfig:{environmentVariables:Object.fromEntries(
       (FLAG_OWNERS[name]||[]).map(key=>[key,key==='ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED'?'0':'1'])
     )}
   }
 ]));
 return {
   project:'asteria-ttrpg',region:'us-central1',
   functions,descriptions,signingSecret:{enabled:true},
   rules:{
     firestore:{source:{files:[{content:read('firestore.rules')}]}},
     storage:{source:{files:[{content:read('storage.rules')}]}}
   },
   backup:{metadataReadable:true}
 };
}
test('canonical source and all backend authorization gates are present',()=>{
 const {manifest,phase83}=inspectCoordinatedSource();
 assert.equal(manifest.project,'asteria-ttrpg');
 assert.equal(manifest.status,'installed-not-activated');
 assert.equal(manifest.backend.deployedFunctions.length,7);
 assert.equal(phase83.staticChecksPassed,true);
 assert.ok(Object.keys(FLAG_OWNERS).length>=7);
});
test('a complete synthetic inventory still cannot claim release authorization',()=>{
 const report=evaluateProductionSnapshot(snapshot());
 assert.equal(report.installedFunctions,7);
 assert.equal(report.expectedFunctions,7);
 assert.deepEqual(Object.values(report.rules),[
   'matches-checked-in-source','matches-checked-in-source'
 ]);
 assert.equal(report.signingSecretEnabledVersionVisible,true);
 assert.equal(report.runtimeFlags.ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED,'off');
 assert.equal(report.releaseDecision,'NO-GO');
 assert.ok(report.blockers.some(s=>s.includes('restore')));
 assert.ok(report.blockers.some(s=>s.includes('GM/player/outsider')));
 assert.ok(report.blockers.some(s=>s.includes('human GO')));
});
test('in-app delivery is not reported enabled when only one callable has its gate on',()=>{
  const data=snapshot();
  const secure=data.descriptions.asteriaSecureInvitation.serviceConfig.environmentVariables;
  const inbox=data.descriptions.asteriaCampaignNotifications.serviceConfig.environmentVariables;
  const recipients=data.descriptions.asteriaCampaignFriendRecipients.serviceConfig.environmentVariables;
  secure.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED='0';
  secure.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED='0';
  assert.equal(inbox.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED,'1');
  assert.equal(recipients.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED,'1');
  const report=evaluateProductionSnapshot(data);
  assert.equal(report.invitationDelivery.notificationInbox,'on');
  assert.equal(report.invitationDelivery.notificationGateOnSecureInvitation,'off');
  assert.equal(report.invitationDelivery.recipientLookup,'on');
  assert.equal(report.invitationDelivery.recipientGateOnSecureInvitation,'off');
  assert.equal(report.runtimeFlags.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED,'off');
  assert.equal(report.runtimeFlags.ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED,'off');
  assert.ok(report.blockers.some(x=>x.includes('ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED')));
  assert.ok(report.blockers.some(x=>x.includes('ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED')));
  const summary=renderReleaseReport(report);
  assert.match(summary,/Secure invitation notification gate: off/);
  assert.match(summary,/Campaign notifications inbox callable: on/);
  assert.equal(report.releaseDecision,'NO-GO');
});

test('an absent notification callable never counts as ready despite secure invitation gate',()=>{
  const data=snapshot();
  data.functions=data.functions.filter(x=>!x.name.endsWith('/asteriaCampaignNotifications'));
  delete data.descriptions.asteriaCampaignNotifications;
  const report=evaluateProductionSnapshot(data);
  assert.equal(report.invitationDelivery.notificationInbox,'unknown');
  assert.equal(report.runtimeFlags.ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED,'unknown');
  assert.ok(report.blockers.some(x=>x.includes('ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED')));
  assert.equal(report.releaseDecision,'NO-GO');
});

test('missing, duplicate, inactive or unverified Cloud Functions are never accepted',()=>{
 const baseline=snapshot();
 for(const mutate of [
   s=>s.functions.shift(),
   s=>s.functions.push({...s.functions[0]}),
   s=>{s.functions[0].state='FAILED';},
   s=>{delete s.descriptions.asteriaSecureInvitation;}
 ]){
   const data=copied(baseline);mutate(data);
   const report=evaluateProductionSnapshot(data);
   assert.ok(report.installedFunctions<7);
   assert.equal(report.releaseDecision,'NO-GO');
 }
});
test('unknown flags and disabled critical flags block release independently',()=>{
 const data=snapshot();
 data.descriptions.asteriaSecureInvitation.serviceConfig.environmentVariables.ASTERIA_SECURE_INVITATIONS_ENABLED='UNKNOWN';
 data.descriptions.asteriaCampaignJoinReview.serviceConfig.environmentVariables.ASTERIA_JOIN_REVIEW_ENABLED='0';
 const report=evaluateProductionSnapshot(data);
 assert.equal(report.runtimeFlags.ASTERIA_SECURE_INVITATIONS_ENABLED,'unknown');
 assert.equal(report.runtimeFlags.ASTERIA_JOIN_REVIEW_ENABLED,'off');
 assert.ok(report.blockers.some(s=>s.includes('AST.ERIA_')===false&&s.includes('ASTERIA_JOIN_REVIEW_ENABLED')));
 assert.ok(report.blockers.some(s=>s.includes('ASTERIA_SECURE_INVITATIONS_ENABLED')));
});
test('formatting-only changes in production rules are distinguished from permission drift',()=>{
  const data=snapshot();
  const source=read('storage.rules');
  data.rules.storage.source.files[0].content='\n\n'+source
    .replace('service firebase.storage {','service  firebase.storage\n{')
    .replace('    // Private account profile photo; only the authenticated owner can read,\n    // create, replace or remove this fixed-path 512px cropped WEBP.\n','');
  const result=evaluateProductionSnapshot(data);
  assert.equal(result.rules.storage,'matches-source-ignoring-formatting-and-comments');
  assert.equal(result.rules.firestore,'matches-checked-in-source');
  assert.equal(result.blockers.some(x=>x.includes('storage Rules do not have')),false);
  assert.equal(result.releaseDecision,'NO-GO');
  for(const change of [
    source.replace('request.auth.uid == uid','request.auth.uid != uid'),
    source.replace("member.get('status', '') == 'active'","member.get('status', '') == 'banned'"),
    source.replace('request.resource.size <= 2 * 1024 * 1024','request.resource.size <= 20 * 1024 * 1024'),
    source.replace('allow read, delete: if request.auth != null','allow read, delete: if true')
  ]){
    const changed=snapshot();
    changed.rules.storage.source.files[0].content=change;
    assert.equal(evaluateProductionSnapshot(changed).rules.storage,'DIFFERENT FROM SOURCE');
    assert.ok(evaluateProductionSnapshot(changed).blockers.some(x=>x.includes('storage Rules do not have')));
  }
});

test('rules mismatch, unreadable backups and unknown signing secret remain NO-GO',()=>{
 const data=snapshot();
 data.rules.storage.source.files[0].content='rules_version = "2";';
 data.rules.firestore=null;
 data.backup.metadataReadable=false;
 data.signingSecret.enabled=false;
 const report=evaluateProductionSnapshot(data);
 assert.equal(report.rules.storage,'DIFFERENT FROM SOURCE');
 assert.equal(report.rules.firestore,'NOT VERIFIED');
 assert.equal(report.signingSecretEnabledVersionVisible,false);
 assert.equal(report.backupMetadataReadable,false);
 assert.ok(report.blockers.some(s=>s.includes('signing-secret')));
 assert.ok(report.blockers.some(s=>s.includes('Backup inventory')));
});
test('wrong project and missing inventory refuse to inspect unknown production',()=>{
 assert.throws(()=>evaluateProductionSnapshot({...snapshot(),project:'demo-asteria'}),/project/);
 assert.throws(()=>evaluateProductionSnapshot({...snapshot(),functions:null}),/list/);
});
test('summary contains no account identifiers, secrets, rule content or raw cloud JSON',()=>{
 const data=snapshot();
 data.descriptions.asteriaSecureInvitation.serviceConfig.environmentVariables['DONT_SHOW_PRIVATE_TOKEN']='PRIVATE-SECRET-VALUE';
 const report=evaluateProductionSnapshot(data);
 const output=renderReleaseReport(report);
 assert.match(output,/Final decision: NO-GO/);
 assert.match(output,/Enabled version visible/);
 for(const secret of ['PRIVATE-SECRET-VALUE','rules_version','PRIVATE-USER-UID'])
   assert.ok(!output.includes(secret),secret);
 assert.ok(!output.includes('serviceConfig'));
});
test('existing trusted workflow controls the only live audit; automatic audit remains offline',()=>{
 const flow=read('.github/workflows/firebase-deploy.yml');
 const source=read('.github/workflows/asteria-campaign-release-audit.yml');
 const section=flow.split(/^  campaign_coordinated_readiness_audit:\s*$/m)[1]
   ?.split(/^  campaign_friends_release_audit:\s*$/m)[0]||'';
 assert.match(flow,/- campaign-coordinated-readiness-audit/);
 assert.match(section,/github\.ref == 'refs\/heads\/main'/);
 assert.match(section,/inputs\.production_confirmation == ''/);
 assert.match(section,/environment: firebase-production/);
 assert.match(section,/google-github-actions\/auth@v3/);
 assert.match(section,/node scripts\/campaign-coordinated-live-audit\.mjs --live/);
 assert.doesNotMatch(section,/firebase deploy|gcloud functions deploy|gcloud firestore import/);
 assert.doesNotMatch(source,/google-github-actions\/auth|id-token:\s*write/);
 const collector=read('scripts/campaign-coordinated-live-audit.mjs');
 assert.match(collector,/requireTrustedContext\(\)/);
 assert.match(collector,/GITHUB_REPOSITORY/);
 assert.match(collector,/GITHUB_REF/);
 assert.doesNotMatch(collector,/gcloud.*(?:deploy|create|update|delete)|firebase deploy/);
 assert.doesNotMatch(collector,/console\.log\((?:token|snapshot|data|environment)\)/);
});

test('trusted live inventory describes every canonical required function including non-gated UCN',async()=>{
 const {descriptionTargets}=await import('./campaign-coordinated-live-audit.mjs');
 const targets=descriptionTargets(inspectCoordinatedSource().manifest);
 assert.ok(targets.includes('asteriaCampaignUCN'));
 assert.ok(targets.includes('asteriaCampaignFriendRecipients'));
 assert.equal(targets.includes('asteriaCampaignEmailInvitations'),false);
 assert.equal(targets.length,new Set(targets).size);
 assert.throws(()=>descriptionTargets({backend:{deployedFunctions:[]}}),/missing/);
 const collector=read('scripts/campaign-coordinated-live-audit.mjs');
 assert.match(collector,/new Set\(descriptionTargets\(manifest\)\)/);
 assert.match(collector,/collectProductionSnapshot\(source\.manifest\)/);
});

test('missing gates are correctly reported as safely default-disabled, not active or unverified',async()=>{
 const {runtimeFlagState}=await import('./campaign-coordinated-readiness.mjs');
 assert.equal(runtimeFlagState({},'ASTERIA_JOIN_REVIEW_ENABLED'),'off (default)');
 assert.equal(runtimeFlagState({ASTERIA_JOIN_REVIEW_ENABLED:'0'},'ASTERIA_JOIN_REVIEW_ENABLED'),'off');
 assert.equal(runtimeFlagState({ASTERIA_JOIN_REVIEW_ENABLED:'1'},'ASTERIA_JOIN_REVIEW_ENABLED'),'on');
 assert.equal(runtimeFlagState({ASTERIA_JOIN_REVIEW_ENABLED:'unexpected'},'ASTERIA_JOIN_REVIEW_ENABLED'),'unknown');
 assert.equal(runtimeFlagState(null,'ASTERIA_JOIN_REVIEW_ENABLED'),'unknown');
 const data=snapshot();
 delete data.descriptions.asteriaCampaignJoinReview.serviceConfig.environmentVariables.ASTERIA_JOIN_REVIEW_ENABLED;
 const report=evaluateProductionSnapshot(data);
 assert.equal(report.runtimeFlags.ASTERIA_JOIN_REVIEW_ENABLED,'off (default)');
 assert.ok(report.blockers.some(s=>s.includes('ASTERIA_JOIN_REVIEW_ENABLED')));
});
