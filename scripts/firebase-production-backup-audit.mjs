/**
 * Step 2.2: Google Cloud production backup METADATA inventory.
 *
 * The authorized deployment workflow invokes this only from main under its
 * existing restricted firebase-production Workload Identity Federation.
 * All gcloud calls are hard-coded LIST commands; no document or Storage object
 * contents, credentials, identifiers for private backup buckets, or raw
 * command responses are emitted to Actions logs or step summaries.
 *
 * This does NOT create a backup, prove restorability, or authorize a deploy.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';

export const PROJECT='asteria-ttrpg';
export const DEFAULT_BUCKET='asteria-ttrpg.firebasestorage.app';
const DEFAULT_DATABASE='(default)';

export const LIST_COMMANDS=Object.freeze({
  databases:['firestore','databases','list'],
  schedules:['firestore','backups','schedules','list','--database=(default)'],
  backups:['firestore','backups','list','--limit=200'],
  operations:['firestore','operations','list','--database=(default)','--limit=100'],
  buckets:['storage','buckets','list'],
  indexes:['firestore','indexes','composite','list','--database=(default)']
});

function safeArray(results,key){
  return results[key]?.status==='ok'&&Array.isArray(results[key].rows)?
    results[key].rows:null;
}
function safeTime(input){
  if(typeof input!=='string')return 'unknown';
  const date=new Date(input);
  return Number.isFinite(date.getTime())?date.toISOString():'unknown';
}
function retentionDays(input){
  if(typeof input!=='string'||!(/^\d+s$/).test(input))return 'unknown';
  const days=Number(input.slice(0,-1))/86400;
  return Number.isFinite(days)?Math.round(days*100)/100:'unknown';
}
function statusOf(results,key){return results[key]?.status==='ok'?'readable':'not verified';}
function isDefaultDatabase(item){
  const name=String(item?.name||item?.database||item?.id||'');
  return name===DEFAULT_DATABASE||name.endsWith('/databases/'+DEFAULT_DATABASE);
}
function bucketName(item){
  return String(item?.name||item?.id||'').replace(/^gs:\/\//,'');
}
function isBackupForDefault(backup){
  return isDefaultDatabase({name:backup?.database});
}
function isExportOperation(row){
  return String(row?.metadata?.['@type']||'').endsWith('ExportDocumentsMetadata');
}
function boolStatus(v){
  return v===true?'enabled':v===false?'disabled':'unknown';
}
function normalizedStatus(value){
  return typeof value==='string'&&/^[A-Za-z_]{1,50}$/.test(value)?value:'unknown';
}
function bucketSoftDelete(row){
  const obj=row?.softDeletePolicy||row?.soft_delete_policy||{};
  const value=obj.retentionDurationSeconds??obj.retention_duration_seconds??null;
  if(value===null)return 'unknown';
  const seconds=Number(value);
  return Number.isFinite(seconds)&&seconds>=0?seconds+' seconds':'unknown';
}

/** Summarises only nonsensitive high-level metadata; accepts mocked rows for tests. */
export function summarizeInventory(results){
  const dbs=safeArray(results,'databases');
  const schedules=safeArray(results,'schedules');
  const backups=safeArray(results,'backups');
  const operations=safeArray(results,'operations');
  const buckets=safeArray(results,'buckets');
  const indexes=safeArray(results,'indexes');
  const db=dbs?.find(isDefaultDatabase);
  const relevantBackups=backups?.filter(isBackupForDefault);
  const readyBackups=relevantBackups?.filter(b=>b.state==='READY');
  const latestReady=(readyBackups||[]).map(b=>safeTime(b.snapshotTime)).
    filter(v=>v!=='unknown').sort().at(-1)||'unknown';
  const chosenBucket=buckets?.find(b=>bucketName(b)===DEFAULT_BUCKET);
  const bVersioning=chosenBucket?.versioning?.enabled ??
    chosenBucket?.versioningEnabled ?? null;
  const scheduleTypes=schedules?.map(row=>
    row.dailyRecurrence?'daily':row.weeklyRecurrence?'weekly':'other')||[];
  const exports=operations?.filter(isExportOperation);
  const relevantIndexes=indexes?.filter(i=>
    (i.collectionGroup||'')==='events'||
    String(i.name||'').includes('/collectionGroups/events/'));
  const targetStates=['createdAt','acknowledged'].map(field=>{
    const entry=relevantIndexes?.find(i=>Array.isArray(i.fields)&&
      i.fields.some(f=>f.fieldPath==='targetOwnerUid')&&
      i.fields.some(f=>f.fieldPath===field));
    return {field,status:entry?normalizedStatus(entry.state):'not verified'};
  });
  const coverage=['databases','schedules','backups','operations','buckets','indexes'].
    map(key=>({item:key,result:statusOf(results,key)}));
  const required=['databases','schedules','backups','buckets'];
  const coreReadable=required.every(key=>results[key]?.status==='ok');
  return {
    project:PROJECT,database:DEFAULT_DATABASE,
    coreReadable,
    coverage,
    firestore:{
      found:dbs!==null?Boolean(db):null,
      location:typeof db?.locationId==='string'&&/^[a-z0-9-]{1,40}$/.test(db.locationId)?
        db.locationId:'unknown',
      pitr:db?.pointInTimeRecoveryEnablement==='POINT_IN_TIME_RECOVERY_ENABLED'?'enabled':
        db?.pointInTimeRecoveryEnablement==='POINT_IN_TIME_RECOVERY_DISABLED'?'disabled':'unknown',
      earliestPitrTime:safeTime(db?.earliestVersionTime),
      backupSchedules:schedules?.length??null,
      scheduleTypes: [...new Set(scheduleTypes)].sort(),
      scheduleRetentionDays:schedules?.map(s=>retentionDays(s.retention))||null,
      availableManagedBackups:relevantBackups?.length??null,
      readyManagedBackups:readyBackups?.length??null,
      latestReadySnapshot:latestReady,
      exportHistoryEntries:exports?.length??null,
      note:'Operation history alone cannot verify whether export files still exist.'
    },
    storage:{
      listedBuckets:buckets?.length??null,
      expectedBucket:DEFAULT_BUCKET,
      expectedBucketPresent:buckets!==null?Boolean(chosenBucket):null,
      expectedBucketLocation:
        typeof chosenBucket?.location==='string'&&/^[A-Za-z0-9-]{1,40}$/.test(chosenBucket.location)?
          chosenBucket.location:'unknown',
      expectedBucketVersioning:boolStatus(bVersioning),
      expectedBucketSoftDeleteRetention:bucketSoftDelete(chosenBucket),
      otherBucketsCount:buckets!==null?buckets.length-(chosenBucket?1:0):null,
      note:'Bucket metadata does not establish object counts, intact copies or successful restore.'
    },
    indexes:{
      listed:indexes?.length??null,
      expectedEventsIndexes:targetStates
    },
    restoreVerified:false
  };
}
function renderValue(value){
  if(value===null||value===undefined)return 'not verified';
  if(Array.isArray(value))return value.length?value.join(', '):'none listed';
  return String(value);
}
export function renderMarkdown(summary){
  const f=summary.firestore,s=summary.storage;
  return [
    '## Asteria — read-only Firebase backup inventory',
    '',
    '**Project:** '+PROJECT+' · **Firestore database:** '+DEFAULT_DATABASE,
    '',
    '**Scope:** Metadata listing only. No campaign, character, user, invitation,',
    'Storage object or secret data was read. This run does not create backups,',
    'restore databases, deploy services, change rules or enable feature flags.',
    '',
    '**Metadata inventory:** '+(summary.coreReadable?'core queries completed':'INCOMPLETE — review permissions/errors'),
    '**Backup restore test:** NOT VERIFIED (production rollout remains NO-GO)',
    '',
    '| Inspection | Result |',
    '| --- | --- |',
    ...summary.coverage.map(row=>'| '+row.item+' | '+row.result+' |'),
    '',
    '### Firestore metadata',
    '- Default database located: '+renderValue(f.found),
    '- Database location: '+renderValue(f.location),
    '- PITR: '+renderValue(f.pitr),
    '- Earliest PITR timestamp: '+renderValue(f.earliestPitrTime),
    '- Backup schedules: '+renderValue(f.backupSchedules),
    '- Schedule cadence(s): '+renderValue(f.scheduleTypes),
    '- Schedule retention (days): '+renderValue(f.scheduleRetentionDays),
    '- Listed managed backups for default database: '+renderValue(f.availableManagedBackups),
    '- READY managed backups: '+renderValue(f.readyManagedBackups),
    '- Latest READY snapshot timestamp: '+renderValue(f.latestReadySnapshot),
    '- Firestore export-operation records in sampled history: '+renderValue(f.exportHistoryEntries),
    '- Export history is sampled (up to 100 operations); absence does not prove no exports exist.',
    '',
    '### Cloud Storage metadata',
    '- Buckets listed in this project: '+renderValue(s.listedBuckets),
    '- Website-configured bucket: '+DEFAULT_BUCKET,
    '- Configured bucket found: '+renderValue(s.expectedBucketPresent),
    '- Configured bucket location: '+renderValue(s.expectedBucketLocation),
    '- Versioning: '+renderValue(s.expectedBucketVersioning),
    '- Soft-delete retention: '+renderValue(s.expectedBucketSoftDeleteRetention),
    '- Additional buckets (names withheld): '+renderValue(s.otherBucketsCount),
    '- Object contents, names and metadata were NOT listed.',
    '',
    '### Index inventory (context only)',
    '- Composite indexes listed: '+renderValue(summary.indexes.listed),
    ...summary.indexes.expectedEventsIndexes.map(i=>
      '- events (targetOwnerUid + '+i.field+'): '+i.status),
    '',
    '### Next release gate',
    'Existing backup metadata is **not proof of a complete, restorable backup**.',
    'A separately approved full Firestore/Storage/Auth/config recovery plan,',
    'private evidence review and isolated restore test remain required.',
    ''
  ].join('\n');
}
function runGcloudList(args){
  try{
    // Captured output is processed in memory; never print raw JSON/errors.
    const raw=execFileSync('gcloud',[
      ...args,'--project='+PROJECT,'--format=json','--quiet','--verbosity=error'
    ],{
      encoding:'utf8',maxBuffer:12*1024*1024,timeout:90000,
      stdio:['ignore','pipe','pipe']
    });
    const parsed=JSON.parse(raw.trim()||'[]');
    return Array.isArray(parsed)?{status:'ok',rows:parsed}:
      {status:'unavailable',reason:'unrecognised-response'};
  }catch(error){
    const msg=String(error?.stderr||'')+' '+String(error?.message||'');
    return {
      status:'unavailable',
      reason:/PERMISSION_DENIED|403|permission|not authorized|API has not been used/i.test(msg)?
        'insufficient-permission-or-api-disabled':'command-or-response-unavailable'
    };
  }
}
function requireAuthorizedContext(){
  if(process.env.GITHUB_ACTIONS!=='true'||
     process.env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     process.env.GITHUB_REF!=='refs/heads/main'||
     !['backup-audit','campaign-coordinated-readiness-audit'].includes(process.env.ASTERIA_AUDIT_OPERATION)){
    throw Error('Read-only backup inventory must run through the authorised main-branch GitHub operation.');
  }
}
export function auditLive(){
  requireAuthorizedContext();
  const results={};
  for(const [name,args] of Object.entries(LIST_COMMANDS)){
    results[name]=runGcloudList(args);
  }
  const summary=summarizeInventory(results);
  const output=renderMarkdown(summary);
  console.log(output);
  if(process.env.GITHUB_STEP_SUMMARY){
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,output+'\n',{encoding:'utf8'});
  }
  if(!summary.coreReadable){
    console.error('Core backup inventory incomplete; check least-privilege read permissions in Google Cloud.');
    process.exitCode=2;
  }
  return summary;
}
if(process.argv.includes('--live')){
  try{auditLive();}
  catch(error){console.error('Audit context verification failed. No cloud query was executed.');process.exitCode=2;}
}
