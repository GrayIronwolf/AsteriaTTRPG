import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../js/character-access.js';
import {gmCampaignMemberSummary} from '../src/state/gmCampaignRosterModel.mjs';
import {openGMCharacter,gmReturnContext} from '../src/app/gmCharacterNavigation.mjs';

const access=globalThis.AsteriaCharacterAccess;
const base={id:'campaign-v2',membershipSchemaVersion:2,ownerUid:'owner',
  gmUids:['owner','old-co'],roles:{'old-co':'gm'},players:{
    owner:{displayName:'GM'},alice:{displayName:'Alice',characterIds:['char-a']}
  },playerCharacterLinks:{'char-a':'alice'},
  characters:{'char-a':{ownerUid:'alice',name:'Aster'}},party:['char-a']};
const co={id:'new-co',campaignId:'campaign-v2',uid:'new-co',role:'co-gm',status:'active'};
const character={id:'char-a',ownerUid:'alice',name:'Aster',sharedCampaignId:'campaign-v2'};

test('canonical Co-GM access requires current verified membership, not legacy grants',()=>{
  assert.equal(access.isGM(base,'owner'),true);
  assert.equal(access.isGM(base,'old-co'),false);
  assert.equal(access.isGM(base,'new-co',co),true);
  assert.equal(access.isGM(base,'new-co',{...co,status:'suspended'}),false);
  assert.equal(access.isGM(base,'new-co',{...co,role:'player'}),false);
  assert.equal(access.isGM(base,'new-co',{...co,uid:'attacker'}),false);
  assert.equal(access.isGM(base,'new-co',{...co,campaignId:'other'}),false);
  assert.equal(access.isGM({...base,membershipSchemaVersion:3},'owner'),false);
  assert.equal(access.canGMView(base,character,'new-co',co),true);
  assert.equal(access.canGMView(base,character,'old-co'),false);
  assert.equal(access.canGMView(base,{...character,ownerUid:'attacker'},'new-co',co),false);
});

test('legacy GM access remains compatible and counts owner only once',()=>{
  const legacy={...base,membershipSchemaVersion:1,
    gmUids:['owner','old-co'],playerUids:['alice'],
    roles:{'old-co':'gm',alice:'player'}};
  assert.equal(access.isGM(legacy,'old-co'),true);
  assert.equal(access.isGM(legacy,'owner'),true);
  assert.equal(access.isGM(legacy,'outsider'),false);
  const report=gmCampaignMemberSummary({campaign:legacy,
    characters:{'char-a':character,bad:{id:'bad',ownerUid:'fake'}}});
  assert.equal(report.state,'ready');
  assert.equal(report.summary.activeGMs,2);
  assert.equal(report.summary.activePlayers,1);
  assert.equal(report.summary.linkedCharacters,1);
  assert.equal(report.summary.unverifiedCharacters,1);
  assert.equal(report.members.find(row=>row.uid==='alice').characters[0].id,'char-a');
});

test('canonical roster separates accounts from verified linked characters',()=>{
  const members=[
    {...co},
    {id:'alice',uid:'alice',campaignId:base.id,role:'player',status:'active'},
    {id:'inactive',uid:'inactive',campaignId:base.id,role:'player',status:'suspended'},
    {id:'forged',uid:'forged',campaignId:'other',role:'co-gm',status:'active'}
  ];
  const report=gmCampaignMemberSummary({campaign:base,
    characters:{'char-a':character,orphan:{ownerUid:'alice'},
      'wrong-owner':{ownerUid:'attacker'}},members});
  assert.equal(report.state,'ready');
  assert.equal(report.source,'canonical');
  assert.equal(report.summary.activeGMs,2);
  assert.equal(report.summary.activePlayers,1);
  assert.equal(report.summary.inactive,1);
  assert.equal(report.summary.linkedCharacters,1);
  assert.equal(report.summary.unverifiedCharacters,2);
  assert.ok(report.issues.includes('invalid-v2-member'));
  assert.equal(report.members.filter(row=>row.uid==='owner').length,1);
});

test('v2 roster fails closed while server stream is loading or unavailable',()=>{
  const loading=gmCampaignMemberSummary({campaign:base,characters:{'char-a':character}});
  assert.equal(loading.state,'loading');
  assert.equal(loading.summary,null);
  const denied=gmCampaignMemberSummary({campaign:base,rosterError:'Permission denied'});
  assert.equal(denied.state,'error');
  assert.equal(denied.summary,null);
  const legacy=gmCampaignMemberSummary({campaign:{...base,membershipSchemaVersion:1,
    players:{orphan:{uid:'orphan',status:'active'}}}});
  assert.equal(legacy.members.some(member=>member.uid==='orphan'),false);
});

test('character navigation verifies canonical membership both ways',()=>{
  const win=()=>({
    AsteriaCharacterAccess:access,AsteriaFirebase:{getUser:()=>({uid:'new-co'})},
    history:{state:null,replaceState(value){this.state=value;},
      pushState(value){this.state=value;}},scrollY:0,dispatchEvent(){}
  });
  const denied=win();
  assert.equal(openGMCharacter(base,character,{tab:'tools'},denied),false);
  const allowed=win();
  assert.equal(openGMCharacter(base,character,{tab:'tools',membership:co},allowed),true);
  assert.ok(gmReturnContext(base,character,'new-co',allowed,co));
  assert.equal(gmReturnContext(base,character,'new-co',allowed,{...co,status:'suspended'}),null);
});

test('membership streams are read-only and used by GM React dashboard',()=>{
  const service=fs.readFileSync('js/firebase-auth.js','utf8');
  const hook=fs.readFileSync('src/sessions/useCampaignLiveData.js','utf8');
  const dashboard=fs.readFileSync('src/dashboards/GMDashboard.jsx','utf8');
  const manager=fs.readFileSync('src/dashboards/GMWorkspacePanels.jsx','utf8');
  assert.match(service,/subscribeCampaignMembership: function/);
  assert.match(service,/subscribeCampaignMembers: function/);
  assert.match(service,/collection\(db,'campaigns',campaignId,'members'\)/);
  assert.match(hook,/const authoritative=meta/);
  assert.match(hook,/meta\?\.fromCache/);
  assert.match(dashboard,/live\.membershipLoading/);
  assert.match(dashboard,/live\.membership\)/);
  assert.match(manager,/gmCampaignMemberSummary/);
});
