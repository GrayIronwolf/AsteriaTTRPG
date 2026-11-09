/**
 * One-UID, operator-only legacy Account ID inspection/backfill.
 *
 * Never expose this CLI through a callable, workflow_dispatch UID input, or
 * public website. Invoke from an approved trusted administrator terminal.
 */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {normaliseAccountUsername} from '../functions/accountIdentity.mjs';
import {inspectLegacyAccountIdentity,backfillLegacyAccountIdentity}
  from '../functions/accountIdentityLegacy.mjs';

export const PRODUCTION_PROJECT='asteria-ttrpg';
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const FLAGS=new Set(['--project','--uid','--mode','--confirm','--expected-username']);
const invalid=()=>new Error('Invalid legacy Account ID operator request.');

export function prepareLegacyOperatorRequest(argv=[],env={}){
  if(!Array.isArray(argv)||argv.length<6||argv.length%2!==0)throw invalid();
  const args={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if(!FLAGS.has(key)||Object.prototype.hasOwnProperty.call(args,key)||
       typeof value!=='string'||!value||value.startsWith('--'))throw invalid();
    args[key]=value;
  }
  const projectId=args['--project'],uid=args['--uid'],mode=args['--mode'];
  if(projectId!==PRODUCTION_PROJECT||!UID.test(uid||'')||
     !['inspect','backfill'].includes(mode))throw invalid();
  const expectedUsername=args['--expected-username'];
  if(mode==='inspect'){
    if(expectedUsername!==undefined||args['--confirm']!==undefined||
       Object.keys(args).length!==3)throw invalid();
    return {projectId,uid,mode};
  }
  if(Object.keys(args).length!==5 ||
     args['--confirm']!==`BACKFILL-ACCOUNT-ID:${uid}`||
     env.ASTERIA_LEGACY_ACCOUNT_IDS_BACKFILL_ENABLED!=='1'||
     env.GITHUB_ACTIONS==='true'||env.CI==='true')
    throw new Error('Legacy Account ID writes require explicit per-account approval outside CI.');
  let username;
  try{username=normaliseAccountUsername(expectedUsername).username;}
  catch{throw invalid();}
  if(username!==expectedUsername)throw invalid();
  return {projectId,uid,mode,expectedUsername:username,
    confirmation:args['--confirm']};
}

/** Only this function can initiate one reviewed legacy account write. */
export async function performLegacyOperatorRequest(request,{
  db,auth,inspect=inspectLegacyAccountIdentity,
  backfill=backfillLegacyAccountIdentity
}={}){
  if(!request||request.projectId!==PRODUCTION_PROJECT||!UID.test(request.uid||'')||
     !['inspect','backfill'].includes(request.mode)||
     !db||db.projectId!==PRODUCTION_PROJECT||typeof auth?.getUser!=='function')
    throw invalid();
  const preview=await inspect(db,auth,request.uid);
  if(request.mode==='inspect')return {status:preview.status,
    username:preview.username||null,reason:preview.reason||null,
    writesPerformed:false};
  if(request.confirmation!==`BACKFILL-ACCOUNT-ID:${request.uid}`||
     request.expectedUsername!==preview.username||
     !['eligible','already-assigned'].includes(preview.status))
    throw new Error('Account requires manual reconciliation or operator re-review.');
  if(preview.status==='already-assigned')
    return {status:'already-assigned',writesPerformed:false};
  const result=await backfill(db,auth,request.uid,{
    enabled:true,projectId:PRODUCTION_PROJECT,confirmation:request.confirmation
  });
  return {status:result.status,accountId:result.accountId||null,
    writesPerformed:result.status==='assigned'};
}
async function main(){
  // Fail closed before loading credentials or opening backend connections.
  const request=prepareLegacyOperatorRequest(process.argv.slice(2),process.env);
  const {initializeApp,applicationDefault,deleteApp}=await import('firebase-admin/app');
  const {getAuth}=await import('firebase-admin/auth');
  const {getFirestore}=await import('firebase-admin/firestore');
  const app=initializeApp({credential:applicationDefault(),
    projectId:PRODUCTION_PROJECT},'account-id-legacy-operator');
  try{
    const result=await performLegacyOperatorRequest(request,{
      db:getFirestore(app),auth:getAuth(app)
    });
    // Output is suitable for private operator consoles only; never CI.
    process.stdout.write(JSON.stringify(result)+'\n');
  }finally{await deleteApp(app);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{
    process.stderr.write('Legacy Account ID operation was not completed. Review the account privately.\n');
    process.exitCode=1;
  });
}
