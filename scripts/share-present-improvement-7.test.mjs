import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  audienceRevealUid,validateAudienceRevealAction,safeAudienceReveal,
  gmAudienceRevealRows
} from '../src/state/presentationAudienceRevealModel.mjs';
import {createPresentationAudienceRevealCommands}
  from '../functions/presentationAudienceRevealCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const root='campaigns/phase7/';
const scene={scene:'title',revision:3,title:'Opening'};
const action=(audience,targetUid)=>({type:'show',audience,targetUid,
  sceneRevision:3,title:'Secret signal',body:'The hidden door opens.'});
function harness({gm=true,member=true,viewer=true,epoch='epoch-7'}={}){
  const docs=new Map([
    [root+'presentationShared/current',scene],
    [root+'presentationRestricted/current',{...scene,epoch}],
    [root+'hybridSessionControl/current',{status:'open',epoch,
      expiresAt:new Date(Date.now()+600000)}],
    [root+'hybridViewerGrants/guest-7',{uid:'guest-7',
      status:viewer?'active':'pending',epoch,
      expiresAt:new Date(Date.now()+500000)}],
    [root+'members/player-7',{uid:'player-7',campaignId:'phase7',
      role:'player',status:member?'active':'blocked'}]
  ]);
  const writes=[];
  const doc=(_db,...parts)=>parts.join('/');
  const tx={
    get:async path=>({exists:()=>docs.has(path),data:()=>docs.get(path)}),
    set:(path,value)=>{docs.set(path,value);writes.push({path,kind:'set'});},
    delete:path=>{docs.delete(path);writes.push({path,kind:'delete'});}
  };
  const context={db:{doc:path=>path},doc,currentUser:{uid:'gm-7'},
    serverTimestamp:()=>new Date(),runTransaction:async(_db,run)=>run(tx)};
  const command=createPresentationAudienceRevealCommands(context,{
    requireCampaignGM:async()=>{if(!gm)throw Error('Only the GM can reveal content.');
      return {id:'phase7',ownerUid:'gm-7',membershipSchemaVersion:2};
    }
  }).manageAudienceReveal;
  return {docs,writes,run:a=>command('phase7','gm-scope',a)};
}
test('Improvement 7: exact text-only allowlist and fixed UID scope',()=>{
  assert.equal(audienceRevealUid('player-7'),true);
  assert.equal(audienceRevealUid('../player'),false);
  assert.deepEqual(validateAudienceRevealAction(action('member','player-7')),
    action('member','player-7'));
  for(const invalid of [
    {...action('member','player-7'),gmNotes:'private'},
    {...action('member','player-7'),title:'X'.repeat(121)},
    {...action('member','player-7'),body:'X'.repeat(381)},
    {...action('member','player-7'),sceneRevision:-1},
    {...action('gm','player-7')},
    {type:'clear',audience:'member',targetUid:'../target'}
  ])assert.throws(()=>validateAudienceRevealAction(invalid));
});
test('Improvement 7: GM writes safe scoped text to active member only',async()=>{
  const h=harness(),a=await h.run(action('member','player-7'));
  assert.equal(a.ok,true,a.error);
  assert.deepEqual(h.writes,[{path:root+'presentationAudienceReveals/member_player-7',kind:'set'}]);
  const record=h.docs.get(h.writes[0].path);
  assert.equal(record.targetUid,'player-7');
  assert.equal(record.body,'The hidden door opens.');
  assert.equal('gmNotes' in record,false);
  assert.equal(safeAudienceReveal(record,'other','member',scene),null);
  assert.equal(safeAudienceReveal(record,'player-7','restricted',scene,'epoch-7'),null);
  assert.equal(safeAudienceReveal(record,'player-7','member',{...scene,revision:4}),null);
  assert.equal(safeAudienceReveal(record,'player-7','member',{scene:'blank',revision:3}),null);
  assert.equal(safeAudienceReveal(record,'player-7','member',scene)?.title,'Secret signal');
});
test('Improvement 7: restricted guest must have active, current-epoch grant',async()=>{
  const h=harness();
  let value=await h.run(action('restricted','guest-7'));
  assert.equal(value.ok,true,value.error);
  const record=h.docs.get(root+'presentationAudienceReveals/restricted_guest-7');
  assert.equal(record.sessionEpoch,'epoch-7');
  assert.equal(safeAudienceReveal(record,'guest-7','restricted',
    {...scene,revision:3},'epoch-7')?.body,'The hidden door opens.');
  assert.equal(safeAudienceReveal(record,'guest-7','restricted',scene,'old'),null);
  const pending=harness({viewer:false});
  value=await pending.run(action('restricted','guest-7'));
  assert.equal(value.ok,false);
  assert.equal(pending.writes.length,0);
});
test('Improvement 7: GM, membership, revision and blackout denials are atomic',async()=>{
  for(const settings of [{gm:false},{member:false}]){
    const h=harness(settings),result=await h.run(action('member','player-7'));
    assert.equal(result.ok,false);
    assert.equal(h.writes.length,0);
  }
  const stale=harness(),bad=await stale.run({...action('member','player-7'),sceneRevision:2});
  assert.equal(bad.ok,false);
  assert.equal(stale.writes.length,0);
  stale.docs.set(root+'presentationShared/current',{scene:'blank',revision:3});
  assert.equal((await stale.run(action('member','player-7'))).ok,false);
  assert.equal(stale.writes.length,0);
});
test('Improvement 7: clearing is scoped by audience and does not publish scene',async()=>{
  const h=harness();
  await h.run(action('member','player-7'));
  const result=await h.run({type:'clear',audience:'member',targetUid:'player-7'});
  assert.equal(result.ok,true,result.error);
  assert.equal(h.docs.has(root+'presentationAudienceReveals/member_player-7'),false);
  assert.equal(h.writes.some(x=>x.path.includes('presentationShared')),false);
});
test('Improvement 7: GM listings omit bodies and previously published scenes',()=>{
  const records=[{targetUid:'player-7',audience:'member',sceneRevision:3,
    title:'Title',body:'HIDDEN TEXT'},
    {targetUid:'other',audience:'member',sceneRevision:2,title:'Old',body:'OLD'}];
  const rows=gmAudienceRevealRows(records,scene);
  assert.equal(rows.length,1);
  assert.equal(rows[0].targetUid,'player-7');
  assert.doesNotMatch(JSON.stringify(rows),/HIDDEN TEXT|OLD/);
});
test('Improvement 7: same existing Firebase system, per-recipient guarded renderer',()=>{
  const rules=read('firestore.rules');
  const server=read('functions/handler.mjs');
  const commands=read('functions/commands.mjs');
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const player=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const guest=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const card=read('frontend/src/dashboard/AudienceRevealCard.jsx');
  assert.match(rules,/match \/presentationAudienceReveals\/\{recipientKey\}/);
  assert.match(rules,/recipientKey == 'member_' \+ request\.auth\.uid/);
  assert.match(rules,/recipientKey == 'restricted_' \+ request\.auth\.uid/);
  assert.match(rules,/allow create, update, delete: if false/);
  assert.match(server,/'manageAudienceReveal'/);
  assert.match(commands,/createPresentationAudienceRevealCommands/);
  assert.match(service,/function watchAudienceReveal\(/);
  assert.match(service,/function watchGMAudienceReveals\(/);
  assert.match(service,/function manageAudienceReveal\(/);
  assert.match(player,/<AudienceRevealCard/);
  assert.match(guest,/<AudienceRevealCard/);
  assert.match(card,/safeAudienceReveal\(/);
  assert.doesNotMatch(card,/getDownloadURL|window\.localStorage|setDoc|updateDoc/);
  assert.match(player,/<GMScreenCaptureControls/);
});
