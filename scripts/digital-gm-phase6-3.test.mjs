import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 activeMapEncounter,combatMapLinked,combatMapRoster,synchronizeCombatMapTokens,
 derivedCombatMapTokens,mergeCombatMapTokens,combatMapMovePlan,combatMapMovementAllowance
} from '../src/state/battleMapCombatModel.mjs';
const encounter={
 status:'active',combatId:'battle-123',round:2,turnIndex:0,
 combatants:[
  {id:'pc-a',name:'Ardent',kind:'player',characterId:'char-a',initiative:17},
  {id:'enemy-1',name:'Frost Wyrm',kind:'enemy',initiative:12}
 ],
 combat:{version:1,revision:14,participants:{
  'pc-a':{turnComplete:false,ap:1,movement:{kind:'walk',remaining:12,actionId:'movement-1'}},
  'enemy-1':{turnComplete:false,ap:3}
 }}
};
const map={
 id:'map-1',combatId:'battle-123',gridColumns:20,gridRows:20,
 metresPerCell:1,visibility:'players',tokens:[]
};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('combat activation uses authoritative encounter IDs, turn and initiative',()=>{
 assert.equal(activeMapEncounter(encounter),true);
 assert.equal(combatMapLinked(map,encounter),true);
 assert.deepEqual(combatMapRoster(encounter).map(row=>[row.id,row.isCurrent,row.initiative]),[
  ['pc-a',true,17],['enemy-1',false,12]
 ]);
 assert.equal(activeMapEncounter({...encounter,status:'ready'}),false);
 assert.equal(combatMapLinked({...map,combatId:'stale'},encounter),false);
});
test('GM linked player and enemy tokens inherit existing marker position and IDs',()=>{
 const original={...map,tokens:[
  {id:'token-player',kind:'character',refId:'char-a',label:'Ardent',x:35,y:45},
  {id:'camp-note',kind:'marker',label:'Tree',x:70,y:70}
 ]};
 let i=0;
 const tokens=synchronizeCombatMapTokens(original,encounter,()=>'new-'+(++i));
 assert.equal(tokens.length,3);
 assert.deepEqual(tokens.find(row=>row.combatantId==='pc-a'),{
  id:'token-player',kind:'character',refId:'char-a',label:'Ardent',combatantId:'pc-a',x:35,y:45
 });
 assert.equal(tokens.find(row=>row.combatantId==='enemy-1').kind,'creature');
 assert.equal(tokens.find(row=>row.id==='camp-note').combatantId,undefined);
 const after=synchronizeCombatMapTokens({...original,tokens},encounter,()=>'again-'+(++i));
 assert.deepEqual(after,tokens);
});
test('new encounter members spawn and departed members lose their map bindings',()=>{
 const initial=synchronizeCombatMapTokens(map,encounter,()=>'spawn-'+Math.random().toString(36).slice(2));
 const nextEncounter={...encounter,combatants:[encounter.combatants[0],{id:'enemy-2',name:'Ice Beast'}]};
 const final=synchronizeCombatMapTokens({...map,tokens:initial},nextEncounter,()=>'new-beast');
 assert.equal(final.some(row=>row.combatantId==='enemy-1'),false);
 assert.equal(final.some(row=>row.combatantId==='enemy-2'),true);
 assert.equal(final.some(row=>row.combatantId==='pc-a'),true);
});
test('approved movement is bounded to active combatant, snapped map square and available metres',()=>{
 const tokens=synchronizeCombatMapTokens(map,encounter,()=>'map-token-'+Math.random().toString(36).slice(2));
 const actual={...map,tokens};
 const hero=tokens.find(row=>row.combatantId==='pc-a');
 const target={x:hero.x+5,y:hero.y};
 const plan=combatMapMovePlan(actual,encounter,'pc-a',target);
 assert.equal(plan.distance.metres,1);
 assert.equal(plan.remaining,11);
 assert.deepEqual(plan.from,{x:hero.x,y:hero.y});
 assert.equal(combatMapMovementAllowance(encounter,'pc-a'),12);
 assert.throws(()=>combatMapMovePlan(actual,encounter,'enemy-1',target),/Only the current/);
 assert.throws(()=>combatMapMovePlan(actual,encounter,'pc-a',{x:100,y:100}),/within the approved/);
 assert.throws(()=>combatMapMovePlan({...actual,combatId:'wrong'},encounter,'pc-a',target),/not linked/);
});
test('GM walking uses the same square diagonals and occupied destinations as player movement',()=>{
 const actual={...map,gridColumns:10,gridRows:10,metresPerCell:3,tokens:[
  {id:'hero',label:'Hero',kind:'character',combatantId:'pc-a',x:15,y:15},
  {id:'enemy',label:'Enemy',kind:'creature',combatantId:'enemy-1',x:35,y:35}
 ]};
 const plan=combatMapMovePlan(actual,encounter,'pc-a',{x:25,y:25});
 assert.equal(plan.distance.metres,3);
 assert.equal(plan.diagonalParity,1);
 assert.throws(()=>combatMapMovePlan(actual,encounter,'pc-a',{x:35,y:35}),/No traversable route/);
 const moved={...actual,tokens:[{...actual.tokens[0],...plan.to},actual.tokens[1]]};
 const next={...encounter,combat:{...encounter.combat,participants:{'pc-a':{
  ap:3,movement:{kind:'walk',remaining:plan.remaining,diagonalParity:plan.diagonalParity}
 }}}};
 const continued=combatMapMovePlan(moved,next,'pc-a',{x:35,y:15});
 assert.equal(continued.distance.metres,6);
});
test('no free movement without approved combat action and GM-only correction requires audit reason',()=>{
 const tokens=synchronizeCombatMapTokens(map,encounter,()=>'one-'+Math.random().toString(36).slice(2));
 const actual={...map,tokens},hero=tokens.find(row=>row.combatantId==='pc-a');
 const target={x:hero.x+5,y:hero.y};
 const without={...encounter,combat:{...encounter.combat,participants:{'pc-a':{ap:3,movement:null}}}};
 assert.throws(()=>combatMapMovePlan(actual,without,'pc-a',target),/approve and resolve/);
 assert.throws(()=>combatMapMovePlan(actual,encounter,'enemy-1',{x:80,y:20},{mode:'reposition',reason:'x'}),/requires a reason/);
 const correction=combatMapMovePlan(actual,encounter,'enemy-1',{x:80,y:20},{
  mode:'reposition',reason:'Creature displaced by GM adjudication'
 });
 assert.equal(correction.remaining,null);
 assert.equal(correction.mode,'reposition');
});
test('combat token updates cannot overwrite manually authored unrelated markers',()=>{
 const stored=synchronizeCombatMapTokens(map,encounter,()=>'token-'+Math.random().toString(36).slice(2));
 const draft=[{id:'tree',label:'Oak tree',kind:'marker',x:45,y:35}];
 const merged=mergeCombatMapTokens(draft,stored);
 assert.equal(merged.length,3);
 assert.equal(merged.find(row=>row.id==='tree').kind,'marker');
 assert.equal(merged.filter(row=>row.combatantId).length,2);
});
test('map viewer, combat backend, and dashboard share the same authoritative encounter',()=>{
 const ui=read('src/dashboards/BattleMapWorkspace.jsx');
 const back=read('functions/combatCommands.mjs');
 const gm=read('src/dashboards/GMDashboard.jsx');
 const player=read('src/dashboards/CharacterDashboard.jsx');
 const rules=read('firestore.rules');
 assert.match(ui,/combatMapLinked/);
 assert.match(ui,/combatMapRoster/);
 assert.match(ui,/onCombatMove/);
 assert.match(ui,/Live Combat Integration/);
 assert.match(back,/input.operation==='map-link'/);
 assert.match(back,/input.operation==='map-move'/);
 assert.match(back,/combatMapMovePlan/);
 assert.match(back,/tx.update\(mapRef/);
 assert.match(gm,/GMBattleMapManager campaignId=\{campaignId\} characters=\{live.characters\} encounter=\{live.encounter\}/);
 assert.match(player,/PlayerBattleMapView campaignId=\{campaignId\} encounter=\{live.encounter\}/);
 assert.match(rules,/request.resource.data.tokens == resource.data.tokens/);
});

test('calibrated hex centres, six neighbours and the ruler agree with the server route',async()=>{
  const {mapCell,mapCellCenter,mapReachableRoutes,measureMapRoute}=await import('../src/state/battleMapRoutes.mjs');
  const {gridSteps}=await import('../src/state/battleMapGrid.mjs');
  const {validateTerrainCells}=await import('../src/state/battleMapTerrainModel.mjs');
  const map={gridType:'hex',gridColumns:7,gridRows:5,gridOffsetX:-.23,gridOffsetY:.19,metresPerCell:3};
  const centre=(column,row)=>mapCellCenter({column,row},7,5,map);
  for(let row=0;row<5;row++)for(let column=0;column<7;column++)
    assert.deepEqual(mapCell(centre(column,row),7,5,map),{column,row});
  const start=centre(3,2),routes=mapReachableRoutes(map,start,3);
  assert.equal(routes.size,6);
  for(const cell of routes.values()){
    assert.equal(gridSteps({column:3,row:2},cell,true),1);
    assert.deepEqual(measureMapRoute(map,start,centre(cell.column,cell.row)),
      {squares:1,metres:3,gridMetres:3,pathMetres:3});
  }
  map.terrainCells=validateTerrainCells([{column:4,row:2,kind:'wall',blocksSight:false},{column:2,row:2,kind:'difficult'}],7,5);
  const weighted=mapReachableRoutes(map,start,6);
  assert.ok(!weighted.has('4:2'));assert.equal(weighted.get('2:2').cost,6);
  assert.equal(measureMapRoute(map,start,centre(4,2)).pathMetres,null);
  assert.equal(map.terrainCells.find(c=>c.column===4).blocksSight,false);
  assert.throws(()=>validateTerrainCells([{column:7,row:2,kind:'wall'}],7,5),/column/);
});

test('published terrain omits concealed cells and keeps a legacy map square',async()=>{
  const {publicPresentationBattleMap}=await import('../src/state/livePresentationProjectionModel.mjs');
  const map={visibility:'players',kind:'image',storagePath:'campaigns/c/battleMaps/m/scene.png',
    contentType:'image/png',gridColumns:2,gridRows:1,fogEnabled:true,fogCells:'10',
    terrainCells:[{column:0,row:0,kind:'water'},{column:1,row:0,kind:'hazard'}]};
  const safe=publicPresentationBattleMap(map,'c','m');
  assert.equal(safe.gridType,'square');assert.equal(safe.metresPerCell,1);
  assert.deepEqual(safe.terrainCells.map(c=>c.kind),['water']);
});

test('swim and climb routes respect solid terrain on calibrated maps',()=>{
  const board={...map,gridType:'square',gridColumns:3,gridRows:1,
    terrainCells:[{column:1,row:0,kind:'wall'}],
    tokens:[{id:'hero',combatantId:'pc-a',kind:'character',label:'Hero',x:16.67,y:50}]};
  for(const kind of ['swim','climb','climb-dash']){
    const actor={...encounter.combat.participants['pc-a'],movement:{kind,remaining:20}};
    const state={...encounter,combat:{...encounter.combat,participants:{'pc-a':actor}}};
    assert.throws(()=>combatMapMovePlan(board,state,'pc-a',{x:83.33,y:50}),/No traversable route/);
  }
});
test('new uploads start at three metres per hex and old map geometry survives editing',async()=>{
  const {newBattleMapSettings,battleMapEditableSettings}=await import('../src/state/battleMapModel.mjs');
  const create=newBattleMapSettings({name:'New map'}),old=battleMapEditableSettings({name:'Older map'});
  assert.deepEqual([create.gridType,create.metresPerCell,old.gridType,old.metresPerCell],['hex',3,'square',1]);
  assert.equal(newBattleMapSettings({name:'Square map',gridType:'square',metresPerCell:2}).metresPerCell,2);
});
