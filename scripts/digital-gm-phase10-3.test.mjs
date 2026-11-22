import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseReactRoute,buildReactRoute} from '../src/app/asteriaRoutes.mjs';
import {
  PRESENTATION_DEFAULT,publicPresentation,validatePresentationAction,
  safePartyPresentation,safeCombatPresentation
} from '../src/state/playerPresentationModel.mjs';
import {
  buildGMSearchIndex,searchGMIndex,searchResultDestination,SEARCH_INDEX_LIMIT,SEARCH_LIMIT
} from '../src/state/gmUnifiedSearchModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const gm=read('src/dashboards/GMDashboard.jsx');
const player=read('src/dashboards/CharacterDashboard.jsx');
const presentation=read('src/dashboards/PlayerPresentationWorkspace.jsx');
const search=read('src/dashboards/GMUnifiedSearch.jsx');
const atlas=read('src/dashboards/WorldAtlasWorkspace.jsx');
const battle=read('src/dashboards/BattleMapWorkspace.jsx');
const service=read('src/firebase/asteriaFirebaseService.js');
const backend=read('functions/handler.mjs');
const model=read('src/state/gmUnifiedSearchModel.mjs');
const sources=Object.freeze({
 workspace:{
  world:{npcs:[{id:'n1',name:'Archivist',location:'North',notes:'GM ONLY PLOT'}],
   settlements:[{id:'s1',name:'Oak City',region:'North'}]},
  quests:[{id:'q1',title:'Northern Trail',gmNotes:'PRIVATE REWARD'}]
 },
 characters:{hero:{id:'hero',name:'Lyris',level:5,klass:'Paladin',notes:'DO NOT DISPLAY'}},
 itemEcosystem:{shops:[{id:'sh1',name:'Tradepost',type:'Merchant',stock:[{name:'SECRET SWORD'}]}]},
 battleMaps:[{id:'bm1',name:'The Frost Gate',visibility:'players'}],
 worldMaps:[{id:'wm1',name:'Northern Reach',status:'published'}],
 sessionNotes:[{id:'note1',title:'Chapter 3',body:'PRIVATE BOSS'}]
});
test('Presentation routing is campaign-bound and separate from GM and character dashboards',()=>{
 for(const type of ['gm','presentation'])assert.deepEqual(
  parseReactRoute(buildReactRoute({type,campaignId:'campaign-10'})),
  {type,campaignId:'campaign-10',characterId:''}
 );
 assert.deepEqual(parseReactRoute(buildReactRoute({type:'character',campaignId:'campaign-10',characterId:'hero'})),
  {type:'character',campaignId:'campaign-10',characterId:'hero'});
 assert.match(read('src/app/AsteriaReactRoot.jsx'),/route\.type === 'presentation'/);
 assert.match(read('src/app/AsteriaReactRoot.jsx'),/\$\{accountScope\}\/\$\{route\.type\}/);
 assert.match(read('src/app/AsteriaAppContext.jsx'),/asteria:firebase-signed-out/);
});
test('GM access gate stays ahead of unified search and presentation controller',()=>{
 const gate=gm.indexOf('if(!window.AsteriaCharacterAccess.isGM(');
 const searchMount=gm.indexOf('<GMUnifiedSearch');
 const presentationMount=gm.indexOf('<GMPlayerPresentationWorkspace');
 assert.ok(gate>=0 && gate<searchMount && gate<presentationMount);
 assert.ok(!player.includes('<GMUnifiedSearch'));
 assert.ok(!player.includes('<GMPlayerPresentationWorkspace'));
 assert.match(service,/subscribePresentationDisplay/);
 assert.match(service,/managePlayerPresentation/);
 assert.match(backend,/managePlayerPresentation/);
});
test('GM search uses private, lazy, unsubscribed listeners and no global shared index',()=>{
 assert.match(search,/if\(!campaignId\|\|!enabled\)return undefined/);
 assert.match(search,/subscriptions\.forEach\(stop=>/);
 assert.match(search,/setSources\(emptySources\(\)\)/);
 assert.match(search,/setOpen\(false\);setQuery\(''\);setCategory\('all'\)/);
 assert.match(search,/useMemo\(\(\)=>open\?buildGMSearchIndex/);
 assert.match(gm,/characters=\{rawLive\.characters\}/);
 assert.ok(SEARCH_INDEX_LIMIT<=3000&&SEARCH_LIMIT<=50);
 assert.ok(!/setDoc\(|addDoc\(|localStorage\.setItem|fetch\(/.test(search));
});
test('Opening a searched character selects the matching live roster before navigation',()=>{
 assert.match(gm,/if\(result\.category==='character'\)/);
 assert.match(gm,/if\(!result\.id\|\|!rawLive\.characters\[result\.id\]\)return/);
 assert.match(gm,/setSelectedId\(result\.id\)/);
 assert.match(gm,/setGMSearchTarget\(null\);setGMHubDestination\(null\);setTab\(next\)/);
 assert.match(gm,/setGMHubDestination\(null\);setGMSearchTarget\(null\)/);
 const index=buildGMSearchIndex(sources);
 const match=searchGMIndex(index,'Lyris')[0];
 assert.deepEqual(searchResultDestination(match),{
  tab:'inventory',id:'hero',title:'Lyris',category:'character',targetId:'',section:''
 });
});
test('Search only exposes allowlisted metadata, not GM notes or stored inventory details',()=>{
 const index=buildGMSearchIndex(sources);
 for(const word of ['GM ONLY PLOT','PRIVATE REWARD','DO NOT DISPLAY','SECRET SWORD','PRIVATE BOSS'])
  assert.ok(!JSON.stringify(index).includes(word));
 assert.equal(searchGMIndex(index,'archivist')[0]?.tab,'bestiary');
 assert.equal(searchGMIndex(index,'frost gate')[0]?.tab,'battle-maps');
 assert.equal(searchGMIndex(index,'northern trail')[0]?.tab,'quests');
 assert.equal(searchGMIndex(index,'chapter 3')[0]?.tab,'session-library');
 assert.equal(searchGMIndex(index,'oak city')[0]?.section,'settlements');
 assert.match(model,/SEARCH_INDEX_LIMIT/);
});
test('Projector uses safe campaign media projections, never raw GM encounter or map readers',()=>{
  const view=read('src/dashboards/presentation/CampaignPresentationWorkspace.jsx');
  const media=read('src/dashboards/presentation/firebaseCampaignMediaService.mjs');
  assert.match(presentation,/CampaignPresentationDisplay/);
  assert.match(presentation,/RestrictedPresentationDisplay/);
  assert.match(view,/watchPresentation/);
  assert.match(media,/combatPublicRef/);
  assert.match(media,/publicMapCol/);
  assert.match(media,/watchRestrictedViewer/);
  assert.match(read('src/state/livePresentationProjectionModel.mjs'),/publicCombatSnapshot/);
  assert.doesNotMatch(view,/subscribeCampaignEncounter/);
  assert.match(battle,/useBattleMaps\(campaignId,false\)/);
  assert.match(read('firestore.rules'),/match \/combatPublic\/\{documentId\}/);
  assert.match(read('firestore.rules'),/match \/battleMapsPublic\/\{mapId\}/);
});test('Title and announcements share one safe projector scene and responsive fullscreen runtime',()=>{
  const view=read('src/dashboards/presentation/CampaignPresentationWorkspace.jsx');
  const runtime=read('src/dashboards/presentation/usePresentationDisplayRuntime.js');
  assert.ok(view.includes("['title','announcement']"));
  assert.match(view,/sceneTitle/);
  assert.match(view,/toggleFullscreen/);
  assert.match(runtime,/visibilitychange/);
  assert.match(read('src/dashboards/presentation/CampaignPresentationWorkspace.module.css'),/@media\(max-width:660px\)/);
});test('Blackout and strict schema prevent stale GM material reaching the shared screen',()=>{
 const draft={scene:'party',title:'The Heroes',subtitle:'',mapId:'',
  characterIds:['hero'],showRound:false,showPartyHP:false,theme:'obsidian'};
 const scene=publicPresentation(draft,1);
 assert.equal(scene.characterIds.length,1);
 assert.ok(!('updatedBy' in scene));
 assert.throws(()=>validatePresentationAction({type:'set-scene',expectedRevision:0,
  draft:{...draft,gmNotes:'secret'}}));
 const safe=safePartyPresentation(sources.characters,['hero'],false);
 assert.equal(safe[0].name,'Lyris');
 assert.ok(!JSON.stringify(safe).includes('DO NOT DISPLAY'));
 assert.equal(safeCombatPresentation({status:'active',round:2,turnIndex:0,
  combatants:[{kind:'enemy',name:'SECRET NPC',hp:2000}]},sources.characters).current,'GM turn');
 assert.equal(PRESENTATION_DEFAULT.scene,'blank');
 assert.match(presentation,/type:'blackout'/);
});
test('Backend and Firestore still restrict read/write control to authenticated campaign members',()=>{
 const rules=read('firestore.rules');
 assert.match(rules,/match \/presentationControl\/\{documentId\} \{[\s\S]*?allow create, update, delete: if false/);
 assert.match(rules,/match \/presentationShared\/\{documentId\} \{[\s\S]*?allow create, update, delete: if false/);
 const commands=read('functions/playerPresentationCommands.mjs');
 assert.match(commands,/await requireCampaignGM\(transaction,campaignId\)/);
 assert.match(commands,/map\.data\(\)\.visibility!=='players'/);
 assert.match(commands,/map\.data\(\)\.status!=='published'/);
 assert.match(commands,/transaction\.set\(sharedRef/);
 assert.match(read('functions/commands.mjs'),/createPlayerPresentationCommands\(context/);
});
test('All Phase 10 modules are wired into the live app and production build pipeline',()=>{
 const paths=['src/dashboards/GMUnifiedSearch.jsx','src/dashboards/PlayerPresentationWorkspace.jsx',
  'src/styles/gm-unified-search.css','src/styles/player-presentation.css',
  'src/state/gmUnifiedSearchModel.mjs','src/state/playerPresentationModel.mjs'];
 for(const path of paths)assert.ok(read(path).length>200,path+' missing');
 assert.match(read('package.json'),/"build": "vite build"/);
 assert.match(read('.github/workflows/firebase-deploy.yml'),/inputs\.operation == 'deploy'/);
 assert.match(read('.github/workflows/firebase-deploy.yml'),/--only functions,firestore,storage/);
});
