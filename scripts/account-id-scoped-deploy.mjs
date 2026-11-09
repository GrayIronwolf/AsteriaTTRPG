/**
 * Prepare a one-function Firebase CLI discovery entry, without importing
 * unrelated campaign email/signing secret definitions.
 *
 * The generated entry copies the actual Account ID callable implementation
 * verbatim from functions/index.mjs. It is ephemeral in the GitHub Actions
 * runner. No source file in the Git repository is changed by this preparation.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const relativeEntry='functions/accountIdentityScopedDeployEntry.mjs';
const target='asteria-ttrpg';
const originalMain='functions/index.mjs';
const startMarker='// Phase 1.3: authenticated, server-controlled Account ID finalization.';
const declaration='export const asteriaAccountIdentity=onCall({';
const forbidden=/ASTERIA_RESEND_API_KEY|ASTERIA_SECURE_INVITE_SIGNING_KEY|defineSecret\(|asteriaCampaignEmailInvitations|asteriaSecureInvitation/;
const exactHandlerStarts=/^export const asteriaAccountIdentity=onCall\(\{/m;

export function buildScopedAccountIdentityEntry(indexSource){
  if(typeof indexSource!=='string')throw Error('Missing Firebase functions source.');
  const pos=indexSource.lastIndexOf(startMarker);
  if(pos<0||indexSource.indexOf(startMarker)!==pos)
    throw Error('Expected unique Account ID source boundary missing.');
  const block=indexSource.slice(pos).trimEnd();
  if(block.indexOf(declaration)<0||
     (block.match(/export const /g)||[]).length!==1||
     !block.endsWith('});')||
     forbidden.test(block)||
     /\bimport\s+/.test(block)||
     !block.includes("process.env.ASTERIA_ACCOUNT_IDS_ENABLED!=='1'")||
     !block.includes('ASTERIA_ACCOUNT_IDS_REGISTRATION_NOT_BEFORE')||
     !block.includes('issueNewRegistrationAccountId(getFirestore(),firebaseUser,request.auth.uid,'))
    throw Error('Account ID source is no longer safe to isolate.');
  const entry=[
    "import {initializeApp,getApps} from 'firebase-admin/app';",
    "import {getFirestore} from 'firebase-admin/firestore';",
    "import {getAuth} from 'firebase-admin/auth';",
    "import {onCall,HttpsError} from 'firebase-functions/v2/https';",
    "if(!getApps().length)initializeApp();",
    '',
    block,
    ''
  ].join('\n');
  if(forbidden.test(entry)||
     (entry.match(exactHandlerStarts)||[]).length!==1||
     (entry.match(/export const /g)||[]).length!==1)
    throw Error('Scoped entry unexpectedly references another function.');
  return entry;
}

export function checkScopedAccountIdDeployment({
  source=readFileSync(resolve(root,originalMain),'utf8'),
  manifest=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')),
  firebase=JSON.parse(readFileSync(resolve(root,'firebase.json'),'utf8'))
}={}){
  const generated=buildScopedAccountIdentityEntry(source);
  if(manifest.main!==originalMain||
     !Array.isArray(firebase.functions)||
     firebase.functions.length!==1||
     firebase.functions[0].source!=='.'||
     firebase.functions[0].codebase!=='asteria')
    throw Error('Unexpected Firebase package or codebase settings.');
  return {ready:true,originalMain,temporaryMain:relativeEntry,
    exportCount:1,accountIdGenerationEnabled:false,
    unrelatedSecretDeclarations:false,entry:generated};
}

export function prepareScopedAccountIdDeploy({
  env=process.env,read=path=>readFileSync(resolve(root,path),'utf8'),
  write=(path,contents)=>writeFileSync(resolve(root,path),contents)
}={}){
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_ACCOUNT_ID_SCOPED_DEPLOY!=='1'||
     env.ASTERIA_DEPLOY_PROJECT!==target)
    throw Error('Scoped Account ID preparation is restricted to the approved production workflow.');
  const source=read(originalMain);
  const manifest=JSON.parse(read('package.json'));
  const firebase=JSON.parse(read('firebase.json'));
  const check=checkScopedAccountIdDeployment({source,manifest,firebase});
  const isolated={...manifest,main:relativeEntry};
  // Fail before any writes. The only modified paths are runner-local.
  write(relativeEntry,check.entry);
  write('package.json',JSON.stringify(isolated,null,2)+'\n');
  return {ready:true,scope:'functions:asteria:asteriaAccountIdentity',
    sourceCodebase:'asteria',secretManagerReferences:0,
    productionFeatureFlagsChanged:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length===3&&process.argv[2]==='--check'){
      const result=checkScopedAccountIdDeployment();
      const {entry,...safe}=result;
      process.stdout.write(JSON.stringify(safe)+'\n');
    }else if(process.argv.length===3&&process.argv[2]==='--prepare'){
      process.stdout.write(JSON.stringify(prepareScopedAccountIdDeploy())+'\n');
    }else throw Error('Only --check or explicitly gated --prepare is supported.');
  }catch{
    process.stderr.write('Account ID scoped deployment preflight denied.\n');
    process.exitCode=1;
  }
}
