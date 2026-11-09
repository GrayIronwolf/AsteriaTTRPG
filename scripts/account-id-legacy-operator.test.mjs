import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareLegacyOperatorRequest,performLegacyOperatorRequest}
  from './account-id-legacy-operator.mjs';

const uid='alice',projectId='asteria-ttrpg';
const base=['--project',projectId,'--uid',uid,'--mode','inspect'];
const backfill=['--project',projectId,'--uid',uid,'--mode','backfill',
  '--confirm','BACKFILL-ACCOUNT-ID:alice','--expected-username','Asteria'];
const enabled={ASTERIA_LEGACY_ACCOUNT_IDS_BACKFILL_ENABLED:'1'};
const db={projectId},auth={getUser:async()=>({uid})};

test('inspection requires a single valid UID and production project',()=>{
 assert.deepEqual(prepareLegacyOperatorRequest(base,{}),{projectId,uid,mode:'inspect'});
 for(const args of [
  [...base,'--confirm','BACKFILL-ACCOUNT-ID:alice'],
  [...base,'--uid','bob'],
  ['--project','demo-asteria','--uid',uid,'--mode','inspect'],
  ['--project',projectId,'--uid','../escape','--mode','inspect'],
  [...base,'--unknown','1']
 ])assert.throws(()=>prepareLegacyOperatorRequest(args,{}));
});
test('backfill must explicitly opt in and pass confirmed UID and reviewed username',()=>{
 assert.deepEqual(prepareLegacyOperatorRequest(backfill,enabled),
   {projectId,uid,mode:'backfill',confirmation:'BACKFILL-ACCOUNT-ID:alice',
     expectedUsername:'Asteria'});
 for(const [args,env] of [
  [backfill,{}],[backfill,{...enabled,CI:'true'}],
  [backfill,{...enabled,GITHUB_ACTIONS:'true'}],
  [backfill.map(x=>x==='BACKFILL-ACCOUNT-ID:alice'?'BACKFILL-ACCOUNT-ID:bob':x),enabled],
  [backfill.map(x=>x==='Asteria'?'not valid username':x),enabled],
  [backfill.slice(0,-2),enabled]
 ])assert.throws(()=>prepareLegacyOperatorRequest(args,env));
});
test('inspection is read only and returns no account email',async()=>{
 let calls=0;
 const request=prepareLegacyOperatorRequest(base,{});
 const result=await performLegacyOperatorRequest(request,{
  db,auth,inspect:async()=>({status:'eligible',username:'Asteria',
    email:'secret@example.test'}),
  backfill:async()=>{calls++;throw Error('should not write');}
 });
 assert.equal(result.status,'eligible');
 assert.equal(result.writesPerformed,false);
 assert.equal(calls,0);
 assert.doesNotMatch(JSON.stringify(result),/secret/);
});
test('single UID migration rejects review mismatches and wrong project',async()=>{
 const request=prepareLegacyOperatorRequest(backfill,enabled);
 let writes=0;
 const inspected=async()=>({status:'eligible',username:'Wrong'});
 const backfillFn=async()=>{writes++;return {status:'assigned'};};
 await assert.rejects(performLegacyOperatorRequest(request,{
  db,auth,inspect:inspected,backfill:backfillFn}),/reconciliation/);
 await assert.rejects(performLegacyOperatorRequest(request,{
  db:{projectId:'demo-asteria'},auth,inspect:inspected,backfill:backfillFn}));
 assert.equal(writes,0);
});
test('reviewed one-account backfill is explicit and no-op when already assigned',async()=>{
 const request=prepareLegacyOperatorRequest(backfill,enabled);
 let writes=0;
 const inspect=async()=>({status:'eligible',username:'Asteria'});
 const backfill=async(_db,_auth,uidArg,opts)=>{
  assert.equal(uidArg,uid);
  assert.equal(opts.projectId,projectId);
  assert.equal(opts.confirmation,'BACKFILL-ACCOUNT-ID:alice');
  assert.equal(opts.enabled,true);
  writes++;return {status:'assigned',accountId:'Asteria#01416'};
 };
 const assigned=await performLegacyOperatorRequest(request,{db,auth,inspect,backfill});
 assert.deepEqual(assigned,{status:'assigned',accountId:'Asteria#01416',
   writesPerformed:true});
 assert.equal(writes,1);
 const repeated=await performLegacyOperatorRequest(request,{
  db,auth,inspect:async()=>({status:'already-assigned',username:'Asteria'}),
  backfill
 });
 assert.deepEqual(repeated,{status:'already-assigned',writesPerformed:false});
 assert.equal(writes,1);
});
test('operator module is not a callable, bulk scanner or an automated CI migration',()=>{
 const cli=readFileSync(new URL('./account-id-legacy-operator.mjs',import.meta.url),'utf8');
 const api=readFileSync(new URL('../functions/index.mjs',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/firebase-deploy.yml',import.meta.url),'utf8');
 assert.doesNotMatch(cli,/listUsers\(|onCall\(|workflow_dispatch/);
 assert.doesNotMatch(api,/account-id-legacy-operator|backfillLegacyAccountIdentity/);
 assert.doesNotMatch(workflow,/account-id-legacy-operator|backfillLegacyAccountIdentity/);
 assert.match(cli,/ASTERIA_LEGACY_ACCOUNT_IDS_BACKFILL_ENABLED/);
});
