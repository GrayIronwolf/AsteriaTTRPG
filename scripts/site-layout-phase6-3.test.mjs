import test from 'node:test';
import assert from 'node:assert/strict';
import {gridRectanglesOverlap} from '../src/state/dashboardGridModel.mjs';
import {defaultDashboardLayout,normalizeDashboardLayout,dashboardLayoutForViewport,
  lockDashboardGridPanel,placeDashboardGridPanel,fitDashboardGridPanel,
  visibleDashboardPanels,applyDashboardPreset} from '../src/state/dashboardLayoutModel.mjs';
import {createLayoutHistory,pushLayoutHistory,undoLayoutHistory,redoLayoutHistory,
  updateViewportHistory,MAX_LAYOUT_UNDO} from '../frontend/src/layout/layoutHistoryModel.mjs';
import {createFirebaseGMDashboardService} from '../frontend/src/dashboard/firebaseGMDashboardService.mjs';
import {createFirebasePlayerDashboardService} from '../frontend/src/player/firebasePlayerDashboardService.mjs';

const cid='campaign123',owner='owner123',player='player123',charId='linkchar123',sourceId='source123';
const campaign={id:cid,ownerUid:owner,membershipSchemaVersion:2,
  party:[charId],playerCharacterLinks:{[charId]:player},
  characters:{[charId]:{ownerUid:player}},name:'Campaign'};
const membership={uid:player,campaignId:cid,role:'player',status:'active'};
const sheet={id:charId,ownerUid:player,sourceCharacterId:sourceId,
  sharedCampaignId:cid,status:'linked',hp:[17,30],inventory:['Sword']};
const source={id:sourceId,ownerUid:player,linkedCampaignIds:[cid],
  campaignCharacterIds:{[cid]:charId},journal:['secret']};
const fixtures={'campaigns/'+cid:campaign,'campaigns/'+cid+'/members/'+player:membership,
  'campaigns/'+cid+'/characters/'+charId:sheet,'users/'+player+'/characters/'+sourceId:source};
function mock(who,records=fixtures){
  const state=new Map(Object.entries(records)),auth={currentUser:{uid:who}};
  const snapshot=(key)=>({exists:()=>state.has(key),data:()=>state.get(key),id:key.split('/').at(-1)});
  const sdk={
    doc:(_db,...parts)=>parts.join('/'),
    getDocFromServer:async key=>snapshot(key),
    serverTimestamp:()=>({_seconds:1}),
    async runTransaction(_db,fn){
      const writes=[];
      const tx={get:async key=>snapshot(key),
        set:(key,value)=>writes.push([key,{...(state.get(key)||{}),...value}]),
        update:(key,value)=>{if(!state.has(key))throw Error('Missing record');
          writes.push([key,{...state.get(key),...value}]);}};
      await fn(tx);
      for(const [key,value] of writes)state.set(key,value);
    }
  };
  return {state,auth,db:{},firestoreSdk:sdk,readCanonical:async user=>({uid:user.uid})};
}
test('grid snapping honors locked positions and never overlaps',()=>{
  for(const role of ['gm','player']){
    const original=defaultDashboardLayout(role);
    const [first,second]=visibleDashboardPanels(original,role);
    const locked=lockDashboardGridPanel(original,role,second,true);
    const pin=locked.placements[second];
    let changed=placeDashboardGridPanel(locked,role,first,pin.x,pin.y);
    assert.deepEqual(changed.placements[second],pin);
    changed=fitDashboardGridPanel(changed,role,first,12,6);
    const ids=visibleDashboardPanels(changed,role);
    for(const a of ids)for(const b of ids)if(a!==b)
      assert.equal(gridRectanglesOverlap(changed.placements[a],changed.placements[b]),false,a+'/'+b);
    assert.equal(normalizeDashboardLayout(changed,role).version,4);
  }
});
test('undo, redo, viewport isolation and GM Focus preservation',()=>{
  const original=defaultDashboardLayout('gm');
  let history=createLayoutHistory({...original,focusModes:[{id:'combat',name:'Combat',layout:original}]},'gm');
  history=updateViewportHistory(history,'gm','mobile',value=>applyDashboardPreset(value,'gm','combat'));
  history=updateViewportHistory(history,'gm','tablet',value=>applyDashboardPreset(value,'gm','exploration'));
  assert.equal(dashboardLayoutForViewport(history.present,'gm','mobile').preset,'combat');
  assert.equal(dashboardLayoutForViewport(history.present,'gm','desktop').preset,'default');
  assert.equal(history.present.focusModes.length,1);
  assert.equal(dashboardLayoutForViewport(undoLayoutHistory(history).present,'gm','tablet').preset,'default');
  assert.equal(redoLayoutHistory(undoLayoutHistory(history)).present.viewportLayouts.tablet.preset,'exploration');
  for(let i=0;i<90;i++)history=pushLayoutHistory(history,
    {...history.present,mode:'custom',backgroundStyle:i%2?'obsidian':'slate'},'gm');
  assert.ok(history.past.length<=MAX_LAYOUT_UNDO);
});
test('private character layout retains all gameplay data and prevents stale overwrites',async()=>{
  const f=mock(player,{'users/'+player+'/characters/'+sourceId:
    {id:sourceId,ownerUid:player,hp:[17,30],inventory:['Sword']}});
  const api=createFirebasePlayerDashboardService({...f,enabled:true,layoutEnabled:true});
  const old=defaultDashboardLayout('player'),next=lockDashboardGridPanel(old,'player','skills',true);
  await api.saveOwnedLayout(sourceId,next,old);
  const stored=f.state.get('users/'+player+'/characters/'+sourceId);
  assert.deepEqual(stored.hp,[17,30]);assert.deepEqual(stored.inventory,['Sword']);
  assert.ok(stored.dashboardPreferences.dashboardLayout.lockedPositions.includes('skills'));
  await assert.rejects(api.saveOwnedLayout(sourceId,old,old),/changed in another session/);
});
test('campaign owner writes shared and private layouts, preserving XP and inventory',async()=>{
  const f=mock(player),api=createFirebasePlayerDashboardService({...f,enabled:true,layoutEnabled:true});
  const old=defaultDashboardLayout('player'),next=lockDashboardGridPanel(old,'player','skills',true);
  await api.saveCampaignLayout(cid,charId,next,old);
  const shared=f.state.get('campaigns/'+cid+'/characters/'+charId);
  const privateSheet=f.state.get('users/'+player+'/characters/'+sourceId);
  assert.deepEqual(shared.hp,[17,30]);assert.deepEqual(shared.inventory,['Sword']);
  assert.deepEqual(shared.dashboardPreferences.dashboardLayout,privateSheet.dashboardPreferences.dashboardLayout);
  assert.deepEqual(f.state.get('campaigns/'+cid),campaign);
  await assert.rejects(api.saveCampaignLayout(cid,charId,old,old),/changed/);
  const other=mock(owner),gm=createFirebasePlayerDashboardService({...other,enabled:true,layoutEnabled:true});
  await assert.rejects(gm.saveCampaignLayout(cid,charId,next,old),/Only the linked character owner/);
  f.state.set('campaigns/'+cid+'/members/'+player,{...membership,status:'suspended'});
  await assert.rejects(api.saveCampaignLayout(cid,charId,next,next),/membership/);
});
test('GM saves to existing private layout path and rejects stale or non-GM writes',async()=>{
  const f=mock(owner),api=createFirebaseGMDashboardService({...f,enabled:true,layoutEnabled:true});
  const old=defaultDashboardLayout('gm'),next=lockDashboardGridPanel(old,'gm','encounter',true);
  await api.saveLayout(cid,next,old);
  assert.ok(f.state.get('users/'+owner+'/dashboardLayouts/gm-'+cid)
    .layout.lockedPositions.includes('encounter'));
  await assert.rejects(api.saveLayout(cid,old,old),/changed in another session/);
  const outsider=mock('uninvited');
  const denied=createFirebaseGMDashboardService({...outsider,enabled:true,layoutEnabled:true});
  await assert.rejects(denied.saveLayout(cid,next,old),/GM access/);
});
test('feature-off prevents changes for both dashboards',async()=>{
  const f=mock(owner);
  const gm=createFirebaseGMDashboardService({...f,enabled:true});
  await assert.rejects(gm.saveLayout(cid,defaultDashboardLayout('gm'),null),/disabled/);
  const playerApi=createFirebasePlayerDashboardService({...f,enabled:true});
  await assert.rejects(playerApi.saveOwnedLayout(sourceId,defaultDashboardLayout('player'),null),/disabled/);
});
