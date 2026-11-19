import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RELATIONSHIP_LEVELS,REPUTATION_RANKS,canonicalRelationship,canonicalReputation,
  relationshipLabel,reputationLabel,worldMutation,gmToolkitProjection,gmWorld}
  from '../frontend/src/digitalGM/digitalGMModel.mjs';
import {createFirebaseDigitalGMService} from '../frontend/src/digitalGM/firebaseDigitalGMService.mjs';
import {validateRandomTable} from '../src/state/randomTableModel.mjs';
import {validateLootTable} from '../src/state/lootTableModel.mjs';
const cid='campaign123',uid='gm123',player='player123',other='other123';
const campaign={id:cid,ownerUid:uid,membershipSchemaVersion:2,name:'Test Campaign',
  characters:{hero:{ownerUid:player,name:'Hero'}}};
const member={uid:player,campaignId:cid,role:'player',status:'active'};
const workspace={world:{npcs:[{id:'npc1234',name:'Tavern Keeper',role:'Merchant',
  updatedAt:'t1',notes:'GM only'}],creatures:[],factions:[],relationships:[],reputations:[]},
  notes:{privateNotes:'Never disclose this note',sessionLogs:[]},quests:[]};
const session={id:'session123',status:'active',expiresAt:{seconds:4102444800}};
function fixture(actor=uid,enabled=true){
  const docs=new Map(Object.entries({
    ['campaigns/'+cid]:campaign,['campaigns/'+cid+'/members/'+player]:member,
    ['campaigns/'+cid+'/systems/gmWorkspace']:workspace,
    ['campaigns/'+cid+'/liveSession/current']:session,
    ['campaigns/'+cid+'/calendarPublic/current']:{id:'current',revision:1},
    ['campaigns/'+cid+'/calendarState/current']:{id:'current',revision:1},
    ['campaigns/'+cid+'/audioLive/current']:{id:'current',status:'stopped'},
    ['campaigns/'+cid+'/recordingNotice/current']:{id:'current',status:'idle'}
  }));
  const rows=new Map(),active=new Map(),calls=[],writes=[];
  const auth={currentUser:{uid:actor}};
  const makeSnap=path=>({id:path.split('/').at(-1),exists:()=>docs.has(path),
    data:()=>docs.get(path),metadata:{fromCache:false,hasPendingWrites:false}});
  const sdk={
    doc:(_db,...parts)=>parts.join('/'),
    collection:(_db,...parts)=>parts.join('/'),
    limit:n=>({limit:n}),
    query:(ref,...args)=>({ref,args}),
    getDocFromServer:async path=>makeSnap(path),
    serverTimestamp:()=>({seconds:111}),
    onSnapshot(ref,_options,callback){
      const path=typeof ref==='string'?ref:ref.ref;
      active.set(path,callback);
      queueMicrotask(()=>{
        if(!active.has(path))return;
        if(typeof ref==='string')callback(makeSnap(path));
        else callback({docs:(rows.get(path)||[]).map(x=>({id:x.id,data:()=>x})),
          metadata:{fromCache:false,hasPendingWrites:false}});
      });
      return()=>active.delete(path);
    },
    runTransaction:async(_db,handler)=>{
      const pending=[];
      const tx={
        get:async path=>makeSnap(path),
        set:(ref,patch,opts)=>pending.push({ref,patch,opts}),
        update:(ref,patch)=>pending.push({ref,patch,opts:null})
      };
      const result=await handler(tx);
      writes.push(...pending);
      for(const {ref,patch,opts} of pending)if(opts?.merge){
        const previous=docs.get(ref)||{};
        docs.set(ref,{...previous,...patch,
          ...(patch.world?{world:{...previous.world,...patch.world}}:{}),
          ...(patch.notes?{notes:{...previous.notes,...patch.notes}}:{})});
      }else docs.set(ref,patch);
      return result;
    }
  };
  const api=createFirebaseDigitalGMService({
    auth,db:{},firestoreSdk:sdk,functions:{},functionsSdk:{
      httpsCallable:(_fn,name)=>async payload=>{calls.push({name,payload});return {data:{ok:true}};}
    },readCanonical:async user=>({uid:user.uid}),enabled
  });
  return {api,docs,rows,active,calls,writes,auth};
}
test('relationship and reputation scales match the approved 17/15 levels',()=>{
  assert.equal(RELATIONSHIP_LEVELS.length,17);
  assert.equal(RELATIONSHIP_LEVELS[0],-8);
  assert.equal(RELATIONSHIP_LEVELS.at(-1),8);
  assert.equal(relationshipLabel(0),'Neutral');
  assert.equal(REPUTATION_RANKS.length,15);
  assert.equal(REPUTATION_RANKS[0],0);
  assert.equal(reputationLabel(0),'Who are you again?');
  assert.throws(()=>reputationLabel(15),/0–14/);
});
test('GM ledger changes are event-authored with history, not automatic decay',()=>{
  const id='relationship123';
  const source={sourceType:'npc',sourceId:'npc1234',targetType:'player',
    targetId:'hero1234',level:-4,note:'Significant betrayal',milestone:'Public insult'};
  const record=canonicalRelationship(source,null,id);
  assert.equal(record.level,-4);
  assert.equal(record.history.length,1);
  assert.equal(record.visibility,'gm');
  const saved=canonicalRelationship({...source,level:3,note:'Regained trust'},record,id);
  assert.equal(saved.revision,2);
  assert.equal(saved.history[0].level,3);
  assert.equal(saved.history[1].level,-4);
  assert.throws(()=>canonicalRelationship({...source,level:-9},null,id),/-8/);
  const rep=canonicalReputation({scope:'faction',subjectId:'faction123',rank:14,
    note:'GM milestone',milestone:'Recognized internationally'},null,'reputation123');
  assert.equal(rep.rank,14);
  assert.equal(rep.visibility,'gm');
});
test('NPC and card patches never overwrite unrelated world collections',()=>{
  const world=structuredClone(workspace.world);
  const saved=worldMutation(world,{type:'library-save',kind:'npc',id:'npc1234',
    expectedUpdatedAt:'t1',entry:{name:'Updated Keeper',role:'Merchant'}});
  assert.deepEqual(Object.keys(saved),['npcs']);
  assert.equal(saved.npcs[0].name,'Updated Keeper');
  const card=worldMutation(world,{type:'card-save',kind:'npc',id:'npc1234',
    expectedUpdatedAt:'t1',card:{template:'dossier',theme:'obsidian',fields:['role']}});
  assert.equal(card.npcs[0].card.template,'dossier');
  assert.throws(()=>worldMutation(world,{type:'library-save',kind:'npc',
    id:'npc1234',expectedUpdatedAt:'stale',entry:{name:'Bad'}}),/changed/);
  assert.throws(()=>worldMutation(world,{type:'library-save',kind:'npc',
    id:'official:creature',entry:{name:'Fake'}}),/identifier/);
});
test('relationship CAS rejects stale revisions and unrelated records survive',()=>{
  const first=worldMutation(workspace.world,{
    type:'relationship-save',id:'bond123',expectedRevision:0,
    entry:{sourceType:'npc',sourceId:'npc1234',targetType:'player',
      targetId:'hero1234',level:2,note:'Friendship',milestone:'Helped in battle'}
  });
  const changed={...workspace.world,...first};
  const next=worldMutation(changed,{
    type:'relationship-save',id:'bond123',expectedRevision:1,
    entry:{sourceType:'npc',sourceId:'npc1234',targetType:'player',
      targetId:'hero1234',level:3,note:'Trusted',milestone:'Mutual promise'}
  });
  assert.equal(next.relationships[0].revision,2);
  assert.throws(()=>worldMutation({...changed,...next},{
    type:'relationship-save',id:'bond123',expectedRevision:1,
    entry:{sourceType:'npc',sourceId:'npc1234',targetType:'player',
      targetId:'hero1234',level:4,note:'Stale',milestone:''}}),/changed/);
  assert.equal(gmWorld({world:changed}).npcs[0].name,'Tavern Keeper');
});
test('private GM projection includes NPC notes, player never accesses it',()=>{
  const projection=gmToolkitProjection(workspace,{merchantRelationships:[]},campaign);
  assert.equal(projection.library[0].notes,'GM only');
  assert.equal(projection.notes.privateNotes,'Never disclose this note');
  assert.equal(projection.relationships.length,0);
});
test('disabled/unauthorized GM cannot watch or mutate',async()=>{
  const disabled=fixture(uid,false);
  await assert.rejects(disabled.api.command(cid,'random',{}),/disabled/);
  const unauth=fixture(player);
  await assert.rejects(unauth.api.world(cid,{type:'note-log',title:'Oops',text:'No'}),/GM access/);
  const rogue=fixture(other);
  await assert.rejects(rogue.api.command(cid,'weather',{}),/GM access/);
  assert.equal(unauth.writes.length,0);
});
test('canonical GM actions use the existing receipt-backed asteriaAction callable',async()=>{
  const f=fixture();
  await f.api.command(cid,'merchant',{shopId:'shop123',characterId:'hero123',
    score:10,message:'Assisted the merchant'});
  await f.api.command(cid,'random',{type:'roll',tableId:'table123',expectedRevision:1});
  await f.api.command(cid,'calendar',{type:'advance',amount:1,unit:'day',
    expectedRevision:1,reason:'End of session'});
  assert.deepEqual(f.calls.map(c=>c.payload.action),
    ['manageMerchantRelationship','manageRandomTable','manageAsteriaCalendar']);
  assert(f.calls.every(c=>c.name==='asteriaAction'&&
    c.payload.args[0]===cid&&c.payload.args[1]==='gm-scope'));
  assert.equal(new Set(f.calls.map(c=>c.payload.requestId)).size,3);
});
test('GM edits reverify membership in transactions and preserve other world sections',async()=>{
  const f=fixture();
  const result=await f.api.world(cid,{type:'library-save',kind:'npc',
    id:'npc1234',expectedUpdatedAt:'t1',entry:{name:'Retired Innkeeper',role:'Merchant'}});
  assert.equal(result.saved,true);
  assert.equal(f.docs.get('campaigns/'+cid+'/systems/gmWorkspace').world.npcs[0].name,'Retired Innkeeper');
  assert.equal(f.docs.get('campaigns/'+cid+'/systems/gmWorkspace').notes.privateNotes,
    'Never disclose this note');
  assert(f.writes.every(w=>w.ref.endsWith('/gmWorkspace')));
  const p=fixture(player);
  await assert.rejects(p.api.world(cid,{type:'library-delete',kind:'npc',id:'npc1234'}),
    /GM access/);
});
test('GM listeners read only selected collections and stop when unsubscribed',async()=>{
  const f=fixture(),views=[],errors=[];
  const stop=f.api.watchGM(cid,'library',x=>views.push(x),e=>errors.push(e));
  await new Promise(ok=>setTimeout(ok,20));
  assert.equal(errors.length,0,errors[0]?.message);
  assert(views.length>0);
  assert.equal(views.at(-1).library[0].name,'Tavern Keeper');
  assert(f.active.has('campaigns/'+cid+'/systems/gmWorkspace'));
  assert(f.active.has('campaigns/'+cid+'/merchantRelationships'));
  assert.equal(f.active.has('campaigns/'+cid+'/partyLootDrafts'),false);
  stop();assert.equal(f.active.size,0);
});
test('players read only published projections, not GM notes or private draft documents',async()=>{
  const f=fixture(player),views=[];
  const stop=f.api.watchPlayer(cid,x=>views.push(x),e=>{throw e;});
  await new Promise(ok=>setTimeout(ok,20));
  assert(views.length>0);
  assert(!JSON.stringify(views.at(-1)).includes('Never disclose this note'));
  assert.equal(f.active.has('campaigns/'+cid+'/systems/gmWorkspace'),false);
  assert.equal(f.active.has('campaigns/'+cid+'/calendarPublic/current'),true);
  assert.equal(f.active.has('campaigns/'+cid+'/sessionPdfsShared'),true);
  stop();
});
test('React integration defaults off, excludes legacy globals and unsafe writes',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  assert.match(read('frontend/src/auth/firebaseAuthAdapter.mjs'),
    /VITE_ASTERIA_DIGITAL_GM_ENABLED==='true'/);
  assert.match(read('frontend/src/pages/GMDashboardPage.jsx'),/GMDigitalGMWorkspace/);
  assert.match(read('frontend/src/pages/PlayerDashboardPage.jsx'),/PlayerDigitalGMWorkspace/);
  const service=read('frontend/src/digitalGM/firebaseDigitalGMService.mjs');
  assert.match(service,/gmCampaignAccess\(campaign,exists\(member\)/);
  assert.match(service,/httpsCallable\(functions,'asteriaAction'\)/);
  assert.doesNotMatch(service,/window\.AsteriaFirebase|localStorage|legacyBridge/);
  assert.doesNotMatch(read('frontend/src/digitalGM/DigitalGMWorkspace.module.css'),/!important/);
});
