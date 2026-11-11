/**
 * Single trusted read-only production inventory for Campaign v2/Friends.
 * Invoked only by .github/workflows/firebase-deploy.yml on main.
 * Deliberately never emits function JSON, secret values, rule source, tokens,
 * user data or backup bucket names to stdout or GitHub's job summary.
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditLive} from './firebase-production-backup-audit.mjs';
import {inspectCoordinatedSource,evaluateProductionSnapshot,
  renderReleaseReport,FLAG_OWNERS} from './campaign-coordinated-readiness.mjs';

const PROJECT='asteria-ttrpg',REGION='us-central1';
const read=(command,args,timeout=90000)=>{
  try{
    return execFileSync(command,args,{
      encoding:'utf8',timeout,maxBuffer:12*1024*1024,
      stdio:['ignore','pipe','pipe']
    });
  }catch{return null;}
};
const cloud=(args)=>read('gcloud',[...args,'--project='+PROJECT,'--quiet']);
const json=value=>{try{return value?JSON.parse(value):null;}catch{return null;}};
const leaf=name=>typeof name==='string'?name.split('/').pop():'';
function requireTrustedContext(env=process.env){
  if(env.GITHUB_ACTIONS!=='true'||
     env.GITHUB_REPOSITORY!=='GrayIronwolf/AsteriaTTRPG'||
     env.GITHUB_REF!=='refs/heads/main'||
     env.GITHUB_EVENT_NAME!=='workflow_dispatch'||
     env.ASTERIA_COORDINATED_OPERATION!=='campaign-coordinated-readiness-audit'||
     env.ASTERIA_AUDIT_OPERATION!=='campaign-coordinated-readiness-audit'||
     env.ASTERIA_COORDINATED_CONFIRMATION!==''||
     typeof env.GITHUB_STEP_SUMMARY!=='string'||
     !env.GITHUB_STEP_SUMMARY.startsWith('/'))
    throw Error('Coordinated live inventory requires the existing approved main-only read-only operation.');
}
function listFunctions(){
  const data=json(cloud(['functions','list','--regions='+REGION,'--v2','--format=json']));
  if(!Array.isArray(data))return [];
  return data.map(item=>({name:item.name,state:item.state}));
}
function describeFunction(name){
  const data=json(cloud(['functions','describe',name,'--gen2','--region='+REGION,'--format=json']));
  if(!data||leaf(data.name)!==name)return null;
  const environment=data.serviceConfig?.environmentVariables||{};
  // Copy approved flag names only, normalize each as 0, 1 or UNKNOWN.
  const allowed=FLAG_OWNERS[name]||[];
  const safeEnv={};
  for(const flag of allowed){
    const value=environment[flag];
    safeEnv[flag]=value==='0'||value==='1'?value:'UNKNOWN';
  }
  return {name:data.name,state:data.state,serviceConfig:{environmentVariables:safeEnv}};
}
function signingSecretReady(){
  const data=cloud(['secrets','versions','list','ASTERIA_SECURE_INVITE_SIGNING_KEY',
    '--filter=state=ENABLED','--format=value(name)']);
  return {enabled:typeof data==='string'&&data.trim().length>0};
}
function ruleset(kind){
  const name=kind==='firestore'?'cloud.firestore':'firebase.storage/'+
    'asteria-ttrpg.firebasestorage.app';
  const prefix='https://firebaserules.googleapis.com/v1/';
  const token=cloud(['auth','print-access-token']);
  if(!token||!/^[A-Za-z0-9._-]{15,4096}\s*$/.test(token))return null;
  const headers=['-fsS','--retry','1','--max-time','30','-H',
    'Authorization: Bearer '+token.trim()];
  const release=json(read('curl',[...headers,prefix+'projects/'+PROJECT+'/releases/'+name]));
  const resource=release?.rulesetName;
  if(typeof resource!=='string'||
     !new RegExp('^projects/'+PROJECT+'/rulesets/[A-Za-z0-9_-]+$').test(resource))
    return null;
  const rules=json(read('curl',[...headers,prefix+resource]));
  if(!Array.isArray(rules?.source?.files))return null;
  return {source:{files:rules.source.files.map(file=>({content:file?.content}))}};
}
export function collectProductionSnapshot(){
  const inventory=listFunctions();
  const wanted=new Set(Object.keys(FLAG_OWNERS));
  const descriptions={};
  for(const item of inventory){
    const name=leaf(item.name);
    if(wanted.has(name)&&!Object.hasOwn(descriptions,name)){
      descriptions[name]=describeFunction(name);
    }
  }
  const backup=auditLive();
  // Backup metadata being visible does not prove a successfully restored backup.
  return {
    project:PROJECT,region:REGION,functions:inventory,descriptions,
    signingSecret:signingSecretReady(),
    rules:{firestore:ruleset('firestore'),storage:ruleset('storage')},
    backup:{metadataReadable:backup?.coreReadable===true}
  };
}
function main(){
  if(process.argv.length!==3||process.argv[2]!=='--live')
    throw Error('Use --live only through the existing trusted Firebase workflow.');
  requireTrustedContext();
  const source=inspectCoordinatedSource();
  const snapshot=collectProductionSnapshot();
  const report=evaluateProductionSnapshot(snapshot,{manifest:source.manifest});
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,renderReleaseReport(report)+'\n');
  // Preserve a successful *read-only inspection* even when the release is NO-GO.
  // auditLive may set exitCode=2 for unreadable backup metadata; the report
  // carries that as an explicit blocker, not as a false-success release decision.
  process.exitCode=0;
  console.log('Coordinated read-only production audit complete: '+report.installedFunctions+
    '/'+report.expectedFunctions+' expected functions ACTIVE; '+
    report.blockers.length+' release blockers; final activation decision NO-GO.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}catch(error){
    console.error('Coordinated production inventory could not be verified. No production writes were attempted.');
    process.exitCode=2;
  }
}
