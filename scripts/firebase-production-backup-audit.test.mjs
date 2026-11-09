import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  PROJECT,DEFAULT_BUCKET,LIST_COMMANDS,summarizeInventory,renderMarkdown
} from './firebase-production-backup-audit.mjs';

const sample={
  databases:{status:'ok',rows:[{
    name:'projects/asteria-ttrpg/databases/(default)',
    locationId:'australia-southeast1',
    pointInTimeRecoveryEnablement:'POINT_IN_TIME_RECOVERY_ENABLED',
    earliestVersionTime:'2026-11-08T00:00:00Z'
  }]},
  schedules:{status:'ok',rows:[{name:'projects/private/backupSchedules/private',
    dailyRecurrence:{},retention:'604800s'}]},
  backups:{status:'ok',rows:[{
    name:'projects/private/locations/australia-southeast1/backups/private',
    database:'projects/asteria-ttrpg/databases/(default)',
    state:'READY',snapshotTime:'2026-11-09T00:00:00Z'
  }]},
  operations:{status:'ok',rows:[{name:'projects/secret/operations/foo',
    metadata:{'@type':'type.googleapis.com/google.firestore.admin.v1.ExportDocumentsMetadata'}}]},
  buckets:{status:'ok',rows:[
    {name:DEFAULT_BUCKET,location:'AUSTRALIA-SOUTHEAST1',
      versioning:{enabled:true},softDeletePolicy:{retentionDurationSeconds:'604800'}},
    {name:'private-backups-secret-name',location:'AUSTRALIA-SOUTHEAST1'}
  ]},
  indexes:{status:'ok',rows:[
    {collectionGroup:'events',state:'READY',fields:[
      {fieldPath:'targetOwnerUid'},{fieldPath:'createdAt'}]},
    {collectionGroup:'events',state:'READY',fields:[
      {fieldPath:'targetOwnerUid'},{fieldPath:'acknowledged'}]}
  ]}
};
test('all gcloud operations have allowlisted read-only list verbs, never write or download',()=>{
  assert.equal(PROJECT,'asteria-ttrpg');
  for(const [key,args] of Object.entries(LIST_COMMANDS)){
    assert.ok(['databases','schedules','backups','operations','buckets','indexes'].includes(key));
    assert.ok(Array.isArray(args));
    assert.equal(args.at(-1)?.startsWith('--'),true);
    assert.equal(args.includes('list'),true);
    assert.equal(args.some(x=>/^(create|delete|export|import|restore|deploy|update|copy|cp|cat|objects|describe|read|download)$/.test(x)),false);
  }
});
test('summarizer preserves useful backup and bucket facts but redacts all private names',()=>{
  const result=summarizeInventory(sample);
  assert.equal(result.coreReadable,true);
  assert.equal(result.firestore.found,true);
  assert.equal(result.firestore.pitr,'enabled');
  assert.equal(result.firestore.backupSchedules,1);
  assert.deepEqual(result.firestore.scheduleRetentionDays,[7]);
  assert.equal(result.firestore.availableManagedBackups,1);
  assert.equal(result.firestore.readyManagedBackups,1);
  assert.equal(result.firestore.latestReadySnapshot,'2026-11-09T00:00:00.000Z');
  assert.equal(result.storage.listedBuckets,2);
  assert.equal(result.storage.expectedBucketPresent,true);
  assert.equal(result.storage.otherBucketsCount,1);
  assert.equal(result.storage.expectedBucketVersioning,'enabled');
  assert.equal(result.restoreVerified,false);
  const output=renderMarkdown(result);
  assert.match(output,/NOT VERIFIED/);
  for(const secret of ['private-backups-secret-name','projects/private','projects/secret']){
    assert.equal(output.includes(secret),false);
    assert.equal(JSON.stringify(result).includes(secret),false);
  }
});
test('missing permissions are not treated as missing backups',()=>{
  const result=summarizeInventory({
    ...sample,
    backups:{status:'unavailable',reason:'insufficient-permission-or-api-disabled'},
    buckets:{status:'unavailable',reason:'insufficient-permission-or-api-disabled'}
  });
  assert.equal(result.coreReadable,false);
  assert.equal(result.firestore.availableManagedBackups,null);
  assert.equal(result.firestore.readyManagedBackups,null);
  assert.equal(result.storage.listedBuckets,null);
  assert.equal(result.storage.expectedBucketPresent,null);
  assert.match(renderMarkdown(result),/INCOMPLETE/);
});
test('empty successful listings are explicitly different from inaccessible listings',()=>{
  const result=summarizeInventory({
    databases:sample.databases,
    schedules:{status:'ok',rows:[]},
    backups:{status:'ok',rows:[]},
    operations:{status:'ok',rows:[]},
    buckets:{status:'ok',rows:[]},
    indexes:{status:'ok',rows:[]}
  });
  assert.equal(result.coreReadable,true);
  assert.equal(result.firestore.backupSchedules,0);
  assert.equal(result.firestore.availableManagedBackups,0);
  assert.equal(result.storage.expectedBucketPresent,false);
  assert.equal(result.restoreVerified,false);
});
test('backup auditor cannot accidentally contain write operations or expose raw stderr',()=>{
  const source=readFileSync(new URL('./firebase-production-backup-audit.mjs',import.meta.url),'utf8');
  assert.match(source,/requireAuthorizedContext\(\)/);
  assert.match(source,/ASTERIA_AUDIT_OPERATION/);
  assert.match(source,/GITHUB_REPOSITORY/);
  assert.match(source,/GITHUB_REF/);
  assert.match(source,/stdio:\['ignore','pipe','pipe'\]/);
  assert.doesNotMatch(source,/console\.log\((?:raw|error|results|parsed|rows)\)/);
  assert.doesNotMatch(source,/\b(gcloud|gsutil)\s+(?:firestore\s+)?(?:export|import|restore|delete|create|update|deploy|cp)\b/);
});
