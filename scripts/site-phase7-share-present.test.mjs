import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {
  hybridViewerCanRead,restrictedPresentationProjection
} from '../src/state/hybridPresentationSessionModel.mjs';
import {
  publicCombatSnapshot,publicPresentationBattleMap
} from '../src/state/livePresentationProjectionModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const bytes=path=>statSync(new URL('../'+path,import.meta.url)).size;

test('7.7: privileged enemy and map information cannot enter player projection',()=>{
  const safe=publicCombatSnapshot({
    status:'active',round:2,combatId:'accept77',turnIndex:0,
    combatants:[{id:'enemy77',kind:'enemy',name:'Secret Archmage',
      hp:[100,100],hiddenAttack:'DO_NOT_EXPOSE'}],
    combat:{version:1,revision:1,participants:{}},
    privateNotes:'DO_NOT_EXPOSE',enemies:[{secret:'DO_NOT_EXPOSE'}]
  });
  assert.doesNotMatch(JSON.stringify(safe),/Secret Archmage|DO_NOT_EXPOSE/);
  assert.equal(safe.combatants[0].name,'Creature');
  const map=publicPresentationBattleMap({
    id:'map77',campaignId:'phase77',name:'Shared map',visibility:'players',
    kind:'image',contentType:'image/png',
    storagePath:'campaigns/phase77/battleMaps/map77/scene.png',
    width:1280,height:720,gridColumns:2,gridRows:2,
    gridVisible:true,fogEnabled:true,fogCells:'1111',
    tokens:[],gmNotes:'DO_NOT_EXPOSE'
  },'phase77','map77');
  assert.equal(map.storagePath,undefined);
  assert.doesNotMatch(JSON.stringify(map),/DO_NOT_EXPOSE/);
});

test('7.7: viewer identity, epoch, status and expiry remain mandatory',()=>{
  const now=Date.now();
  const session={status:'open',epoch:'epoch77',expiresAt:new Date(now+60000)};
  const grant={uid:'invitee',epoch:'epoch77',status:'active',
    expiresAt:new Date(now+20000)};
  assert.equal(hybridViewerCanRead(session,grant,'invitee',now),true);
  assert.equal(hybridViewerCanRead(session,grant,'outsider',now),false);
  assert.equal(hybridViewerCanRead({...session,epoch:'new'},grant,'invitee',now),false);
  assert.equal(hybridViewerCanRead(session,{...grant,status:'revoked'},'invitee',now),false);
  assert.equal(hybridViewerCanRead(session,grant,'invitee',now+20001),false);
  assert.equal(restrictedPresentationProjection({scene:'party'}).scene,'blank');
});

test('7.7: GM capture is local only; viewer cannot obtain a screen MediaStream',()=>{
  const local=read('src/dashboards/presentation/GMScreenCaptureControls.jsx');
  const guest=read('src/dashboards/presentation/HybridSessionManager.jsx');
  const page=read('src/dashboards/PlayerPresentationWorkspace.jsx');
  assert.match(local,/getDisplayMedia/);
  assert.match(local,/audio:false/);
  assert.match(local,/getTracks\(\)\.forEach\(track=>track\.stop\(\)\)/);
  assert.doesNotMatch(local,/RTCPeerConnection|WebSocket|MediaRecorder|uploadBytes/);
  assert.doesNotMatch(guest,/getDisplayMedia|GMScreenCaptureControls/);
  assert.doesNotMatch(page,/getDisplayMedia|GMScreenCaptureControls/);
});

test('7.7: reconnect re-verifies grants and blackout removes staged subscriptions',()=>{
  const lifecycle=read('src/dashboards/presentation/usePresentationDisplayRuntime.js');
  const local=read('src/dashboards/presentation/CampaignPresentationWorkspace.jsx');
  const guest=read('src/dashboards/presentation/HybridSessionManager.jsx');
  const service=read('src/dashboards/presentation/firebaseCampaignMediaService.mjs');
  for(const event of ['online','offline','visibilitychange','pageshow'])
    assert.ok(lifecycle.includes(event));
  assert.match(local,/!runtime\.ready/);
  assert.match(guest,/!runtime\.ready/);
  assert.match(local,/display\.scene==='party'/);
  assert.match(local,/display\.scene==='combat'/);
  assert.match(service,/getDocFromServer\(hybridGrantRef\(id,uid\)\)/);
  assert.match(service,/snapshot\.metadata\?\.fromCache/);
  assert.match(service,/hybridViewerCanRead/);
});

test('7.7: no extra remote transport or unbounded local media implementation',()=>{
  // Source footprint budget guards accidentally bundled vendor/recording/video
  // systems. Not a substitute for real browser latency or memory measurements.
  assert.ok(bytes('src/dashboards/presentation/GMScreenCaptureControls.jsx')<16000);
  assert.ok(bytes('src/dashboards/presentation/usePresentationDisplayRuntime.js')<7000);
  assert.ok(bytes('src/dashboards/presentation/HybridSessionManager.jsx')<22000);
  assert.ok(bytes('src/dashboards/presentation/CampaignPresentationWorkspace.jsx')<24000);
  const implementation=read('src/dashboards/presentation/GMScreenCaptureControls.jsx');
  assert.match(implementation,/local preview|local only/i);
  assert.match(implementation,/Stop, Blackout/);
});

test('7.7: the existing dashboard is the single projector route',()=>{
  const dashboard=read('src/dashboards/PlayerPresentationWorkspace.jsx');
  const gm=read('src/dashboards/GMDashboard.jsx');
  const application=read('src/app/AsteriaReactRoot.jsx');
  assert.match(dashboard,/createFirebaseCampaignMediaService/);
  assert.match(dashboard,/CampaignPresentationDisplay/);
  assert.match(dashboard,/RestrictedPresentationDisplay/);
  assert.match(gm,/GMPlayerPresentationWorkspace/);
  assert.match(application,/PlayerPresentationDisplay/);
  assert.doesNotMatch(dashboard,/subscribeCampaignEncounter/);
});

test('unified battle map hides concealed actor data and follows only a revealed current token',async()=>{
  const {combatMapVisibility}=await import('../src/state/livePresentationProjectionModel.mjs');
  const {battleMapCameraView,encounterMapLink,validateBattleMapCamera}=await import('../src/state/battleMapCamera.mjs');
  const actors=[{id:'hero',characterId:'player',name:'Hero'},
    {id:'enemy',name:'Concealed enemy',initiative:19}];
  const encounter={status:'active',combatId:'fight',battleMapId:'map',turnIndex:1,
    combatants:actors,combat:{version:1,revision:4,participants:{hero:{ap:2},enemy:{}}}};
  const map={id:'map',visibility:'players',combatId:'fight',name:'Scene',
    kind:'image',contentType:'image/png',storagePath:'campaigns/camp/battleMaps/map/scene.png',
    width:100,height:100,gridColumns:2,gridRows:2,fogEnabled:true,fogCells:'1000',
    tokens:[{id:'hero-marker',combatantId:'hero',kind:'character',label:'Hero',x:10,y:10},
      {id:'enemy-marker',combatantId:'enemy',kind:'creature',label:'Concealed enemy',x:80,y:80}]};
  const project=(source,state)=>publicPresentationBattleMap(source,'camp','map',state);
  const hidden=project(map,encounter);
  assert.deepEqual(hidden.tokens.map(row=>row.id),['hero-marker']);
  assert.equal(hidden.activeTokenId,'');
  const safe=publicCombatSnapshot(encounter,combatMapVisibility(map,hidden));
  assert.equal(safe.battleMapId,'map');
  assert.equal(safe.turnIndex,-1);
  assert.equal(safe.combatants[0].id,'hero');
  assert.doesNotMatch(JSON.stringify({hidden,safe}),/Concealed enemy|enemy-marker/);
  assert.equal(encounterMapLink(safe,hidden),true);
  assert.equal(encounterMapLink(safe,{...hidden,combatId:'previous-fight'}),false);
  const follow=validateBattleMapCamera({mode:'follow',x:50,y:50,zoom:2});
  assert.deepEqual(battleMapCameraView(follow,hidden),{x:50,y:50,zoom:2});
  const revealed=project({...map,fogCells:'1111'},encounter);
  assert.equal(revealed.activeTokenId,'enemy-marker');
  assert.deepEqual(battleMapCameraView(follow,revealed),{x:75,y:75,zoom:2});
  assert.equal('combatantId' in revealed.tokens[1],false);
  assert.deepEqual(project(map,{...encounter,status:'ended'}).tokens,[]);
  assert.throws(()=>validateBattleMapCamera({...follow,zoom:Infinity}));
});
