import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hybridViewerId,hybridViewerCanRead} from '../src/state/hybridPresentationSessionModel.mjs';
import {safePartyPresentation,presentationDraft} from '../src/state/playerPresentationModel.mjs';
import {publicCombatSnapshot} from '../src/state/livePresentationProjectionModel.mjs';
import {battleMapTokens} from '../src/state/battleMapModel.mjs';
import {captureEncounterRecovery} from '../functions/encounterRecovery.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('M1/M3: prevent prototype-property viewer grants and safely revoke expired grants',()=>{
  for(const identifier of ['__proto__','constructor','prototype','/escape','']){
    assert.equal(hybridViewerId(identifier),false,identifier);
  }
  assert.equal(hybridViewerId('player_Uid-1'),true);
  const now=Date.now();
  const session={status:'open',epoch:'epochAudit',expiresAt:new Date(now+2000)};
  const grant={uid:'player_Uid-1',status:'active',epoch:'epochAudit',
    expiresAt:new Date(now+1000)};
  assert.equal(hybridViewerCanRead(session,grant,grant.uid,now),true);
  assert.equal(hybridViewerCanRead(session,grant,grant.uid,now+1001),false);
  assert.equal(hybridViewerCanRead({...session,status:'closed'},grant,grant.uid,now),false);
  assert.equal(hybridViewerCanRead(session,{...grant,epoch:'old'},grant.uid,now),false);
});

test('M2/M3: public combat and party projections never include GM-only details',()=>{
  const safe=publicCombatSnapshot({status:'active',combatId:'combat1',round:2,
    turnIndex:0,combat:{version:1,revision:1,participants:{}},
    combatants:[{id:'enemy1',name:'Secret Archmage',kind:'enemy',
      hp:[60,80],gmNotes:'NEVER_SEND',initiative:17}],
    gmNotes:'PRIVATE_CAMPAIGN'});
  assert.doesNotMatch(JSON.stringify(safe),/Archmage|NEVER_SEND|PRIVATE_CAMPAIGN/);
  const party=safePartyPresentation({
    hero:{id:'hero',name:'Hero',klass:'Ranger',level:4,
      hp:12,hpMax:18,inventory:['PRIVATE_ITEM'],spells:['PRIVATE_SPELL']}
  },['hero'],false);
  assert.doesNotMatch(JSON.stringify(party),/PRIVATE_ITEM|PRIVATE_SPELL|hp/);
  assert.throws(()=>presentationDraft({scene:'title',title:'Safe',subtitle:'',
    mapId:'',characterIds:[],showRound:false,showPartyHP:false,
    theme:'obsidian',gmNotes:'PRIVATE_CAMPAIGN'}));
});

test('M3: combat map tokens, recovery checkpoint and pending GM action are kept distinct',()=>{
  assert.throws(()=>battleMapTokens([{id:'duplicated',label:'First',x:1,y:1},
    {id:'duplicated',label:'Second',x:2,y:2}]));
  const checkpoint=captureEncounterRecovery({
    status:'active',combatId:'combat1',battleMapId:'',round:4,
    combat:{revision:1,pending:{secret:'PRIVATE_UNRESOLVED'},log:[]},
    turnTimer:{enabled:false,endsAt:null}
  },{pending:{secret:'PRIVATE_UNRESOLVED'},preparations:{}},null,Date.now());
  assert.equal(checkpoint.encounter.combat.pending,null);
  assert.equal(checkpoint.privateState.pending,undefined);
});

test('M1-M3: user-facing battle maps, canvas and recovery share the established modules',()=>{
  const presentation=source('src/dashboards/presentation/CampaignPresentationWorkspace.jsx');
  const canvas=source('src/dashboards/presentation/CampaignMapWorkspace.jsx');
  const combat=source('functions/combatCommands.mjs');
  const recovery=source('functions/encounterRecovery.mjs');
  const restricted=source('src/dashboards/presentation/HybridSessionManager.jsx');
  assert.match(presentation,/managePresentation/);
  assert.match(presentation,/HybridSessionManager/);
  assert.match(canvas,/BattleMapToken/);
  assert.match(combat,/applyEncounterRecovery/);
  assert.match(combat,/captureEncounterRecovery/);
  assert.match(recovery,/reopen/);
  assert.match(restricted,/watchRestrictedViewer/);
});
