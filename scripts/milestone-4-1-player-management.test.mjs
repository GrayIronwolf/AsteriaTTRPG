import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ATTENDANCE_VALUES,attendanceSummary,validateAttendanceInput,
  listCampaignAttendance,updateCampaignAttendance
} from '../functions/campaignAttendance.mjs';
import {gmPlayerManagerAccess} from '../src/state/gmPlayerManagerModel.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function fixture(){
  const dbRows=new Map([
    ['campaigns/c',{ownerUid:'gm',membershipSchemaVersion:2}],
    ['campaigns/c/members/gm',{uid:'gm',campaignId:'c',role:'owner',status:'active'}],
    ['campaigns/c/members/co',{uid:'co',campaignId:'c',role:'co-gm',status:'active'}],
    ['campaigns/c/members/alice',{uid:'alice',campaignId:'c',role:'player',status:'active'}],
    ['campaigns/c/members/bob',{uid:'bob',campaignId:'c',role:'player',status:'suspended'}]
  ]);
  const reference=path=>({path,get:async()=>({
    exists:dbRows.has(path),data:()=>dbRows.get(path)
  })});
  const db={
    doc:reference,
    collection:path=>({limit:n=>({get:async()=>{
      const docs=[...dbRows.entries()].filter(([key])=>key.startsWith(path+'/')&&
        !key.slice(path.length+1).includes('/')).slice(0,n)
        .map(([key,data])=>({id:key.slice(path.length+1),data:()=>data}));
      return {size:docs.length,docs};
    }})}),
    runTransaction:async fn=>fn({
      get:ref=>ref.get(),
      set:(ref,row)=>dbRows.set(ref.path,row)
    })
  };
  return {db,dbRows};
}
const input={campaignId:'c',memberUid:'alice',mode:'remote',expectedRevision:0};
test('4.1 attendance values strictly separate from online presence and campaign roles',()=>{
  assert.deepEqual(ATTENDANCE_VALUES,['not-participating','in-person','remote']);
  assert.deepEqual(validateAttendanceInput(input),input);
  for(const invalid of [
    {...input,mode:'online'},{...input,mode:'in-combat'},
    {...input,memberUid:'__proto__'},{...input,expectedRevision:1.5},
    {...input,extraField:'forceMember'},null
  ])assert.throws(()=>validateAttendanceInput(invalid));
  assert.equal(attendanceSummary({uid:'alice',mode:'unknown',revision:0}).mode,
    'not-participating');
});
test('4.1 owner and active co-GM can update with revision; players cannot',async()=>{
  const {db}=fixture();
  const first=await updateCampaignAttendance(db,'gm',input);
  assert.equal(first.revision,1);
  assert.equal(first.mode,'remote');
  await assert.rejects(updateCampaignAttendance(db,'alice',{
    ...input,mode:'in-person',expectedRevision:1}),/campaign GM/);
  await assert.rejects(updateCampaignAttendance(db,'gm',input),/changed/);
  const second=await updateCampaignAttendance(db,'co',{
    ...input,mode:'in-person',expectedRevision:1
  });
  assert.equal(second.revision,2);
  await assert.rejects(updateCampaignAttendance(db,'gm',{
    ...input,memberUid:'bob',expectedRevision:0
  }),/active campaign player/);
  const list=await listCampaignAttendance(db,'co','c');
  assert.deepEqual(list.entries.map(x=>[x.uid,x.mode]),[['alice','in-person']]);
  await assert.rejects(listCampaignAttendance(db,'alice','c'),/campaign GM/);
});
test('4.1 suspended Co-GM, stale membership and legacy campaign fail closed',async()=>{
  const {db,dbRows}=fixture();
  dbRows.get('campaigns/c/members/co').status='suspended';
  await assert.rejects(updateCampaignAttendance(db,'co',input),/campaign GM/);
  dbRows.get('campaigns/c').membershipSchemaVersion=1;
  await assert.rejects(updateCampaignAttendance(db,'gm',input),/Canonical/);
  await assert.rejects(listCampaignAttendance(db,'gm','c'),/Canonical/);
});
test('4.1 existing GM roster and character tools remain intact',()=>{
  const flags={campaignPlayerRoster:true,campaignAttendance:true};
  const campaign={id:'c',ownerUid:'gm',membershipSchemaVersion:2};
  assert.equal(gmPlayerManagerAccess({campaign,actorUid:'gm',flags}).attendance,true);
  assert.equal(gmPlayerManagerAccess({campaign,actorUid:'gm',flags:{
    campaignAttendance:true
  }}).attendance,false);
  assert.equal(gmPlayerManagerAccess({campaign,actorUid:'alice',flags}).attendance,false);
  const gm=source('src/dashboards/GMPlayerManager.jsx');
  const service=source('js/firebase-auth.js');
  const backend=source('functions/index.mjs');
  assert.match(gm,/data-testid="gm-player-manager"/);
  assert.match(gm,/Attendance for this session/);
  assert.match(gm,/Not Participating/);
  assert.match(gm,/In-person/);
  assert.match(gm,/Remote/);
  assert.match(gm,/firebaseService\.setCampaignAttendance/);
  assert.match(gm,/firebaseService\.listCampaignAttendance/);
  assert.match(service,/action:'attendance-set'/);
  assert.match(service,/action:'attendance-list'/);
  assert.match(backend,/ASTERIA_CAMPAIGN_ATTENDANCE_ENABLED/);
  assert.match(backend,/updateCampaignAttendance/);
  assert.match(gm,/Player tools/);
  assert.match(gm,/Request check/);
  assert.match(gm,/View sheet/);
  assert.match(source('index.html'),/campaignAttendance:false/);
});
