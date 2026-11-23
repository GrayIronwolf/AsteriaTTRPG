import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GM_PLAYER_MANAGER_VIEWS,GM_PLAYER_MANAGER_DELEGATIONS,
  gmPlayerManagerAccess,gmPlayerManagerRoster,gmPlayerManagerCapacity,
  gmPlayerManagerApprovalAllowed,gmPlayerManagerLifecycleAllowed
} from '../src/state/gmPlayerManagerModel.mjs';

const text=path=>readFileSync(path,'utf8');
const flags={
  campaignPlayerRoster:true,campaignJoinReview:true,campaignJoinRequests:true,
  campaignCharacterApproval:true,campaignCharacterLifecycle:true,
  campaignRolePermissions:true,campaignMemberControls:true,secureInvitationManager:true
};
const campaign={
  id:'test-campaign',ownerUid:'owner',membershipSchemaVersion:2,
  ucn:'123456789012',playerLimit:2,
  gmUids:['stale-co'],roles:{'stale-co':'gm'},
  players:{owner:{displayName:'Campaign GM'},alice:{displayName:'Alice',characterIds:['a']}},
  playerCharacterLinks:{a:'alice'},
  characters:{a:{ownerUid:'alice',name:'Aster'}},party:['a']
};
const co={uid:'co',id:'co',campaignId:campaign.id,role:'co-gm',status:'active',
  capabilityOverrides:{'review-join-requests':true,'moderate-members':false}};
const members=[co,
  {uid:'alice',id:'alice',campaignId:campaign.id,role:'player',status:'active'},
  {uid:'inactive',id:'inactive',campaignId:campaign.id,role:'player',status:'suspended'}];
const characters={a:{id:'a',name:'Aster',level:8,ownerUid:'alice',
  sharedCampaignId:campaign.id},stray:{id:'stray',name:'Unknown',ownerUid:'outsider'}};

test('player manager adds single canonical GM route and all six distinct sections',()=>{
  assert.deepEqual(GM_PLAYER_MANAGER_VIEWS.map(x=>x.id),[
    'players','joins','characters','invitations','access','activity']);
  assert.deepEqual(GM_PLAYER_MANAGER_DELEGATIONS.map(x=>x.id),[
    'review-join-requests','moderate-members']);
  const menu=text('src/state/dashboardMenuModel.mjs');
  const gm=text('src/dashboards/GMDashboard.jsx');
  const toolkit=text('src/state/gmToolkitModel.mjs');
  assert.match(menu,/page\('player-manager','Player Manager'/);
  assert.match(gm,/tab === 'player-manager' \? <GMPlayerManager/);
  assert.match(gm,/membership=\{live\.membership\}/);
  assert.match(toolkit,/id:'player-manager'.*tab:'player-manager'/);
  assert.equal((menu.match(/page\('player-manager'/g)||[]).length,1);
});

test('v2 member actions fail closed until both role and flags agree',()=>{
  const owner=gmPlayerManagerAccess({campaign,actorUid:'owner',flags});
  assert.equal(owner.gm,true);
  for(const key of ['roster','joinReview','characterApproval','characterLifecycle',
    'memberControls','rolePermissions','activity','invitationManagement'])
    assert.equal(owner[key],true,key);
  const gm=gmPlayerManagerAccess({campaign,actorUid:'co',membership:co,flags});
  assert.equal(gm.gm,true);
  assert.equal(gm.owner,false);
  assert.equal(gm.joinReview,true);
  assert.equal(gm.memberControls,false);
  assert.equal(gm.rolePermissions,false);
  assert.equal(gm.invitationManagement,false);
  const suspended=gmPlayerManagerAccess({campaign,actorUid:'co',
    membership:{...co,status:'suspended'},flags});
  assert.equal(suspended.gm,false);
  assert.equal(suspended.joinReview,false);
  const misbound=gmPlayerManagerAccess({campaign,actorUid:'co',
    membership:{...co,campaignId:'other'},flags});
  assert.equal(misbound.gm,false);
  assert.equal(gmPlayerManagerAccess({campaign,actorUid:'stale-co',flags}).gm,false);
  const disabled=gmPlayerManagerAccess({campaign,actorUid:'owner',flags:{}});
  assert.equal(disabled.roster,false);
  assert.equal(disabled.characterLifecycle,false);
  assert.equal(disabled.rolePermissions,false);
});

test('legacy roster stays read only and never infers active orphan members',()=>{
  const legacy={...campaign,membershipSchemaVersion:1,
    playerUids:['alice'],players:{...campaign.players,
      stranger:{uid:'stranger',status:'active'}}};
  const a=gmPlayerManagerAccess({campaign:legacy,actorUid:'owner',flags});
  assert.equal(a.gm,true);
  assert.equal(a.joinReview,false);
  assert.equal(a.rolePermissions,false);
  const roster=gmPlayerManagerRoster({campaign:legacy,characters,members});
  assert.equal(roster.server,false);
  assert.equal(roster.rows.some(x=>x.uid==='stranger'),false);
});

test('canonical live roster separates linked characters and offline status from membership',()=>{
  const report=gmPlayerManagerRoster({campaign,characters,members,query:'Aster',presence:{
    alice:{characterId:'a',state:'online'}}});
  assert.equal(report.server,false);
  assert.equal(report.rows.length,1);
  assert.equal(report.rows[0].uid,'alice');
  assert.equal(report.rows[0].online,true);
  assert.equal(report.summary.linkedCharacters,1);
  assert.equal(report.summary.unverifiedCharacters,1);
  assert.equal(report.summary.activeGMs,2);
  assert.equal(report.summary.activePlayers,1);
  const server=gmPlayerManagerRoster({campaign,characters,members,serverRoster:{
    campaignId:campaign.id,source:'canonical',summary:{pending:3},
    active:[{uid:'owner',role:'owner',status:'active',revision:1,
      controls:[],characters:[]},
      {uid:'co',role:'co-gm',status:'active',revision:4,
        roleEditable:false,controls:['suspend','ban'],characters:[]}],
    inactive:[{uid:'inactive',role:'player',status:'suspended',revision:2,
      controls:['restore'],characters:[]}]
  }});
  assert.equal(server.server,true);
  assert.equal(server.summary.pending,3);
  assert.equal(server.summary.activeGMs,2);
  assert.deepEqual(server.rows.find(x=>x.uid==='co').controls,['suspend','ban']);
});

test('capacity and join decisions reject stale or overfull approvals',()=>{
  assert.deepEqual(gmPlayerManagerCapacity(campaign,{capacity:2,activePlayers:1}),{
    limit:2,filled:1,remaining:1,verified:true});
  const pending={uid:'alice',status:'pending',revision:1};
  assert.equal(gmPlayerManagerApprovalAllowed(pending,'approve',{
    verified:true,remaining:1}),true);
  assert.equal(gmPlayerManagerApprovalAllowed(pending,'approve',{
    verified:true,remaining:0}),false);
  assert.equal(gmPlayerManagerApprovalAllowed(pending,'decline',{
    verified:true,remaining:0}),true);
  assert.equal(gmPlayerManagerApprovalAllowed({...pending,revision:0},'approve',{
    verified:true,remaining:1}),false);
  assert.equal(gmPlayerManagerApprovalAllowed({...pending,status:'approved'},'approve',{
    verified:true,remaining:1}),false);
  assert.equal(gmPlayerManagerCapacity(campaign).verified,false);
});

test('character lifecycle only exposes valid revisioned transitions',()=>{
  const base={linkId:'link_hash',revision:3,status:'approved'};
  assert.equal(gmPlayerManagerLifecycleAllowed(base,'deactivate'),true);
  assert.equal(gmPlayerManagerLifecycleAllowed(base,'restore'),false);
  assert.equal(gmPlayerManagerLifecycleAllowed(base,'unlink'),true);
  assert.equal(gmPlayerManagerLifecycleAllowed({...base,status:'inactive'},'restore'),true);
  assert.equal(gmPlayerManagerLifecycleAllowed({...base,status:'pending'},'unlink'),false);
  assert.equal(gmPlayerManagerLifecycleAllowed({...base,revision:0},'unlink'),false);
});

test('React uses existing authenticated callables with server and browser gates unchanged',()=>{
  const jsx=text('src/dashboards/GMPlayerManager.jsx');
  const service=text('src/firebase/asteriaFirebaseService.js');
  const auth=text('js/firebase-auth.js');
  const html=text('index.html');
  const server=text('functions/index.mjs');
  for(const name of [
    'listCampaignPlayerRoster','listCampaignJoinRequests','reviewCampaignJoinRequest',
    'listPendingCampaignCharacterLinks','reviewCampaignCharacterLink',
    'listCampaignCharacterLifecycle','changeCampaignCharacterLifecycle',
    'setCampaignCoGmPermission','changeCampaignMemberRole','moderateCampaignMember',
    'issueSecureCampaignInvitation','listSecureCampaignInvitations',
    'changeSecureCampaignInvitation','listCampaignMembershipActivity']){
    assert.match(service,new RegExp(name+':'));
    assert.match(auth,new RegExp(name+':'));
    assert.match(jsx,new RegExp('firebaseService\\.'+name));
  }
  assert.doesNotMatch(jsx,/\b(setDoc|updateDoc|deleteDoc|addDoc)\s*\(/);
  for(const key of ['campaignPlayerRoster','campaignMemberControls','campaignRolePermissions',
    'campaignCharacterApproval','campaignCharacterLifecycle'])
    assert.match(html,new RegExp(key+':false'));
  assert.match(server,/ASTERIA_MEMBER_CONTROLS_ENABLED/);
  assert.match(server,/ASTERIA_CHARACTER_LIFECYCLE_ENABLED/);
  assert.match(server,/ASTERIA_CHARACTER_LINK_APPROVAL_ENABLED/);
});
