/**
 * Step 2 — Offline, synthetic-only backup recovery preflight.
 * Does NOT connect to Google Cloud, export, restore, deploy, change IAM,
 * read production user data or confirm that a backup is restorable.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PRODUCTION_PROJECT='asteria-ttrpg';
export const SANDBOX_PROJECT_PATTERN=/^demo-asteria-recovery-[a-z0-9-]{3,40}$/;
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(resolve(root,path),'utf8');
const deny=(reason)=>({ready:false,decision:'NO-GO',reason});
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function shapeCheck(sample){
  if(!isObject(sample)||!Array.isArray(sample.users)||
    !Array.isArray(sample.characters)||!Array.isArray(sample.campaigns)||
    !Array.isArray(sample.memberships)||!Array.isArray(sample.storagePaths))
    return deny('Synthetic recovery fixture is incomplete.');
  const users=new Map(),chars=new Map(),campaigns=new Map();
  const keys=new Set();
  for(const user of sample.users){
    if(!safeId(user.uid)||users.has(user.uid))return deny('Duplicate or malformed user UID.');
    if(typeof user.username!=='string'||!user.username||
       typeof user.email!=='string'||!user.email.includes('@'))
      return deny('Synthetic account identity fields are missing.');
    if(user.accountId!==undefined){
      if(typeof user.accountNumber!=='string'||!/^\d{5}$/.test(user.accountNumber)||
         user.accountId!==user.username+'#'+user.accountNumber ||
         user.accountIdKey!==user.username.toLowerCase()+'#'+user.accountNumber ||
         keys.has(user.accountIdKey))return deny('Account ID registry collision or inconsistency.');
      keys.add(user.accountIdKey);
    }
    users.set(user.uid,user);
  }
  for(const character of sample.characters){
    if(!safeId(character.id)||!safeId(character.ownerUid)||
       !users.has(character.ownerUid)||chars.has(character.id))
      return deny('Character ownership or uniqueness is inconsistent.');
    chars.set(character.id,character);
  }
  for(const campaign of sample.campaigns){
    if(!safeId(campaign.id)||!users.has(campaign.ownerUid)||campaigns.has(campaign.id))
      return deny('Campaign ownership or uniqueness is inconsistent.');
    campaigns.set(campaign.id,campaign);
  }
  for(const membership of sample.memberships){
    if(!campaigns.has(membership.campaignId)||!users.has(membership.uid))
      return deny('Campaign membership refers to an absent user or campaign.');
    if(membership.characterId!==undefined &&
       (!chars.has(membership.characterId)||
        chars.get(membership.characterId).ownerUid!==membership.uid))
      return deny('Membership character does not belong to the expected user.');
  }
  for(const entry of sample.storagePaths){
    if(typeof entry!=='string'||
       !(/^(users\/[A-Za-z0-9_-]+\/characters\/[A-Za-z0-9_-]+\/gallery\/[A-Za-z0-9._-]+|campaigns\/[A-Za-z0-9_-]+\/artwork\/[A-Za-z0-9._-]+)$/.test(entry)))
      return deny('Unexpected Storage object path.');
    const segments=entry.split('/');
    if(segments[0]==='users' &&
      (!users.has(segments[1])||!chars.has(segments[3])||
        chars.get(segments[3]).ownerUid!==segments[1]))
      return deny('Character image has no valid owner.');
    if(segments[0]==='campaigns'&&!campaigns.has(segments[1]))
      return deny('Campaign image has no matching campaign.');
  }
  return {ready:true,users:users.size,characters:chars.size,
    campaigns:campaigns.size,memberships:sample.memberships.length,
    storagePaths:sample.storagePaths.length,accountIds:keys.size};
}

export function inspectRecoveryPreflight(plan,fixture){
  if(!isObject(plan))return deny('Recovery plan is missing.');
  if(plan.productionProject!==PRODUCTION_PROJECT)
    return deny('Production source project mismatch.');
  if(!SANDBOX_PROJECT_PATTERN.test(plan.sandboxProject||'') ||
     plan.sandboxProject===plan.productionProject)
    return deny('A separately named, nonproduction sandbox project is required.');
  if(plan.executionMode!=='offline-synthetic')
    return deny('Only offline synthetic verification is permitted.');
  if(plan.firestoreTransfer!=='controlled-export-import')
    return deny('Managed backup direct cross-project restoration is not supported.');
  if(plan.productionWritesAllowed!==false||plan.cloudCredentialsAllowed!==false||
     plan.realUserDataAllowed!==false||plan.restoreAuthorized!==false)
    return deny('Production writes, credentials, real data and restore execution must remain disabled.');
  if(plan.dataSource!=='synthetic-only')
    return deny('A synthetic-only fixture is mandatory.');
  if(plan.firestoreRules!=='review-before-isolated-test' ||
     plan.storageRules!=='review-before-isolated-test')
    return deny('Security rules must be reviewed before any isolated cloud test.');
  const checked=shapeCheck(fixture);
  if(!checked.ready)return checked;
  const fire=read('firebase.json');
  const rules=read('firestore.rules');
  const storage=read('storage.rules');
  const deployed=read('.github/workflows/firebase-deploy.yml');
  const html=read('index.html');
  if(!fire.includes('"firestore"')||!fire.includes('"storage"')||
     !fire.includes('"auth"')||!rules.includes('accountIdRegistry')||
     !storage.includes('campaigns/{campaignId}/artwork')||
     !deployed.includes('production_confirmation')||
     !html.includes('accountIds:true'))
    return deny('Repository release and security source checks are incomplete.');
  return {
    ready:true,decision:'PLAN-READY / RESTORE-NOT-VERIFIED',
    project:plan.sandboxProject,
    synthetic:checked,
    cloudAccessPerformed:false,backupRestored:false,productionModified:false,
    prerequisites:[
      'Independently provision and verify an isolated test project',
      'Record and approve the exact backup/export provenance privately',
      'Review least-privilege temporary permissions and expiring credentials',
      'Take separate Firestore, Authentication and Storage recovery evidence',
      'Prove restored ownership, account IDs, memberships and artwork paths',
      'Destroy test credentials and document sandbox cleanup'
    ]
  };
}
export const SYNTHETIC_PLAN=Object.freeze({
  productionProject:PRODUCTION_PROJECT,
  sandboxProject:'demo-asteria-recovery-sample',
  executionMode:'offline-synthetic',
  firestoreTransfer:'controlled-export-import',
  productionWritesAllowed:false,cloudCredentialsAllowed:false,
  realUserDataAllowed:false,restoreAuthorized:false,
  dataSource:'synthetic-only',firestoreRules:'review-before-isolated-test',
  storageRules:'review-before-isolated-test'
});
export const SYNTHETIC_FIXTURE=Object.freeze({
  users:[
    {uid:'alice',username:'Asteria',email:'alice@example.test',
      accountNumber:'01416',accountId:'Asteria#01416',accountIdKey:'asteria#01416'},
    {uid:'gm',username:'StoryGM',email:'gm@example.test'}
  ],
  characters:[{id:'hero',ownerUid:'alice'}],
  campaigns:[{id:'campaign1',ownerUid:'gm'}],
  memberships:[{uid:'alice',campaignId:'campaign1',characterId:'hero'}],
  storagePaths:['users/alice/characters/hero/gallery/portrait.webp',
    'campaigns/campaign1/artwork/banner.webp']
});
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=inspectRecoveryPreflight(SYNTHETIC_PLAN,SYNTHETIC_FIXTURE);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ready)process.exitCode=1;
}
