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
 const names=[...expected,'asteriaCampaignNotifications','asteriaCampaignEmailInvitations'];
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
 assert.ok(Object.keys(FLAG_OWNERS).length>=8);
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
