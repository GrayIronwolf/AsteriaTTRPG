import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 readManifest,validateManifest,expectedAssignment,checkWebsite,renderWebsite
} from './asteria-release-source.mjs';

const site=()=>readFileSync(new URL('../index.html',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));

test('canonical manifest covers published website flags and preserves older Friends systems',()=>{
 const release=readManifest();
 const response=checkWebsite(site(),release);
 assert.equal(response.checked,true);
 assert.equal(response.productionChanged,false);
 assert.match(expectedAssignment(release),/friendNotificationsEnabled:true,serverCampaignUCN:false/);
 assert.match(expectedAssignment(release),/campaignFriendRecipients:false,accountIds:true/);
 assert.match(expectedAssignment(release),/campaignFriendInvitations:false/);
 assert.match(expectedAssignment(release),/secureInvitationManager:false,secureInvitationAcceptance:false/);
 assert.match(expectedAssignment(release),/accountIdAutoCanary:new URLSearchParams/);
 assert.equal(release.backend.deployedFunctions.length,7);
});
test('website is checked without Firebase access and any drift fails',()=>{
 const source=site();
 assert.equal(renderWebsite(source),source);
 assert.throws(()=>checkWebsite(source.replace('campaignFriendRecipients:false','campaignFriendRecipients:true')),/drifted/);
 assert.throws(()=>checkWebsite(source.replace('accountIds:true','accountIds:false')),/drifted/);
 assert.throws(()=>checkWebsite(source.replace('window.AsteriaFeatureFlags = Object.freeze','window.OtherFlags = Object.freeze')),/exactly one/);
});
test('unapproved activation, changed project, or removed protection fails closed',()=>{
 const good=readManifest();
 for(const key of ['serverCampaignUCN','secureInvitationManager','secureInvitationAcceptance','campaignFriendRecipients','campaignFriendInvitations']){
   const bad=clone(good);bad.websiteFlags[key]=true;
   assert.throws(()=>validateManifest(bad),/not approved/);
 }
 for(const mutate of [
   data=>{data.project='demo-asteria'},
   data=>{data.backend.deployedFunctions.pop()},
   data=>{data.websiteFlags.friendNotificationsEnabled=false},
   data=>{data.approvals.finalProductionAuthorization=true},
   data=>{data.status='live'}
 ]){
   const bad=clone(good);mutate(bad);
   assert.throws(()=>validateManifest(bad));
 }
});
test('single source of truth is wired into full tests, production build and GitHub CI',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 const checks=readFileSync(new URL('../.github/workflows/firebase-checks.yml',import.meta.url),'utf8');
 const release=readFileSync(new URL('../.github/workflows/campaign-phase8-3-readiness.yml',import.meta.url),'utf8');
 assert.match(pkg.scripts.test,/test:release-source/);
 assert.match(pkg.scripts.prebuild,/release:check/);
 assert.match(pkg.scripts['release:check'],/asteria-release-source\.mjs --check/);
 assert.match(checks,/npm run release:check/);
 assert.match(release,/npm run release:check/);
 assert.doesNotMatch(release,/firebase deploy|firebase functions:config:set|gcloud functions deploy/);
});

test('automatic coordinated source audit cannot request untrusted production cloud access',()=>{
 const offline=readFileSync(new URL('../.github/workflows/asteria-campaign-release-audit.yml',import.meta.url),'utf8');
 assert.match(offline,/node scripts\/asteria-release-source\.mjs --check/);
 assert.match(offline,/node scripts\/campaign-phase8-3-release\.mjs --audit/);
 assert.match(offline,/permissions:\n  contents: read/);
 assert.doesNotMatch(offline,/google-github-actions\/auth|gcloud\s|id-token:\s*write|firebase deploy/);
 assert.match(offline,/NO-GO for public activation/);
});
