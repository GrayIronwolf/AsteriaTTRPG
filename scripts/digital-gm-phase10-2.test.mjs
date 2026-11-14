import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildGMSearchIndex,searchGMIndex,searchResultDestination,categoryCounts,
 SEARCH_LIMIT,SEARCH_CATEGORIES,SEARCH_INDEX_LIMIT
} from '../src/state/gmUnifiedSearchModel.mjs';

const samples={
 workspace:{
  world:{
   npcs:[{id:'npc1',name:'Arlen the Trader',role:'Merchant',location:'Vaelgard',
    notes:'SECRET: King is the traitor',plot:'hidden'}],
   creatures:[{id:'cre1',name:'Ice Wyrm',species:'Draken',threatTier:12,notes:'Secret HP'}],
   merchants:[{id:'mer1',name:'Madame Elya',location:'Glavik'}],
   regions:[{id:'loc1',name:'Altarin',type:'Polar'}],
   settlements:[{id:'loc1',name:'Vaelgard',region:'Altarin'}],
   factions:[{id:'f1',name:'Silver Ravens',region:'North'}],
   events:[{id:'e1',name:'Winter Solstice',location:'Vaelgard'}]
  },
  quests:[{id:'quest1',title:'The Frozen Gate',questGiver:'Arlen',
   location:'Vaelgard',gmNotes:'SECRET PORTAL KEY'}],
  gameplay:{encounterTemplates:[{id:'et1',name:'Dragon Ambush',biome:'mountains'}]}
 },
 itemEcosystem:{shops:[{id:'shop1',name:'Elya General Goods',region:'Glavik',
  stock:[{name:'Invisible Sword'}]}]},
 characters:{hero1:{id:'hero1',name:'Kalin',klass:'Ranger',level:9,
  inventory:[{name:'Secret Blade'}]}},
 battleMaps:[{id:'bm1',name:'Winter Battlefield',kind:'video',visibility:'players',
  tokens:[{name:'Hidden Evil'}]}],
 worldMaps:[{id:'wm1',name:'Northern Wilderness',region:'Altarin',status:'published',
  pins:[{name:'Secret Tomb'}]}],
 encounterPlans:[{id:'enc1',name:'Frost Giant Encounter',status:'draft',threatTier:7,
  secretNPC:'Do not reveal'}],
 randomTables:[{id:'ran1',name:'Storm Events',category:'weather',location:'Altarin'}],
 lootTables:[{id:'loot1',name:'Ancient Loot',location:'Noran'}],
 sessionNotes:[{id:'note1',title:'Session 8 Preparation',kind:'prep',
  body:'SECRET: king will die'}],
 sessionPdfs:[{id:'pdf1',title:'Handout: Northern Sea',fileName:'north-sea.pdf',
  visibility:'gm',fileContents:'SECRET'}]
};
const index=buildGMSearchIndex(samples);
const matches=(query,category='all')=>searchGMIndex(index,query,category);
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Indexes all GM resource types without relying on a remote search service',()=>{
 for(const category of ['tool','npc','creature','merchant','shop','battle-map','world-map',
  'location','faction','event','quest','encounter','random-table','loot-table','note','pdf','character']){
  assert.ok(index.some(row=>row.category===category),'Missing '+category);
 }
 assert.equal(matches('Arlen')[0].title,'Arlen the Trader');
 assert.equal(matches('Elya General Goods')[0].category,'shop');
 assert.equal(matches('Frost Giant Encounter')[0].category,'encounter');
 assert.equal(matches('Winter Battlefield')[0].category,'battle-map');
 assert.ok(index.length<SEARCH_INDEX_LIMIT);
});
test('No raw private record data, notes, inventory, draft secrets or HTML copied into result index',()=>{
 const encoded=JSON.stringify(index);
 for(const phrase of ['king is the traitor','SECRET PORTAL KEY','Invisible Sword',
  'Secret Blade','Secret Tomb','Do not reveal','king will die','Secret HP'])
  assert.equal(encoded.includes(phrase),false,'Leaked: '+phrase);
 const npc=index.find(r=>r.id==='npc1');
 assert.deepEqual(Object.keys(npc).sort(),[
  'category','detail','id','key','searchText','section','tab','targetId','title'
 ].sort());
 assert.equal(npc.tab,'bestiary');
 assert.equal(npc.notes,undefined);
});
test('Query matching uses normalized case, partial terms, accents and relevance ranking',()=>{
 assert.equal(matches('aRlEn')[0].id,'npc1');
 assert.ok(matches('vaelgard').some(r=>r.title==='Arlen the Trader'));
 assert.equal(matches('frozen gate')[0].category,'quest');
 assert.equal(matches('missing never found').length,0);
 assert.equal(matches('', 'all').length,0);
 assert.ok(matches('','tool').length>0);
 assert.equal(searchGMIndex([{title:'Élyà',searchText:'elya',category:'npc',
  key:'npc:elya'}],'Elya')[0]?.title,'Élyà');
 const ranked=searchGMIndex([
  {title:'Dragon',searchText:'dragon',category:'npc',key:'npc:a',detail:''},
  {title:'A strange dragon tale',searchText:'a strange dragon tale',category:'npc',key:'npc:b',detail:''}
 ],'dragon');
 assert.equal(ranked[0].title,'Dragon');
});
test('Facet filtering, counts and bounded output prevent runaway result lists',()=>{
 assert.equal(matches('Vaelgard','location').length,1);
 assert.ok(matches('Vaelgard','npc').some(x=>x.id==='npc1'));
 assert.equal(matches('Vaelgard','creature').length,0);
 assert.equal(matches('Vaelgard','invalid-facet').length,0);
 assert.ok(categoryCounts(index).npc>=1);
 assert.equal(categoryCounts(index).all,index.length);
 const many=Array.from({length:200},(_,i)=>({
  key:'npc:'+i,category:'npc',title:'Goblin '+i,detail:'',searchText:'goblin'
 }));
 assert.equal(searchGMIndex(many,'goblin').length,SEARCH_LIMIT);
 assert.equal(searchGMIndex(many,'goblin','all',10000).length,SEARCH_LIMIT);
 assert.equal(SEARCH_CATEGORIES[0],'all');
});
test('Deep links resolve only registered tabs, typed IDs and specific world collections',()=>{
 const shop=index.find(r=>r.id==='shop1');
 assert.deepEqual(searchResultDestination(shop),{
  tab:'economy',id:'shop1',title:'Elya General Goods',category:'shop',
  targetId:'react-gm-shops',section:''
 });
 const region=index.find(r=>r.category==='location'&&r.title==='Altarin');
 assert.equal(searchResultDestination(region).section,'regions');
 const settlement=index.find(r=>r.category==='location'&&r.title==='Vaelgard');
 assert.equal(searchResultDestination(settlement).section,'settlements');
 const tool=index.find(r=>r.category==='tool'&&r.id==='battle-maps');
 assert.equal(searchResultDestination(tool).tab,'battle-maps');
 assert.equal(searchResultDestination({...tool,tab:'settings'}),null);
 assert.equal(searchResultDestination({...shop,category:'not-a-category'}),null);
 assert.equal(searchResultDestination({...shop,tab:'https://evil.example'}).tab,'economy');
 assert.equal(searchResultDestination({...shop,id:'../private'}).id,'');
});
test('Index preserves unique results when region and settlement use the same ID',()=>{
 const records=matches('','location');
 assert.ok(records.some(r=>r.title==='Altarin'));
 assert.ok(records.some(r=>r.title==='Vaelgard'));
 assert.equal(new Set(index.map(x=>x.key)).size,index.length);
});
test('Search UI and GM-only data access integrate with existing dashboard navigation',()=>{
 const ui=read('src/dashboards/GMUnifiedSearch.jsx');
 const dashboard=read('src/dashboards/GMDashboard.jsx');
 const all=[ui,dashboard,read('src/dashboards/GMWorkspacePanels.jsx'),
  read('src/dashboards/GMNpcCreatureLibrary.jsx'),
  read('src/dashboards/BattleMapWorkspace.jsx'),
  read('src/dashboards/WorldAtlasWorkspace.jsx'),
  read('src/dashboards/SessionLibraryWorkspace.jsx')].join('\n');
 for(const value of ['GMUnifiedSearch','searchResultDestination','openGMSearchResult',
  'subscribeBattleMaps','subscribeWorldAtlas','subscribeRandomTables',
  'subscribeLootTables','subscribeSessionNotes','subscribeSessionPdfs',
  'searchTarget={gmSearchTarget}','searchTarget={searchTarget}'])
  assert.ok(all.includes(value),'Missing '+value);
 assert.ok(ui.includes('Ctrl+K')||ui.includes('⌘K'));
 assert.match(dashboard,/if\(!window\.AsteriaCharacterAccess\.isGM/);
 assert.ok(!ui.includes('localStorage.setItem'));
 assert.ok(!ui.includes('getDownloadURL'));
});
