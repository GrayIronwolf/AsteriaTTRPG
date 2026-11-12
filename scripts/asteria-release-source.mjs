/**
 * Canonical release flags: config/asteria-release.json.
 * --check refuses drift; --apply rewrites only existing inline flag declaration.
 * This tool does NOT deploy, change Firebase, migrate, or enable production.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const fail=reason=>{throw Error('Asteria release source of truth: '+reason)};
const WEBSITE=new URL('../index.html',import.meta.url);
const REGEX=/window\.AsteriaFeatureFlags = Object\.freeze\(\{[^}\n]*\}\);/g;
const keys=[
  'friendNotificationsEnabled','serverCampaignUCN','campaignJoinPreview',
  'campaignJoinRequests','campaignJoinReview','campaignPlayerRoster',
  'campaignMemberControls','campaignRolePermissions','campaignCharacterLinks',
  'campaignCharacterApproval','campaignCharacterLifecycle','secureInvitationManager',
  'secureInvitationAcceptance','emailInvitationControls','campaignNotifications',
  'campaignFriendRecipients','accountIds','campaignFriendInvitations','campaignInAppCanary'
];
const canaries={
  friendAccountLookup:"new URLSearchParams(window.location.search).get('friends-lookup-canary')==='1'",
  friendRequestsEnabled:"new URLSearchParams(window.location.search).get('friends-requests-canary')==='1'",
  accountIdAutoCanary:"new URLSearchParams(window.location.search).get('account-id-auto-canary')==='1'",
  accountIdCanary:"new URLSearchParams(window.location.search).get('account-id-canary')==='1'"
};
const fns=[
  'asteriaCampaignUCN','asteriaMembershipPreparation','asteriaCampaignAccessCutover',
  'asteriaCampaignJoinRequest','asteriaCampaignJoinReview',
  'asteriaCampaignFriendRecipients','asteriaSecureInvitation'
];
export function readManifest(){
  return JSON.parse(readFileSync(new URL('../config/asteria-release.json',import.meta.url),'utf8'));
}
export function validateManifest(data){
  if(!data||data.schemaVersion!==1||data.releaseId!=='asteria-campaign-friends-v2'||
     data.project!=='asteria-ttrpg'||data.region!=='us-central1'||
     data.mode!=='manual-approval-required')
    fail('unreviewed project, release schema or approval mode');
  if(JSON.stringify(Object.keys(data.websiteFlags||{}))!==JSON.stringify(keys)||
     Object.values(data.websiteFlags).some(x=>typeof x!=='boolean'))
    fail('unreviewed website features or invalid flag values');
  if(JSON.stringify(data.canaryFlags)!==JSON.stringify(Object.keys(canaries)))
    fail('unreviewed canary feature flags');
  if(JSON.stringify(data.backend?.deployedFunctions)!==JSON.stringify(fns)||
     data.backend?.requiresLiveVerification!==true)
    fail('unreviewed backend function inventory');
  if(data.invitationDelivery?.active!=='in-app-notifications-only'||
     data.invitationDelivery?.emailInvitations!=='deferred'||
     data.invitationDelivery?.resendRequired!==false||
     data.websiteFlags?.emailInvitationControls!==false)
    fail('Current Campaign invitation delivery must be in-app only; external email is deferred');
  if(data.existingFriendsNotificationsPreserved!==true||
     data.websiteFlags.friendNotificationsEnabled!==true||
     data.websiteFlags.accountIds!==true)
    fail('existing notifications and Account ID experience must remain intact');
  if(data.status!=='installed-not-activated'||
     Object.keys(data.approvals||{}).length!==5||
     Object.values(data.approvals).some(x=>x!==false))
    fail('production activation is not established by a website source flag');
  for(const key of keys){
    if(key==='friendNotificationsEnabled'||key==='accountIds')continue;
    if(data.websiteFlags[key])fail('production release not approved; '+key+' cannot be enabled');
  }
  return data;
}
export function expectedAssignment(data=readManifest()){
  const flags=validateManifest(data).websiteFlags;
  const items=[
    'friendAccountLookup:'+canaries.friendAccountLookup,
    'friendRequestsEnabled:'+canaries.friendRequestsEnabled,
    ...keys.slice(0,17).map(key=>key+':'+flags[key]),
    'accountIdAutoCanary:'+canaries.accountIdAutoCanary,
    'accountIdCanary:'+canaries.accountIdCanary,
    'campaignFriendInvitations:'+flags.campaignFriendInvitations,
    'campaignInAppCanary:'+flags.campaignInAppCanary
  ];
  if(items.length!==23)fail('website flag count changed');
  return 'window.AsteriaFeatureFlags = Object.freeze({'+items.join(',')+'});';
}
export function checkWebsite(source,data=readManifest()){
  const assignments=[...source.matchAll(REGEX)];
  if(assignments.length!==1)fail('expected exactly one static website flag declaration');
  if(assignments[0][0]!==expectedAssignment(data))
    fail('website flags drifted from config/asteria-release.json');
  return {release:data.releaseId,checked:true,productionChanged:false};
}
export function renderWebsite(source,data=readManifest()){
  const assignments=[...source.matchAll(REGEX)];
  if(assignments.length!==1)fail('expected exactly one static website flag declaration');
  const next=source.replace(REGEX,expectedAssignment(data));
  checkWebsite(next,data);
  return next;
}
function main(){
  const mode=process.argv[2];
  if(process.argv.length!==3||!['--check','--apply'].includes(mode))
    fail('use --check or --apply');
  const source=readFileSync(WEBSITE,'utf8');
  const next=mode==='--apply'?renderWebsite(source):source;
  if(mode==='--apply'&&next!==source)writeFileSync(WEBSITE,next);
  console.log(JSON.stringify(checkWebsite(next)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error(error.message);process.exitCode=1}
}
