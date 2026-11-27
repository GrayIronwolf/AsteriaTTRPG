import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayerPresentationCommands} from '../functions/playerPresentationCommands.mjs';
import {createHybridPresentationSessionCommands} from '../functions/hybridPresentationSessionCommands.mjs';
import {hybridViewerCanRead,restrictedPresentationProjection}
  from '../src/state/hybridPresentationSessionModel.mjs';
import {captureEncounterRecovery} from '../functions/encounterRecovery.mjs';

const campaign='camp-36';
const path=(collection,id='current')=>'campaigns/'+campaign+'/'+collection+'/'+id;
const draft={scene:'title',title:'Public title',subtitle:'Public caption',mapId:'',
  characterIds:[],showRound:false,showPartyHP:false,theme:'obsidian'};
function harness(authorized=true){
  const store=new Map(),writes=[],reads=[];
  const doc=(_db,...segments)=>({path:segments.join('/')});
  const tx={
    get:async ref=>{
      reads.push(ref.path);
      return {exists:()=>store.has(ref.path),data:()=>store.get(ref.path)};
    },
    set:(ref,value)=>{store.set(ref.path,value);writes.push(ref.path);},
    update:(ref,value)=>{store.set(ref.path,{...store.get(ref.path),...value});writes.push(ref.path);}
  };
  const context={db:{},doc,runTransaction:async(_db,callback)=>callback(tx),
    requestId:'req36',currentUser:{uid:'gm36'},serverTimestamp:()=>Date.now()};
  const access={requireCampaignGM:async()=>{
    if(!authorized)throw Error('GM permission required');
  }};
  const presentation=createPlayerPresentationCommands(context,access);
  const hybrid=createHybridPresentationSessionCommands(context,access);
  const publish=input=>presentation.managePlayerPresentation(campaign,'gm',input);
  const session=input=>hybrid.manageHybridPresentationSession(campaign,'gm',input);
  return {store,writes,reads,publish,session};
}

test('3.6: stale GM tab may emergency-blackout without overwriting private material',async()=>{
  const h=harness();
  const initial=await h.publish({type:'set-scene',expectedRevision:0,draft});
  assert.equal(initial.ok,true,initial.error);
  const stale=await h.publish({type:'set-scene',expectedRevision:0,draft});
  assert.equal(stale.ok,false);
  const blackout=await h.publish({type:'blackout',expectedRevision:0});
  assert.equal(blackout.ok,true,blackout.error);
  assert.equal(blackout.revision,2);
  const shared=h.store.get(path('presentationShared'));
  assert.equal(shared.scene,'blank');
  assert.equal(shared.title,'');
  assert.equal(shared.subtitle,'');
  assert.equal(JSON.stringify(shared).includes('Public title'),false);
});

test('3.6: switching away from combat clears restricted combat state',async()=>{
  const h=harness();
  h.store.set(path('hybridSessionControl'),{
    status:'open',epoch:'epoch36',expiresAt:new Date(Date.now()+60000)});
  h.store.set(path('presentationCombat'),{
    active:true,round:8,current:'Hidden',visible:true,epoch:'epoch36'});
  const title=await h.publish({type:'set-scene',expectedRevision:0,draft});
  assert.equal(title.ok,true,title.error);
  const combat=h.store.get(path('presentationCombat'));
  assert.equal(combat.visible,false);
  assert.equal(combat.active,false);
  assert.equal(combat.current,'');
  assert.equal(combat.epoch,'epoch36');
  assert.equal(h.store.get(path('presentationRestricted')).scene,'title');
  const black=await h.publish({type:'blackout',expectedRevision:0});
  assert.equal(black.ok,true,black.error);
  assert.equal(h.store.get(path('presentationRestricted')).scene,'blank');
});

test('3.6: opening and closing remote session removes previous combat projection',async()=>{
  const h=harness();
  h.store.set(path('presentationCombat'),{
    active:true,round:9,current:'Old encounter',visible:true});
  const opened=await h.session({type:'open',expectedRevision:0,
    mode:'hybrid',durationMinutes:60});
  assert.equal(opened.ok,true,opened.error);
  let combat=h.store.get(path('presentationCombat'));
  assert.equal(combat.active,false);
  assert.equal(combat.visible,false);
  assert.equal(combat.current,'');
  assert.equal(h.store.get(path('presentationRestricted')).scene,'blank');
  const grant=await h.session({type:'grant',expectedRevision:1,
    uid:'viewer36',durationMinutes:30});
  assert.equal(grant.ok,true,grant.error);
  const live=h.store.get(path('hybridSessionControl'));
  const permission=h.store.get(path('hybridViewerGrants','viewer36'));
  assert.equal(hybridViewerCanRead(live,permission,'viewer36'),true);
  const closed=await h.session({type:'close',expectedRevision:2});
  assert.equal(closed.ok,true,closed.error);
  combat=h.store.get(path('presentationCombat'));
  assert.equal(combat.active,false);
  assert.equal(combat.visible,false);
  assert.equal(combat.current,'');
  assert.equal(hybridViewerCanRead(h.store.get(path('hybridSessionControl')),
    permission,'viewer36'),false);
  assert.deepEqual(h.store.get(path('presentationAssetAccess')).viewerExpiries,{});
});

test('3.6: unauthorised callers cannot read or change presentation',async()=>{
  const h=harness(false);
  assert.equal((await h.publish({type:'blackout',expectedRevision:0})).ok,false);
  assert.equal((await h.session({type:'open',expectedRevision:0,
    mode:'remote',durationMinutes:60})).ok,false);
  assert.deepEqual(h.reads,[]);
  assert.deepEqual(h.writes,[]);
});

test('3.6: restricted scene projections cannot disclose private party or world maps',()=>{
  for(const scene of ['party','world-map','unknown']){
    const safe=restrictedPresentationProjection({scene,title:'Secret',
      mapId:'secretmap',characterIds:['hidden'],gmNotes:'Never project'},4);
    assert.equal(safe.scene,'blank');
    assert.equal(JSON.stringify(safe).includes('Secret'),false);
    assert.equal('characterIds' in safe,false);
  }
});

test('3.6: existing recovery checkpoint excludes pending action and retains fog state',()=>{
  const checkpoint=captureEncounterRecovery({
    status:'active',combatId:'battle36',battleMapId:'map36',
    combat:{revision:3,pending:{secret:'Pending action'},log:[]},
    turnTimer:{enabled:false,endsAt:null}
  },{pending:{secret:'private decision'},preparations:{}},{
    combatId:'battle36',gridColumns:2,gridRows:2,metresPerCell:1,
    tokens:[],fogEnabled:true,fogCells:'1000'
  },Date.now());
  assert.equal(checkpoint.encounter.combat.pending,null);
  assert.equal(checkpoint.map.fogCells,'1000');
  assert.equal('pending' in checkpoint.privateState,false);
});
