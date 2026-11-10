/**
 * Operator-owned single-command production release.
 * Full preview -> exact consent -> legacy migration -> backend general switch.
 * Public website is published only after this operation has succeeded.
 */
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {runMigration,PROJECT} from './account-id-existing-migration.mjs';
import {run as operator} from './account-id-canary-operator.mjs';

export const APPROVAL='COMPLETE-ASTERIA-ACCOUNT-IDS';
const stop=reason=>{throw new Error(reason);};
export async function completeAccountIdRelease({status,preview,approve,apply,activate}){
  const prior=await status();
  if(prior.issuance!=='DISABLED'||prior.cutoff!=='NOT SET'||
     !['UNVERIFIED AUTO-CANARY','VERIFIED-EMAIL CANARY'].includes(prior.rollout))
    stop('Unexpected existing backend configuration. No production changes made.');
  const plan=await preview();
  if(plan?.mode!=='preview'||plan?.decision!=='READY'||
     plan.summary?.manualReview!==0)
    stop('Existing accounts require reconciliation. No writes or activation performed.');
  if((await approve(plan.summary))!==APPROVAL)
    stop('Release approval not entered. No production changes made.');
  const migrated=await apply();
  if(migrated?.mode!=='apply'||migrated?.decision!=='COMPLETED'||
     migrated.summary?.failed!==0||migrated.summary?.manualReview!==0)
    stop('Migration incomplete. General release was not activated.');
  const active=await activate();
  if(active?.issuance!=='ENABLED'||active.rollout!=='GENERAL PUBLIC RELEASE'||
     active.generalRelease!=='APPROVED'||active.cutoff!=='CONFIGURED')
    stop('Backend activation was not confirmed. Run read-only status and disable if needed.');
  return {result:'BACKEND ACTIVATED; PUBLISH WEBSITE',existing:migrated.summary,
    newAccounts:'ENABLED WITHOUT EMAIL VERIFICATION'};
}
async function main(){
  if(process.argv.length!==4||process.argv[2]!=='--project'||process.argv[3]!==PROJECT||
     process.env.GITHUB_ACTIONS==='true'||process.env.CI==='true')
    stop('Run only in a trusted operator shell with --project asteria-ttrpg.');
  const {initializeApp,applicationDefault,deleteApp}=await import('firebase-admin/app');
  const {getFirestore}=await import('firebase-admin/firestore');
  const {getAuth}=await import('firebase-admin/auth');
  const app=initializeApp({credential:applicationDefault(),projectId:PROJECT},
    'account-id-coordinated-release');
  const rl=createInterface({input:stdin,output:stdout});
  try{
    const db=getFirestore(app),auth=getAuth(app);
    if(db.projectId!==PROJECT)stop('Production project mismatch.');
    const token=execFileSync('gcloud',['auth','print-access-token'],{
      encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:30000
    }).trim();
    const result=await completeAccountIdRelease({
      status:()=>operator({action:'status',token}),
      preview:()=>runMigration({auth,db,mode:'preview'}),
      approve:async summary=>{
        stdout.write('Eligible older accounts: '+summary.eligible+
          ', already assigned: '+summary.alreadyAssigned+
          ', unresolved: '+summary.manualReview+'\n');
        return rl.question('Activate migration and general Account IDs? Type '+APPROVAL+': ');
      },
      apply:()=>runMigration({auth,db,mode:'apply'}),
      activate:()=>operator({action:'release-general',token,
        ask:async()=> 'RELEASE-GENERAL'})
    });
    stdout.write(JSON.stringify(result)+'\n');
  }finally{
    rl.close();
    await deleteApp(app);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(error=>{
    process.stderr.write('Account ID release: '+error.message+'\n');
    process.exitCode=1;
  });
