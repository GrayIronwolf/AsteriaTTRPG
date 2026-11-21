import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPlayerPresentationCommands} from '../functions/playerPresentationCommands.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const campaign='improvement-one',prefix='campaigns/'+campaign+'/';
const control=prefix+'presentationControl/current';
const shared=prefix+'presentationShared/current';
const restricted=prefix+'presentationRestricted/current';
const combat=prefix+'presentationCombat/current';
const session=prefix+'hybridSessionControl/current';
const access=prefix+'presentationAssetAccess/current';
function setup(allowGM=true){
  const data=new Map([
    [control,{revision:5,scene:'battle-map',theme:'obsidian'}],
    [shared,{revision:5,scene:'battle-map',mapId:'secret'}],
    [restricted,{scene:'battle-map',epoch:'old'}],
    [combat,{active:true,epoch:'old',privateNotes:'SECRET'}],
    [session,{revision:8,status:'open',epoch:'old',mode:'hybrid'}],
    [access,{scene:'battle-map',mapId:'secret',viewerExpiries:{guest:new Date(Date.now()+100000)}}]
  ]);
  const saved=[];
  const doc=(_db,...segments)=>({path:segments.join('/')});
  const transaction={
    get:async ref=>({exists:()=>data.has(ref.path),data:()=>data.get(ref.path)}),
    set:(ref,value,options)=>{saved.push(ref.path);data.set(ref.path,options?.merge?
      {...(data.get(ref.path)||{}),...value}:value);}
  };
  const commands=createPlayerPresentationCommands({
    db:{},doc,currentUser:{uid:allowGM?'gm':'guest'},
    runTransaction:async(_db,callback)=>callback(transaction),
    serverTimestamp:()=>42
  },{requireCampaignGM:async()=>{if(!allowGM)throw Error('GM access required.');}});
  return {data,saved,call:()=>commands.emergencyStopPresentation(campaign,'gm-scope',{})};
}

test('Improvement 1: emergency shutdown atomically blacks out every staging channel',async()=>{
  const h=setup();
  const result=await h.call();
  assert.equal(result.ok,true,result.error);
  assert.equal(result.status,'stopped');
  assert.equal(h.data.get(control).scene,'blank');
  assert.equal(h.data.get(shared).scene,'blank');
  assert.equal(h.data.get(restricted).scene,'blank');
  assert.equal(h.data.get(combat).active,false);
  assert.equal(h.data.get(session).status,'closed');
  assert.equal(h.data.get(session).epoch,'');
  assert.equal(h.data.get(access).scene,'blank');
  assert.equal(h.data.get(access).mapId,'');
  assert.equal(h.data.get(access).assetId,'');
  assert.deepEqual(h.data.get(access).viewerExpiries,{});
  assert.equal(h.data.get(access).expiresAt.getTime(),0);
  assert.deepEqual([...new Set(h.saved)].sort(),[control,shared,restricted,combat,session,access].sort());
  assert.doesNotMatch(JSON.stringify([...h.data.values()]),/SECRET/);
});

test('Improvement 1: repeated emergency action does not depend on stale revision or open session',async()=>{
  const h=setup();
  const one=await h.call(),two=await h.call();
  assert.equal(one.ok,true);
  assert.equal(two.ok,true,two.error);
  assert.equal(h.data.get(control).revision,7);
  assert.equal(h.data.get(session).revision,10);
});

test('Improvement 1: an unauthorised actor cannot change any presentation document',async()=>{
  const h=setup(false);
  const original=[...h.data.entries()];
  assert.equal((await h.call()).ok,false);
  assert.deepEqual([...h.data.entries()],original);
  assert.deepEqual(h.saved,[]);
});

test('Improvement 1: UI immediately stops locally and never assumes remote success',()=>{
  const capture=read('frontend/src/dashboard/GMScreenCaptureControls.jsx');
  const controller=read('frontend/src/dashboard/CampaignPresentationWorkspace.jsx');
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  assert.match(capture,/const stopAndBlackout=async\(\)=>\{\s*\/\/[\s\S]*?stop\(\);/);
  assert.match(capture,/api\.emergencyStopPresentation\(campaignId\)/);
  assert.match(capture,/remote blackout\/revocation is NOT confirmed/);
  assert.match(capture,/data-testid="site-screen-capture-emergency"/);
  assert.doesNotMatch(capture,/disabled=\{busy\|\|session\.loading/);
  assert.match(controller,/GMScreenCaptureControls/);
  assert.match(service,/action:'emergencyStopPresentation'/);
  assert.match(service,/response\.data\?\.ok!==true/);
});

test('Improvement 1: fogged originals are never sent to invited nonmembers',()=>{
  const rules=read('storage.rules');
  assert.match(rules,/original\.get\('fogEnabled',false\) != true/);
  assert.match(rules,/activeRestrictedBattleMap\(campaignId,mapId\)/);
  assert.match(rules,/viewerExpiries/);
});

test('Improvement 1: stale Phase 7.1 Blackout browser selector scoped to GM controller',()=>{
  const script=read('scripts/site-combat-phase7-1-browser.cjs');
  assert.match(script,/getByTestId\('site-gm-presentation'\)[\s\S]{0,100}getByRole\('button',\{name:'Blackout',exact:true\}\)/);
});
