/**
 * One coordinated, production-only Account ID migration.
 * Requires a reviewed backup, approval and operator shell. No browser callable.
 * Inventory is private: stdout contains ONLY aggregate counts, never user data.
 */
import {pathToFileURL} from 'node:url';
import {inspectLegacyAccountIdentity,backfillLegacyAccountIdentity} from '../functions/accountIdentityLegacy.mjs';

export const PROJECT='asteria-ttrpg';
export const BATCH_SIZE=500;
const APPROVAL='MIGRATE-ASTERIA-EXISTING-ACCOUNTS';
const invalid=reason=>{throw new Error(reason);};

export function validateMigrationArguments(argv=[],env={}) {
  if(argv.length!==4||argv[0]!=='--project'||argv[1]!==PROJECT||
     argv[2]!=='--mode'||!['preview','apply'].includes(argv[3]))
    invalid('Usage: --project asteria-ttrpg --mode preview|apply');
  if(argv[3]==='apply' && (env.ASTERIA_ACCOUNT_ID_MIGRATION_APPROVAL!==APPROVAL ||
      env.GITHUB_ACTIONS==='true'||env.CI==='true'))
    invalid('Apply requires local operator approval and must not run in CI.');
  return {project:PROJECT,mode:argv[3]};
}

export async function collectMigrationInventory({auth,db,inspect=inspectLegacyAccountIdentity}){
  if(typeof auth?.listUsers!=='function'||typeof auth?.getUser!=='function'||
     db?.projectId!==PROJECT)invalid('Unexpected production project or missing trusted services.');
  const records=[];
  const summary={total:0,eligible:0,alreadyAssigned:0,manualReview:0};
  // Static diagnostics only. Never include UID, username, email or profile data.
  const knownReasons=new Set([
    'auth-account-unavailable','profile-missing','profile-uid-mismatch',
    'invalid-username','username-normalization-mismatch','auth-profile-mismatch',
    'identity-mapping-inconsistent','untrusted-identity-fields'
  ]);
  const reasonCounts=Object.create(null);
  let token;
  const seenTokens=new Set();
  do {
    const page=await auth.listUsers(BATCH_SIZE,token);
    if(!page||!Array.isArray(page.users))invalid('Incomplete Auth listing; no writes.');
    for(const user of page.users){
      if(typeof user?.uid!=='string')invalid('Malformed Auth account listing.');
      const result=await inspect(db,auth,user.uid);
      summary.total++;
      if(result?.status==='eligible') {summary.eligible++;records.push({uid:user.uid,username:result.username});}
      else if(result?.status==='already-assigned')summary.alreadyAssigned++;
      else {
        summary.manualReview++;
        const reason=knownReasons.has(result?.reason)?result.reason:'unclassified';
        reasonCounts[reason]=(reasonCounts[reason]||0)+1;
      }
    }
    token=page.pageToken;
    if(token){
      if(typeof token!=='string'||seenTokens.has(token))invalid('Invalid Auth pagination.');
      seenTokens.add(token);
    }
  } while(token);
  return {summary,records,reasonCounts:Object.fromEntries(Object.entries(reasonCounts).sort())};
}

/**
 * Apply starts only after the full preview returns no manual-review records.
 * Each UID is revalidated before an idempotent transactional assignment.
 * A transient failure stops immediately; rerunning cannot regenerate IDs.
 */
export async function runMigration({auth,db,mode,inspect,backfill=backfillLegacyAccountIdentity,
  onProgress=()=>{}}){
  if(!['preview','apply'].includes(mode))invalid('Unknown migration mode.');
  const inventory=await collectMigrationInventory({auth,db,inspect});
  const summary={...inventory.summary,assigned:0,failed:0};
  const reasonCounts=inventory.reasonCounts;
  onProgress({phase:'inventory',...summary,reasonCounts});
  if(mode==='preview')return {mode,summary,reasonCounts,
    decision:summary.manualReview===0?'READY':'REVIEW REQUIRED'};
  if(summary.manualReview!==0)
    invalid('Existing account identities need reconciliation; no migration writes were made.');
  for(const record of inventory.records) {
    try{
      const outcome=await backfill(db,auth,record.uid,{
        enabled:true,projectId:PROJECT,
        confirmation:'BACKFILL-ACCOUNT-ID:'+record.uid
      });
      if(outcome.status==='assigned')summary.assigned++;
      else if(outcome.status==='already-assigned')summary.alreadyAssigned++;
      else invalid('Unexpected backfill status.');
    }catch{
      summary.failed++;
      onProgress({phase:'halted',...summary});
      invalid('Migration stopped on an account error. Previous assignments remain permanent; investigate privately.');
    }
  }
  onProgress({phase:'completed',...summary});
  return {mode,summary,decision:summary.failed===0?'COMPLETED':'INCOMPLETE'};
}

async function main(){
  const args=validateMigrationArguments(process.argv.slice(2),process.env);
  const {initializeApp,applicationDefault,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const {getAuth}=await import('firebase-admin/auth');
  const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},'account-id-existing-migration');
  try{
    const db=getFirestore(app);
    if(db.projectId!==PROJECT)invalid('Project mismatch.');
    const result=await runMigration({db,auth:getAuth(app),mode:args.mode,
      onProgress:item=>process.stdout.write(JSON.stringify(item)+'\n')});
    process.stdout.write(JSON.stringify(result)+'\n');
    if(result.decision==='REVIEW REQUIRED')process.exitCode=2;
  } finally{await deleteApp(app);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    process.stderr.write('Account ID migration stopped: '+error.message+'\n');
    process.exitCode=1;
  });
}
