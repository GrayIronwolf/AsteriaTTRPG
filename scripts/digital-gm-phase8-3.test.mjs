import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 atlasFileError,atlasImagePath,atlasImageDimensions,atlasMapSettings,
 atlasPin,atlasPins,atlasRoute,atlasRoutes,atlasPublicProjection,
 atlasMapCanPreview,atlasPointFromEvent,validateAtlasAction,atlasRows
} from '../src/state/worldAtlasModel.mjs';
import {createWorldAtlasCommands} from '../functions/worldAtlasCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const pinA={id:'capital',name:'Vaelgard',description:'Northern capital',kind:'settlement',
 x:22,y:40,visibility:'players',linkedType:'location',linkedId:'vaelgard'};
const pinB={id:'secret',name:'Hidden gate',description:'GM secret cavern',kind:'discovery',
 x:65,y:78,visibility:'gm',linkedType:'event',linkedId:'hidden-quest'};
const pinC={id:'port',name:'Cryon',description:'Harbour town',kind:'settlement',
 x:80,y:35,visibility:'players',linkedType:'',linkedId:''};
const visibleRoute={id:'road',name:'Northern road',description:'Forest approach',
 fromId:'capital',toId:'port',visibility:'players',travelDays:4};
const hiddenRoute={id:'secret-route',name:'Forgotten passage',description:'GM note',
 fromId:'capital',toId:'secret',visibility:'players',travelDays:1};
const settings={name:'Altarin',description:'Northern territory',region:'Altarin',visibility:'gm'};
const mapPath='campaigns/campaign-one/worldAtlas/altar-in';
function harness(denied=false){
 const store=new Map(),reads=[],writes=[];
 const doc=(_db,...paths)=>({path:paths.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const value=store.get(ref.path);
   return {exists:()=>value!==undefined,data:()=>value};},
  set:(ref,value,opts)=>{writes.push(['set',ref.path]);
   store.set(ref.path,opts?.merge?{...store.get(ref.path),...value}:value);},
  update:(ref,value)=>{writes.push(['update',ref.path]);store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(['delete',ref.path]);store.delete(ref.path);}
 };
 const context={db:{},doc,currentUser:{uid:'gm'},serverTimestamp:()=>123,
  runTransaction:async(_db,work)=>work(tx)};
 const commands=createWorldAtlasCommands(context,{requireCampaignGM:async()=>{
  if(denied)throw Error('GM only');
 }});
 return {run:action=>commands.manageWorldAtlas('campaign-one','gm-scope',action),store,reads,writes};
}
const create={type:'create',mapId:'altar-in',settings,contentType:'image/png',width:2000,height:1200};
test('Upload checks canonical private image types, dimensions and scoped paths',()=>{
 assert.equal(atlasFileError({type:'image/png',size:1200}),'');
 assert.match(atlasFileError({type:'video/mp4',size:1200}),/PNG/);
 assert.match(atlasFileError({type:'image/png',size:9*1024*1024}),/8 MB/);
 assert.equal(atlasImagePath('camp','map','image/webp'),'campaigns/camp/worldAtlas/map/atlas.webp');
 assert.throws(()=>atlasImagePath('../camp','map','image/png'));
 assert.throws(()=>atlasImageDimensions(0,500));
 assert.equal(atlasMapCanPreview({id:'map',contentType:'image/png',
  storagePath:'campaigns/camp/worldAtlas/map/atlas.png'},'camp'),true);
 assert.equal(atlasMapCanPreview({id:'map',contentType:'image/png',storagePath:'unsafe'},'camp'),false);
});
test('Pin and route validation limits malicious fields, coordinates and hidden references',()=>{
 assert.deepEqual(atlasPins([pinA,pinB]).map(x=>x.id),['capital','secret']);
 assert.throws(()=>atlasPin({...pinA,x:130}));
 assert.throws(()=>atlasPin({...pinA,visibility:'anonymous'}));
 assert.throws(()=>atlasPin({...pinA,secretText:'never'}));
 assert.throws(()=>atlasPins([pinA,pinA]));
 assert.throws(()=>atlasPins(Array.from({length:101},(_,n)=>({...pinA,id:'pin-'+n}))));
 assert.equal(atlasRoute(visibleRoute,[pinA,pinC]).travelDays,4);
 assert.throws(()=>atlasRoute({...visibleRoute,toId:'fake'},[pinA,pinC]));
 assert.throws(()=>atlasRoute({...visibleRoute,travelDays:-1},[pinA,pinC]));
 assert.throws(()=>atlasRoutes([visibleRoute,visibleRoute],[pinA,pinC]));
 assert.equal(atlasPointFromEvent({clientX:150,clientY:250},{
  getBoundingClientRect:()=>({left:100,top:200,width:200,height:100})
 }).x,25);
});
test('Public projection never reveals GM pins, secret linked IDs or routes to hidden endpoints',()=>{
 const draft={id:'altar-in',...settings,visibility:'players',status:'published',
  storagePath:'campaigns/campaign-one/worldAtlas/altar-in/atlas.png',
  contentType:'image/png',width:2000,height:1200,revision:3,
  pins:[pinA,pinB,pinC],routes:[visibleRoute,hiddenRoute],privateNotes:'secret'};
 const shared=atlasPublicProjection(draft);
 assert.deepEqual(shared.pins.map(p=>p.id),['capital','port']);
 assert.deepEqual(shared.routes.map(r=>r.id),['road']);
 assert.equal(shared.pins[0].linkedType,undefined);
 assert.equal(shared.pins[0].linkedId,undefined);
 assert.equal(JSON.stringify(shared).includes('hidden-quest'),false);
 assert.equal(JSON.stringify(shared).includes('secret cavern'),false);
 assert.equal(shared.privateNotes,undefined);
 assert.throws(()=>atlasPublicProjection({...draft,status:'draft'}));
 assert.deepEqual(atlasRows([{id:'one',name:'One',status:'draft'},{status:'archived'}]).length,1);
});
test('Atlas action validators reject unauthorized field injection and stale revisions',()=>{
 assert.equal(validateAtlasAction(create),'create');
 assert.throws(()=>validateAtlasAction({...create,ownerUid:'player'}));
 assert.throws(()=>validateAtlasAction({type:'publish',mapId:'map',expectedRevision:0}));
 assert.throws(()=>validateAtlasAction({type:'update',mapId:'map',expectedRevision:1,
  settings,pins:[{...pinA,x:101}],routes:[]}));
 assert.throws(()=>validateAtlasAction({type:'publish',mapId:'map',expectedRevision:1,
  gmOnlyPins:[pinB]}));
});
test('GM-only creation, edits and explicit publication keep player projection isolated',async()=>{
 const h=harness();
 const first=await h.run(create);
 assert.equal(first.ok,true,first.error);
 const original=h.store.get(mapPath);
 assert.equal(original.visibility,'gm');
 assert.equal(original.status,'draft');
 assert.equal(h.store.has('campaigns/campaign-one/worldAtlasShared/altar-in'),false);
 const saved=await h.run({type:'update',mapId:'altar-in',expectedRevision:1,settings,
  pins:[pinA,pinB,pinC],routes:[visibleRoute,hiddenRoute]});
 assert.equal(saved.ok,true,saved.error);
 const pub=await h.run({type:'publish',mapId:'altar-in',expectedRevision:2});
 assert.equal(pub.ok,true,pub.error);
 const safe=h.store.get('campaigns/campaign-one/worldAtlasShared/altar-in');
 assert.deepEqual(safe.pins.map(p=>p.id),['capital','port']);
 assert.deepEqual(safe.routes.map(r=>r.id),['road']);
 assert.equal(safe.createdBy,undefined);
 assert.equal(safe.privateNotes,undefined);
 const conflict=await h.run({type:'update',mapId:'altar-in',expectedRevision:2,
  settings,pins:[pinA],routes:[]});
 assert.equal(conflict.ok,false);
 const retired=await h.run({type:'unpublish',mapId:'altar-in',expectedRevision:3});
 assert.equal(retired.ok,true,retired.error);
 assert.equal(h.store.has('campaigns/campaign-one/worldAtlasShared/altar-in'),false);
 const archive=await h.run({type:'archive',mapId:'altar-in',expectedRevision:4});
 assert.equal(archive.ok,true,archive.error);
 assert.equal(h.store.get(mapPath).status,'archived');
 assert.equal((await h.run({type:'publish',mapId:'altar-in',expectedRevision:5})).ok,false);
 assert.equal(h.writes.some(x=>/characters|currency|combat|calendarState|weatherReports/.test(x[1])),false);
});
test('GM authorization precedes database reads and prevents client-forged maps',async()=>{
 const h=harness(true);
 const blocked=await h.run(create);
 assert.equal(blocked.ok,false);
 assert.match(blocked.error,/GM only/);
 assert.equal(h.reads.length,0);
 assert.equal(h.writes.length,0);
});
test('Both dashboards use the Atlas, private media and public projection subscriptions',()=>{
 const source=['src/dashboards/GMDashboard.jsx','src/dashboards/CharacterDashboard.jsx',
  'src/dashboards/WorldAtlasWorkspace.jsx','src/state/gmToolkitModel.mjs',
  'functions/handler.mjs','functions/commands.mjs','js/firebase-auth.js','firestore.rules',
  'storage.rules'].map(read).join('\n');
 for(const required of ['GMWorldAtlasWorkspace','PlayerWorldAtlas','manageWorldAtlas',
  'subscribeWorldAtlas','uploadWorldAtlas','fetchWorldAtlasMedia',
  'worldAtlasShared','atlasConfig','worldAtlas','atlasImagePath'])
  assert.ok(source.includes(required),'Missing atlas wiring: '+required);
 assert.match(read('src/dashboards/WorldAtlasWorkspace.jsx'),/AtlasContext/);
 assert.match(read('src/dashboards/WorldAtlasWorkspace.jsx'),/formatAsteriaDate/);
});
