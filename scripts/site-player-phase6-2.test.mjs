import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSiteRoute} from '../frontend/src/router/siteRoutes.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';
import {
  requireDashboardId,playerCharacterProjection,playerCampaignAccess,
  linkedCharacterAccess,matchesOwnedSource,publicPartyProjection,playerCampaignProjection
} from '../frontend/src/player/playerDashboardModel.mjs';
import {createFirebasePlayerDashboardService} from '../frontend/src/player/firebasePlayerDashboardService.mjs';

const owner='owner123',player='player123',cid='campaign123',charId='linked123',sourceId='source123';
const v1={id:cid,ownerUid:owner,gmUids:[],playerUids:[player],membershipSchemaVersion:1,
  playerCharacterLinks:{[charId]:player},
  characters:{[charId]:{ownerUid:player,name:'Hero'}},party:[charId],name:'Asteria'};
const v2={...v1,membershipSchemaVersion:2};
const character={id:charId,ownerUid:player,sourceCharacterId:sourceId,status:'linked',sharedCampaignId:cid,
  name:'Hero',klass:'Paladin',level:3,hp:[17,40],sp:[15,22],mp:[6,10],skills:{Survival:2},
  inventory:[{name:'Asteria Sword',qty:1}],journal:[{title:'PRIVATE',content:'secret'}]};
const source={id:sourceId,ownerUid:player,campaignCharacterIds:{[cid]:charId},
  linkedCampaignIds:[cid],name:'Hero'};

test('routes activate only with explicit authenticated characters service',()=>{
  const inactive={has:()=>false},active={has:key=>['auth','characters'].includes(key)};
  assert.equal(canActivateRoute('character-dashboard',inactive),false);
  assert.equal(canActivateRoute('character-dashboard',active),true);
  assert.equal(parseSiteRoute({hash:'#/react/owned-character/'+sourceId}).params.characterId,sourceId);
  assert.equal(parseSiteRoute({hash:'#/react/character/'+cid+'/'+charId}).params.characterId,charId);
  assert.throws(()=>requireDashboardId('../users/admin'));
  assert.throws(()=>requireDashboardId(''));
});
test('v1 and v2 membership: owner, player, active co-GM and revoked deny',()=>{
  assert.deepEqual(playerCampaignAccess(v1,null,owner,cid),{allowed:true,isGM:true});
  assert.deepEqual(playerCampaignAccess(v1,null,player,cid),{allowed:true,isGM:false});
  assert.equal(playerCampaignAccess(v1,null,'outsider',cid).allowed,false);
  assert.equal(playerCampaignAccess(v2,null,player,cid).allowed,false);
  const member={uid:player,campaignId:cid,status:'active',role:'player'};
  assert.deepEqual(playerCampaignAccess(v2,member,player,cid),{allowed:true,isGM:false});
  assert.deepEqual(playerCampaignAccess(v2,{...member,role:'co-gm'},player,cid),{allowed:true,isGM:true});
  assert.equal(playerCampaignAccess(v2,{...member,status:'suspended'},player,cid).allowed,false);
  assert.equal(playerCampaignAccess(v2,{...member,campaignId:'wrong'},player,cid).allowed,false);
  assert.equal(playerCampaignAccess({...v2,membershipSchemaVersion:3},null,owner,cid).allowed,false);
});
test('campaign character must match server link, status, owner and v2 source mapping',()=>{
  const member=playerCampaignAccess(v2,{uid:player,campaignId:cid,status:'active',role:'player'},player,cid);
  assert.deepEqual(linkedCharacterAccess(v2,character,player,member),{allowed:true,owned:true});
  assert.deepEqual(linkedCharacterAccess(v2,character,owner,playerCampaignAccess(v2,null,owner,cid)),{allowed:true,owned:false});
  assert.equal(linkedCharacterAccess(v2,character,'outsider',{allowed:false,isGM:false}).allowed,false);
  assert.equal(linkedCharacterAccess(v2,{...character,status:'inactive'},player,member).allowed,false);
  assert.equal(linkedCharacterAccess(v2,{...character,sharedCampaignId:'wrong'},player,member).allowed,false);
  assert.equal(linkedCharacterAccess({...v2,party:[]},character,player,member).allowed,false);
  assert.equal(linkedCharacterAccess({...v2,playerCharacterLinks:{[charId]:owner}},character,player,member).allowed,false);
  assert.equal(matchesOwnedSource(source,character,cid,player,2),true);
  assert.equal(matchesOwnedSource({...source,campaignCharacterIds:{[cid]:'wrong'}},character,cid,player,2),false);
  assert.equal(matchesOwnedSource({...source,ownerUid:owner},character,cid,player,2),false);
  assert.equal(matchesOwnedSource({...source,campaignCharacterIds:{}},character,cid,player,2),false);
});
test('strict character projection hides owner-only content from GM and party projections',()=>{
  const privateSheet={...character,backstory:{history:'Private history'},secrets:'GM-NO',
    spells:[{name:'Wind Magic'}],talents:{Berserker:{rank:2}},journal:[{title:'Journal',content:'private note'}]};
  const gm=playerCharacterProjection(privateSheet);
  assert.equal(gm.name,'Hero');
  assert.deepEqual(gm.hp,[17,40]);
  assert.equal(gm.inventory[0].name,'Asteria Sword');
  assert.deepEqual(gm.journal,[]);
  assert.equal(gm.backstory,'');
  assert.equal(JSON.stringify(gm).includes('private note'),false);
  assert.equal(JSON.stringify(gm).includes('GM-NO'),false);
  const owned=playerCharacterProjection(privateSheet,{owned:true});
  assert.equal(owned.backstory,'Private history');
  assert.equal(owned.journal[0].content,'private note');
  assert.equal(publicPartyProjection(v2)[0].name,'Hero');
  assert.deepEqual(playerCampaignProjection(v2,{allowed:true,isGM:false},null).session.status,'idle');
});
test('disabled service, missing owner and unauthorized membership do not subscribe',async()=>{
  let subscriptions=0;
  const auth={currentUser:{uid:'uninvited'}};
  const db={};
  const sdk={
    doc:(_db,...parts)=>parts.join('/'),
    getDocFromServer:async reference=>({exists:()=>reference==='campaigns/'+cid,
      data:()=>({...v2,roles:{uninvited:'gm'}}),id:reference.split('/').pop()}),
    onSnapshot:()=>{subscriptions++;return()=>{};}
  };
  const create=enabled=>createFirebasePlayerDashboardService({
    auth,db,firestoreSdk:sdk,readCanonical:async user=>({uid:user.uid}),enabled
  });
  await new Promise(resolve=>{
    create(false).watchOwned(sourceId,()=>assert.fail('disabled service disclosed character'),error=>{
      assert.match(error.message,/disabled/);resolve();
    });
  });
  await new Promise(resolve=>{
    create(true).watchCampaign(cid,charId,()=>assert.fail('uninvited received data'),error=>{
      assert.match(error.message,/membership/i);resolve();
    });
  });
  assert.equal(subscriptions,0);
});
test('source boundary is one React route without new Firebase or legacy mounts',()=>{
  for(const p of ['frontend/src/pages/PlayerDashboardPage.jsx','frontend/src/player/firebasePlayerDashboardService.mjs']){
    const s=readFileSync(new URL('../'+p,import.meta.url),'utf8');
    assert.doesNotMatch(s,/from ['"]firebase\/app|window\.AsteriaFirebase|legacyBridge|window\.setView/);
  }
  const adapter=readFileSync(new URL('../frontend/src/auth/firebaseAuthAdapter.mjs',import.meta.url),'utf8');
  assert.match(adapter,/VITE_ASTERIA_PLAYER_DASHBOARD_ENABLED==='true'/);
  const app=readFileSync(new URL('../frontend/src/app/App.jsx',import.meta.url),'utf8');
  assert.match(app,/<PlayerDashboardPage route=\{route\}/);
});
