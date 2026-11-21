import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  publicCombatSnapshot,publicCombatPresentation,publicPresentationBattleMap,
  mapForRestrictedViewer
} from '../src/state/livePresentationProjectionModel.mjs';
import {
  synchronizeCombatPresentation,synchronizeBattleMapPresentation
} from '../functions/livePresentationProjectionTriggers.mjs';
import {battleMapAssetPath} from '../src/state/battleMapModel.mjs';
import {createFogCells} from '../src/state/battleMapFogModel.mjs';
const cid='phase74',mapId='test-map-74';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const encounter={
  status:'active',combatId:'fight-74',round:4,turnIndex:1,
  battleMapId:mapId,preparedMapId:'GM-secret-map',
  combatants:[
    {id:'hero-74',characterId:'hero',kind:'player',name:'Alara',initiative:18,
      hp:[15,25],sp:[10,20],mp:[3,12],ownerUid:'alice',conditions:['secret']},
    {id:'beast-74',kind:'enemy',name:'Hidden Lich',initiative:12,
      hp:[140,150],mp:[100,100],ac:18,spellbook:['Eldritch Missile'],
      secretAttack:'Blood Curse',spawn:{x:80,y:20}},
    {id:'minion-74',kind:'enemy',name:'Servant',revealed:true,
      initiative:6,hp:[5,9]}
  ],
  combat:{version:1,revision:17,
    participants:{
      'hero-74':{ap:2,bonus:true,turnComplete:false,
        hp:[15,25],hiddenRoll:10,gmNotes:'do not show'},
      'beast-74':{ap:3,bonus:true,turnComplete:false,
        secretStatus:'cursed'},
      'minion-74':{ap:1,bonus:false}
    },
    pending:{id:'pend74',actorId:'beast-74',actorName:'Hidden Lich',
      name:'Blood Curse',status:'reactions',ap:1,targetIds:['hero-74'],
      creatureSecret:'strange'},
    log:[{message:'GM attacks secretly',hiddenDice:20}]
  },
  privateNotes:'GM map spawn',enemies:[{name:'Hidden Lich',hp:[150,150]}],
  publicEvent:{name:'The snow begins',type:'environment',round:4},
  turnTimer:{enabled:true,endsAt:4102444800000,durationSeconds:90}
};
const rawMap={
  id:mapId,campaignId:cid,name:'Frozen Keep',description:'Battlefield',
  visibility:'players',kind:'image',contentType:'image/png',
  storagePath:battleMapAssetPath(cid,mapId,'image/png'),
  width:1920,height:1080,gridColumns:2,gridRows:2,
  gridVisible:true,gridOpacity:40,fogEnabled:true,
  fogCells:'1000',metresPerCell:5,
  tokens:[
    {id:'hero-token',combatantId:'hero-74',label:'Alara',
      kind:'character',x:25,y:25,refId:'hero'},
    {id:'enemy-token',combatantId:'beast-74',label:'Lich',
      kind:'creature',x:75,y:75,refId:'secret'},
    {id:'gm-token',label:'Hidden objective',kind:'marker',x:75,y:25}
  ],
  gmNotes:'GM SECRET',secretPins:[{note:'Danger'}]
};
test('7.4: server combat projection strips all GM-only encounter internals',()=>{
  const safe=publicCombatSnapshot(encounter);
  assert.equal(safe.status,'active');
  assert.equal(safe.combat.revision,17);
  assert.equal(safe.round,4);
  assert.equal(safe.combatants[1].name,'Creature');
  assert.equal(safe.combatants[2].name,'Servant');
  assert.equal(safe.combat.participants['hero-74'].ap,2);
  assert.equal(safe.combat.participants['beast-74'].ap,undefined);
  assert.equal(safe.combat.pending.actorName,'Creature');
  assert.equal(safe.combat.pending.name,'Creature action');
  assert.equal(safe.publicEvent.name,'The snow begins');
  assert.equal('battleMapId' in safe,false);
  assert.equal('preparedMapId' in safe,false);
  assert.equal('enemies' in safe,false);
  assert.equal('log' in safe.combat,false);
  for(const secret of ['Hidden Lich','Blood Curse','Eldritch Missile',
    'GM map spawn','GM attacks secretly','secretAttack','secretStatus',
    'secretPins','GM SECRET','createdBy','ownerUid']){
    assert.equal(JSON.stringify(safe).includes(secret),false,
      secret+' leaked in player-facing JSON');
  }
  const summary=publicCombatPresentation(encounter);
  assert.deepEqual(summary,{active:true,round:4,current:'GM turn',
    endsAt:4102444800000,
    event:{name:'The snow begins',type:'environment',round:4}});
});
test('7.4: player safe projection works with existing combat model',async()=>{
  const {projectCombat}=await import('../frontend/src/combat/combatModel.mjs');
  const safe=publicCombatSnapshot(encounter);
  const data=projectCombat(safe,{status:'active',expiresAt:{seconds:4102444800}},{
    role:'player',characterId:'hero',
    party:[{id:'hero',hp:[15,25],sp:[10,20],mp:[3,12]}]
  });
  assert.equal(data.revision,17);
  assert.equal(data.current.id,'beast-74');
  assert.equal(data.ownActor.ap,2);
  assert.equal(data.ownActor.hp[0],15);
  assert.equal(data.combatants[1].name,'Creature');
  assert.equal(data.combatants[1].hp,undefined);
});
test('7.4: publication enforces original map source and filters obscured tokens',()=>{
  const safe=publicPresentationBattleMap(rawMap,cid,mapId);
  assert.equal(safe.id,mapId);
  assert.equal(safe.fogCells,'1000');
  assert.equal(safe.tokens.length,1);
  assert.equal(safe.tokens[0].label,'Alara');
  assert.equal(safe.tokens[0].combatantId,undefined);
  assert.equal(safe.storagePath,undefined);
  assert.equal(safe.gmNotes,undefined);
  assert.equal(safe.secretPins,undefined);
  assert.equal(mapForRestrictedViewer(rawMap,cid).tokens.length,1);
  assert.throws(()=>publicPresentationBattleMap({...rawMap,
    visibility:'gm'},cid,mapId),/published/);
  assert.throws(()=>publicPresentationBattleMap({...rawMap,
    storagePath:'campaigns/other/map.png'},cid,mapId),/published/);
  assert.equal(mapForRestrictedViewer({...rawMap,visibility:'gm'},cid),null);
  assert.equal(createFogCells(2,2).length,4);
});
test('7.4: fog disabled presents only ordinary original visible tokens',()=>{
  const safe=publicPresentationBattleMap({...rawMap,fogEnabled:false},cid,mapId);
  assert.equal(safe.tokens.length,3);
});
test('7.4: server-side trigger updates only safe documents, never raw source',async()=>{
  const writes=[],deleted=[];
  const db={
    doc:path=>({
      get:async()=>({exists:path.endsWith('/presentationShared/current')||
        path.endsWith('/hybridSessionControl/current'),
      data:()=>path.endsWith('presentationShared/current')?{scene:'combat'}:
        {status:'open',epoch:'hybrid-74',expiresAt:{toMillis:()=>4102444800000}}}),
      set:async data=>{writes.push([path,data]);},
      delete:async()=>{deleted.push(path);}
    }),
    runTransaction:async callback=>callback({
      set:(path,data)=>writes.push([path,data])
    })
  };
  const projected=await synchronizeCombatPresentation(db,cid,encounter);
  assert.equal(projected.combat.revision,17);
  assert.equal(writes.length,2);
  assert.ok(writes.some(([path])=>path.endsWith('/combatPublic/current')));
  assert.ok(writes.some(([path])=>path.endsWith('/presentationCombat/current')));
  assert.equal(JSON.stringify(writes).includes('Hidden Lich'),false);
  await synchronizeBattleMapPresentation(db,cid,mapId,rawMap);
  assert.equal(writes.length,3);
  assert.equal(writes[2][1].tokens.length,1);
  await synchronizeBattleMapPresentation(db,cid,mapId,{...rawMap,visibility:'gm'});
  assert.deepEqual(deleted,[`campaigns/${cid}/battleMapsPublic/${mapId}`]);
});
test('7.4: live player and restricted viewers do not subscribe to raw combat/maps',()=>{
  const rules=read('firestore.rules');
  const service=read('frontend/src/dashboard/firebaseCampaignMediaService.mjs');
  const combat=read('frontend/src/combat/firebaseCombatService.mjs');
  const sync=read('functions/index.mjs');
  const restricted=read('frontend/src/dashboard/HybridSessionManager.jsx');
  const storage=read('storage.rules');
  assert.match(rules,/systemId == 'encounter'/);
  assert.match(rules,/match \/combatPublic\/\{documentId\}/);
  assert.match(rules,/match \/battleMapsPublic\/\{mapId\}/);
  assert.match(service,/watchRestrictedMap/);
  assert.match(service,/watchRestrictedCombat/);
  assert.match(service,/publicMapCol/);
  assert.match(service,/combatPublicRef/);
  assert.match(combat,/mode==='gm'\?encounterRef\(id\):publicCombatRef\(id\)/);
  assert.match(sync,/asteriaCombatProjection,asteriaBattleMapProjection/);
  assert.match(restricted,/RestrictedBattleMapScene/);
  assert.match(restricted,/RestrictedCombatScene/);
  assert.match(storage,/activeRestrictedBattleMap/);
  assert.doesNotMatch(restricted,/getDownloadURL/);
});
