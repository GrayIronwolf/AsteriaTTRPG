/**
 * One-pass, read-only Asteria Campaign v2/Friends production release inventory.
 * All live inputs are gathered by the pre-existing WIF-trusted Firebase workflow.
 * NO service writes, secret value access, migrations, enablement or deployments.
 * A source/metadata check NEVER becomes a production release authorization.
 */
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readManifest,checkWebsite} from './asteria-release-source.mjs';
import {inspectPhase83Source} from './campaign-phase8-3-release.mjs';

export const FLAG_OWNERS = Object.freeze({
  asteriaMembershipPreparation:['ASTERIA_MEMBERSHIP_STAGING_ENABLED'],
  asteriaCampaignAccessCutover:['ASTERIA_MEMBERSHIP_CUTOVER_ENABLED'],
  asteriaCampaignJoinRequest:['ASTERIA_JOIN_REQUESTS_ENABLED','ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED'],
  asteriaCampaignJoinReview:[
    'ASTERIA_JOIN_REVIEW_ENABLED','ASTERIA_PLAYER_ROSTER_ENABLED',
    'ASTERIA_MEMBER_CONTROLS_ENABLED','ASTERIA_ROLE_PERMISSIONS_ENABLED',
    'ASTERIA_CHARACTER_LINK_REQUESTS_ENABLED','ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED',
    'ASTERIA_CHARACTER_LIFECYCLE_ENABLED'
  ],
  asteriaCampaignFriendRecipients:['ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED'],
  asteriaSecureInvitation:[
    'ASTERIA_SECURE_INVITATIONS_ENABLED','ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
    'ASTERIA_INVITATION_MANAGER_ENABLED','ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED'
  ],
  asteriaCampaignNotifications:['ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED'],
  asteriaCampaignEmailInvitations:[
    'ASTERIA_EMAIL_INVITATION_CONTROLS_ENABLED','ASTERIA_EMAIL_DELIVERY_ENABLED'
  ]
});
const essential = Object.freeze([
  'ASTERIA_JOIN_REQUESTS_ENABLED','ASTERIA_JOIN_REVIEW_ENABLED',
  'ASTERIA_SECURE_INVITATIONS_ENABLED','ASTERIA_INVITATION_ACCEPTANCE_ENABLED',
  'ASTERIA_INVITATION_MANAGER_ENABLED',
  'ASTERIA_CAMPAIGN_FRIEND_RECIPIENTS_ENABLED',
  'ASTERIA_CAMPAIGN_FRIEND_INVITES_ENABLED'
]);
const optionals = Object.freeze(['asteriaCampaignNotifications','asteriaCampaignEmailInvitations']);
const local = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const fail=message=>{throw Error('Coordinated production release audit: '+message);};
const safe=entry=>entry==='1'?'on':entry==='0'?'off':'unknown';
const leaf=name=>typeof name==='string'?name.split('/').pop():'';

export function inspectCoordinatedSource(){
  const manifest=readManifest();
  checkWebsite(local('index.html'),manifest);
  const phase83=inspectPhase83Source();
  if(!phase83.staticChecksPassed)fail('Phase 8.3 source protections have changed.');
  const server=local('functions/index.mjs');
  for(const name of manifest.backend.deployedFunctions.concat(optionals)){
    if(!server.includes('export const '+name+'=onCall('))
      fail('Required source handler missing: '+name);
  }
  for(const [owner,flags] of Object.entries(FLAG_OWNERS)){
    for(const flag of flags){
      if(!server.includes('process.env.'+flag))
        fail('Required runtime gate missing: '+owner+'/'+flag);
    }
  }
  if(!manifest.backend.requiresLiveVerification||manifest.status!=='installed-not-activated')
    fail('Unreviewed activation or release source state.');
  return {manifest,phase83};
}

export function evaluateProductionSnapshot(snapshot,{manifest=readManifest(),firestoreSource=local('firestore.rules'),storageSource=local('storage.rules')}={}){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))
    fail('Missing trusted read-only inventory.');
  if(snapshot.project!=='asteria-ttrpg'||snapshot.region!=='us-central1')
    fail('Live inventory project or region does not match canonical release source.');
  const entries=Array.isArray(snapshot.functions)?snapshot.functions:null;
  if(!entries)fail('Cloud Functions list was not verifiable.');
  const descriptions=snapshot.descriptions||{};
  const records=Object.create(null);
  const blockers=[];
  const expected=manifest.backend.deployedFunctions;
  for(const target of [...expected,...optionals]){
    const matches=entries.filter(entry=>leaf(entry?.name)===target);
    const desc=Object.hasOwn(descriptions,target)?descriptions[target]:null;
    const active=matches.length===1&&matches[0]?.state==='ACTIVE'&&
      desc?.state==='ACTIVE'&&leaf(desc.name)===target;
    records[target]={state:active?'ACTIVE':matches.length?'NOT VERIFIED ACTIVE':'MISSING'};
    if(expected.includes(target)&&!active)
      blockers.push('Required Cloud Function not verifiably ACTIVE: '+target);
  }
  const flags=Object.create(null);
  for(const [owner,names] of Object.entries(FLAG_OWNERS)){
    const env=records[owner]?.state==='ACTIVE'&&
      descriptions[owner]?.serviceConfig?.environmentVariables;
    for(const key of names){
      const state=safe(env?.[key]);
      flags[key]=state;
      if(essential.includes(key)&&state!=='on')
        blockers.push('Required invitation/GM backend gate not enabled: '+key);
    }
  }
  const secretEnabled=snapshot.signingSecret?.enabled===true;
  if(!secretEnabled)blockers.push('Enabled signing-secret version not verifiable.');
  const ruleSource={firestore:firestoreSource,storage:storageSource};
  const rules={};
  for(const [name,localSource] of Object.entries(ruleSource)){
    const rule=snapshot.rules?.[name];
    const files=rule?.source?.files;
    const known=Array.isArray(files)&&files.length>0;
    const matches=known&&files.some(f=>f?.content===localSource);
    rules[name]=matches?'matches-checked-in-source':known?'DIFFERENT FROM SOURCE':'NOT VERIFIED';
    if(!matches)blockers.push('Live '+name+' Rules do not have verified source parity.');
  }
  // Metadata-only audits can NEVER establish safe rollback or an owner-approved migration.
  blockers.push('Production backup + isolated restore not independently verified.');
  blockers.push('Owner-approved per-campaign v2 reconciliation/cutover not independently verified.');
  blockers.push('Authenticated GM/player/outsider live device acceptance not independently verified.');
  blockers.push('Monitoring, incident thresholds and guarded rollback not independently attested.');
  blockers.push('Activation-capable source release and independent human GO not approved.');
  if(snapshot.backup?.metadataReadable!==true)
    blockers.push('Backup inventory metadata not fully readable.');
  const notices=[];
  for(const target of optionals){
    if(records[target].state!=='ACTIVE')
      notices.push('Optional Campaign notifications/email channel not fully installed: '+target);
  }
  if(flags.ASTERIA_AUTO_APPROVE_JOIN_REQUESTS_ENABLED==='on')
    notices.push('Automatic join approval is enabled; requires separate review.');
  return {
    project:manifest.project,region:manifest.region,release:manifest.releaseId,
    installedFunctions:expected.filter(t=>records[t].state==='ACTIVE').length,
    expectedFunctions:expected.length,
    functionStates:records,runtimeFlags:flags,rules,
    signingSecretEnabledVersionVisible:secretEnabled,
    backupMetadataReadable:snapshot.backup?.metadataReadable===true,
    websiteStatus:manifest.status,releaseDecision:'NO-GO',blockers,notices,
    productionChanged:false
  };
}
function escapeCell(s){return String(s).replace(/\|/g,'/').replace(/[\r\n]/g,' ');}
export function renderReleaseReport(report){
  const rows=[
    '## Asteria — complete Campaign v2 / Friends release readiness',
    '',
    '**Production:** '+report.project+' / '+report.region+'; **release:** '+report.release,
    '',
    '| Production control | Verified status |',
    '| --- | --- |',
    '| Core campaign/Friends Cloud Functions | '+report.installedFunctions+'/'+report.expectedFunctions+' verified ACTIVE |',
    '| Secure signing key | '+(report.signingSecretEnabledVersionVisible?'Enabled version visible (value not read)':'NOT VERIFIED')+' |',
    '| Firestore Rules | '+report.rules.firestore+' |',
    '| Storage Rules | '+report.rules.storage+' |',
    '| Backup metadata | '+(report.backupMetadataReadable?'Readable (restore NOT verified)':'NOT VERIFIED')+' |',
    '| Website release | '+report.websiteStatus+' |',
    '',
    '### Live function inventory (names only)',
    ...Object.entries(report.functionStates).map(([name,state])=>'- '+name+': '+state.state),
    '',
    '### Server feature gates (boolean only, never secret values)',
    ...Object.entries(report.runtimeFlags).sort(([a],[b])=>a.localeCompare(b))
      .map(([name,value])=>'- '+name+': '+value),
    '',
    '### Release blockers — combined',
    ...report.blockers.map((value,i)=>(i+1)+'. '+escapeCell(value)),
    ...(report.notices.length?['','### Additional channels / warnings',
      ...report.notices.map(x=>'- '+escapeCell(x))]:[]),
    '',
    '**Final decision: NO-GO for production activation.** This report does not assert a verified backup, completed migration, private release approval or authenticated real-account test.',
    'Read-only inspection only. No functions/rules/hosting deployed, secret values read, data modified, email sent or flags changed.',
    ''
  ];
  return rows.join('\n');
}
function main(){
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--check'){
    const {manifest}=inspectCoordinatedSource();
    console.log(JSON.stringify({verified:true,release:manifest.releaseId,productionChanged:false}));
    return;
  }
  if(args.length!==2||args[0]!=='--report')fail('choose --check or --report <snapshot.json>');
  if(process.env.GITHUB_ACTIONS!=='true'||
     process.env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     process.env.GITHUB_REF!=='refs/heads/main'||
     process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     process.env.ASTERIA_COORDINATED_OPERATION!=='campaign-coordinated-readiness-audit'||
     !process.env.RUNNER_TEMP||
     !resolve(args[1]).startsWith(resolve(process.env.RUNNER_TEMP)+'/'))
    fail('Live report must run inside the approved trusted production audit.');
  const source=inspectCoordinatedSource();
  const snapshot=JSON.parse(readFileSync(args[1],'utf8'));
  const report=evaluateProductionSnapshot(snapshot,{manifest:source.manifest});
  const markdown=renderReleaseReport(report);
  if(!process.env.GITHUB_STEP_SUMMARY)fail('GitHub summary destination unavailable.');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,markdown+'\n');
  console.log('Coordinated production readiness evaluated: NO-GO; '+report.blockers.length+
    ' blockers. Full redacted inventory available in the GitHub Actions job summary.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){console.error(error.message);process.exitCode=1;}
}
