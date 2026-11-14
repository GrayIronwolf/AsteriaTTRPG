import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 PRESENTATION_DEFAULT,presentationId,presentationDraft,validatePresentationAction,
 publicPresentation,safeCombatPresentation,safePartyPresentation
} from '../src/state/playerPresentationModel.mjs';
import {createPlayerPresentationCommands} from '../functions/playerPresentationCommands.mjs';
import {parseReactRoute,buildReactRoute} from '../src/app/asteriaRoutes.mjs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const draft={scene:'title',title:'Welcome to Asteria',subtitle:'Chapter One',mapId:'',
 characterIds:[],showRound:false,showPartyHP:false,theme:'obsidian'};
function harness(isGM=true){
 const data=new Map(),read=[],write=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{read.push(ref.path);return {exists:()=>data.has(ref.path),data:()=>data.get(ref.path)};},
  set:(ref,value)=>{write.push(ref.path);data.set(ref.path,value);}
 };
 const commands=createPlayerPresentationCommands({
  db:{},doc,currentUser:{uid:isGM?'gm':'alice'},runTransaction:async(_,fn)=>fn(tx),serverTimestamp:()=>123
 },{requireCampaignGM:async()=>{if(!isGM)throw Error('GM permission required.');}});
 const call=action=>commands.managePlayerPresentation('campaign-one','gm-scope',action);
 return {data,read,write,call};
}
test('Routes support campaign-scoped, signed-in presentation without character IDs',()=>{
 const route={type:'presentation',campaignId:'camp-one'};
 assert.equal(buildReactRoute(route),'#/react/presentation/camp-one');
 assert.deepEqual(parseReactRoute('#/react/presentation/camp-one'),{...route,characterId:''});
 assert.equal(parseReactRoute('#/react/presentation/'),null);
 assert.throws(()=>buildReactRoute({type:'presentation',campaignId:''}));
 assert.equal(presentationId('../secret'),false);
});
test('Presentation drafts reject unexpected hidden data, GM-only scenes and invalid options',()=>{
 assert.deepEqual(presentationDraft(draft),draft);
 assert.throws(()=>presentationDraft({...draft,secretNotes:'GM private'}));
 assert.throws(()=>presentationDraft({...draft,scene:'gm-notes'}));
 assert.throws(()=>presentationDraft({...draft,title:'x'.repeat(121)}));
 assert.throws(()=>presentationDraft({...draft,theme:'hacked'}));
 assert.throws(()=>presentationDraft({...draft,characterIds:['bad/..']}));
 assert.throws(()=>presentationDraft({...draft,scene:'battle-map',mapId:''}));
 assert.throws(()=>presentationDraft({...draft,scene:'world-map',mapId:'../hidden'}));
 assert.throws(()=>presentationDraft({...draft,scene:'party',characterIds:Array(9).fill('a')}));
 assert.throws(()=>validatePresentationAction({...{type:'blackout',expectedRevision:0},gmRole:true}));
 assert.throws(()=>validatePresentationAction({type:'set-scene',expectedRevision:0,draft:{...draft,privateEncounter:{}}}));
 assert.deepEqual(Object.keys(publicPresentation(draft,1)).sort(),
  ['version','revision','scene','title','subtitle','mapId','characterIds','showRound','showPartyHP','theme'].sort());
});
test('GM publishes safe projection and blackout removes all scene details',async()=>{
 const h=harness();
 let result=await h.call({type:'set-scene',expectedRevision:0,draft});
 assert.equal(result.ok,true,result.error);
 const safe=h.data.get('campaigns/campaign-one/presentationShared/current');
 assert.equal(safe.scene,'title');assert.equal(safe.title,'Welcome to Asteria');
 assert.equal(safe.updatedBy,undefined);
 assert.equal((await h.call({type:'set-scene',expectedRevision:0,draft})).ok,false);
 result=await h.call({type:'blackout',expectedRevision:1});
 assert.equal(result.ok,true,result.error);
 const black=h.data.get('campaigns/campaign-one/presentationShared/current');
 assert.equal(black.scene,'blank');
 assert.equal(black.title,'');assert.equal(black.subtitle,'');assert.deepEqual(black.characterIds,[]);
});
test('GM can select only already published battle and world maps',async()=>{
 const h=harness();
 const battle={...draft,scene:'battle-map',mapId:'map1'};
 assert.equal((await h.call({type:'set-scene',expectedRevision:0,draft:battle})).ok,false);
 h.data.set('campaigns/campaign-one/battleMaps/map1',{id:'map1',visibility:'gm'});
 assert.equal((await h.call({type:'set-scene',expectedRevision:0,draft:battle})).ok,false);
 h.data.set('campaigns/campaign-one/battleMaps/map1',{id:'map1',visibility:'players'});
 assert.equal((await h.call({type:'set-scene',expectedRevision:0,draft:battle})).ok,true);
 const atlas={...draft,scene:'world-map',mapId:'world1'};
 assert.equal((await h.call({type:'set-scene',expectedRevision:1,draft:atlas})).ok,false);
 h.data.set('campaigns/campaign-one/worldAtlasShared/world1',{id:'world1',status:'published',visibility:'players'});
 assert.equal((await h.call({type:'set-scene',expectedRevision:1,draft:atlas})).ok,true);
});
test('Party selection requires campaign characters, and private fields are never projected',async()=>{
 const h=harness();
 const party={...draft,scene:'party',characterIds:['hero'],showPartyHP:true};
 assert.equal((await h.call({type:'set-scene',expectedRevision:0,draft:party})).ok,false);
 h.data.set('campaigns/campaign-one/characters/hero',{id:'hero',name:'Lyris'});
 assert.equal((await h.call({type:'set-scene',expectedRevision:0,draft:party})).ok,true);
 const person={id:'hero',name:'Lyris',klass:'Paladin',level:4,hp:13,hpMax:21,
  notes:'SECRET',inventory:[{name:'Hidden Relic'}],spells:['Meteor']};
 assert.deepEqual(safePartyPresentation({hero:person},['hero'],false),[
  {id:'hero',name:'Lyris',className:'Paladin',level:4}]);
 assert.deepEqual(safePartyPresentation({hero:person},['hero'],true),[
  {id:'hero',name:'Lyris',className:'Paladin',level:4,hp:13,hpMax:21}]);
});
test('Combat scene shows only active public character turns, never NPC statistics',()=>{
 const characters={hero:{id:'hero',name:'Grayson'}};
 const active={status:'active',round:7,turnIndex:0,combatants:[
  {id:'enemy',kind:'enemy',name:'Secret Dragon',ac:38,hp:950,abilities:['death']},
  {id:'hero',kind:'player',characterId:'hero',name:'Grayson'}
 ],enemies:[{name:'Secret Dragon',hp:950}]};
 assert.deepEqual(safeCombatPresentation(active,characters),{
  active:true,round:7,current:'GM turn'});
 assert.deepEqual(safeCombatPresentation({...active,turnIndex:1},characters),{
  active:true,round:7,current:'Grayson'});
 assert.equal(JSON.stringify(safeCombatPresentation(active,characters)).includes('Dragon'),false);
 assert.deepEqual(safeCombatPresentation({status:'ended'},characters),{
  active:false,round:0,current:'Combat not active'});
});
test('Unauthorised player writes never access private map or presentation data',async()=>{
 const h=harness(false);
 const result=await h.call({type:'set-scene',expectedRevision:0,draft});
 assert.equal(result.ok,false);
 assert.deepEqual(h.read,[]);assert.deepEqual(h.write,[]);
});
test('UI, backend commands and member-only Firestore rules are connected',()=>{
 const source=[
 'src/dashboards/GMDashboard.jsx','src/dashboards/PlayerPresentationWorkspace.jsx',
 'src/app/AsteriaReactRoot.jsx','src/dashboards/BattleMapWorkspace.jsx',
 'src/dashboards/WorldAtlasWorkspace.jsx','functions/commands.mjs',
 'functions/handler.mjs','js/firebase-auth.js','src/firebase/asteriaFirebaseService.js',
 'firestore.rules'
 ].map(file).join('\n');
 for(const token of ['GMPlayerPresentationWorkspace','PlayerPresentationDisplay',
  'managePlayerPresentation','subscribePresentationDisplay','presentationShared',
  'presentationControl','mapId={display.mapId}','PlayerBattleMapView',
  'PlayerWorldAtlas'])assert.ok(source.includes(token),'Missing '+token);
 assert.match(file('firestore.rules'),/match \/presentationShared/);
});
