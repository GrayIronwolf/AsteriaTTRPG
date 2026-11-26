import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {getDoc,getDocs,doc,collection,query,where,updateDoc,setDoc,deleteDoc,Timestamp} from 'firebase/firestore';
import {battleMapProjectionHarness} from './helpers/battle-map-projection-harness.mjs';

const projectId='demo-asteria-fog';
const campaignId='camp-fog',mapId='cave';
const mapPath='campaigns/'+campaignId+'/battleMaps/'+mapId;
const publicCollection='campaigns/'+campaignId+'/battleMapsPublic';
const publicPath=publicCollection+'/'+mapId;
const privatePath=mapPath+'/gmNotes/private';
let env,projections;
const fixture={
  id:mapId,campaignId,name:'Ruins',description:'Map',visibility:'players',
  kind:'video',contentType:'video/mp4',
  storagePath:'campaigns/'+campaignId+'/battleMaps/'+mapId+'/scene.mp4',
  gridColumns:4,gridRows:4,gridOpacity:40,gridVisible:true,
  tokens:[{id:'hero',kind:'character',label:'Hero',refId:'pc-1',x:10,y:10}],
  fogEnabled:true,fogCells:'0'.repeat(16),metresPerCell:1.5,
  width:1920,height:1080,createdBy:'gm',
  createdAt:Timestamp.now(),updatedAt:Timestamp.now()
};
const db=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const notes=(pins,uid='gm')=>({pins,updatedBy:uid,updatedAt:Timestamp.now()});
const samplePin={id:'pin-1',label:'Hidden guardian',note:'Only the GM knows this.',
  kind:'encounter',x:55.5,y:60.5};
before(async()=>{
  env=await initializeTestEnvironment({
    projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')}
  });
  projections=battleMapProjectionHarness(projectId);
});
after(async()=>{await env?.cleanup();await projections?.close();});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const f=context.firestore();
    await setDoc(doc(f,'campaigns/'+campaignId),{
      id:campaignId,ownerUid:'gm',membershipSchemaVersion:2
    });
    for(const [uid,role,status] of [
      ['alice','player','active'],['co','co-gm','active'],['gone','player','suspended']
    ]){
      await setDoc(doc(f,'campaigns/'+campaignId+'/members/'+uid),{
        uid,role,status,campaignId
      });
    }
    await setDoc(doc(f,mapPath),fixture);
  });
  await projections.sync(campaignId,mapId);
});
test('players read published fog with no secret notes; outsiders do not',async()=>{
  await assertSucceeds(setDoc(doc(db('gm'),privatePath),notes([samplePin])));
  await assertFails(getDoc(doc(db('alice'),mapPath)));
  const view=await assertSucceeds(getDoc(doc(db('alice'),publicPath)));
  assert.equal(view.data().fogCells,'0'.repeat(16));
  assert.equal(view.data().fogEnabled,true);
  assert.deepEqual(view.data().tokens,[]);
  assert.equal('pins' in view.data(),false);
  assert.equal('privateNotes' in view.data(),false);
  const published=await assertSucceeds(getDocs(query(collection(db('alice'),publicCollection),
    where('visibility','==','players'))));
  assert.deepEqual(published.docs.map(row=>row.id),[mapId]);
  for(const uid of ['gone','visitor',null]){
    await assertFails(getDoc(doc(db(uid),mapPath)));
    await assertFails(getDoc(doc(db(uid),publicPath)));
  }
});
test('GM and active co-GM can store private encounter/hazard pins; players never read them',async()=>{
  await assertSucceeds(setDoc(doc(db('gm'),privatePath),notes([samplePin])));
  const seen=await assertSucceeds(getDoc(doc(db('co'),privatePath)));
  assert.equal(seen.data().pins[0].note,samplePin.note);
  await assertFails(getDoc(doc(db('alice'),privatePath)));
  await assertFails(getDocs(collection(db('alice'),mapPath+'/gmNotes')));
  await assertFails(getDoc(doc(db('visitor'),privatePath)));
  await assertFails(getDoc(doc(db('gone'),privatePath)));
  await assertFails(setDoc(doc(db('alice'),privatePath),notes([],'alice')));
  await assertFails(updateDoc(doc(db('alice'),privatePath),{pins:[]}));
  await assertFails(deleteDoc(doc(db('alice'),privatePath)));
  await assertSucceeds(setDoc(doc(db('co'),privatePath),notes([samplePin],'co')));
});
test('GM fog reveal and hide updates are player-visible after Firestore save',async()=>{
  const ref=doc(db('gm'),mapPath);
  await assertSucceeds(updateDoc(ref,{fogCells:'1111000000000000'}));
  await projections.sync(campaignId,mapId);
  const afterReveal=await assertSucceeds(getDoc(doc(db('alice'),publicPath)));
  assert.equal(afterReveal.data().fogCells,'1111000000000000');
  assert.deepEqual(afterReveal.data().tokens.map(row=>row.id),['hero']);
  await assertSucceeds(updateDoc(ref,{fogCells:'0'.repeat(16)}));
  await projections.sync(campaignId,mapId);
  const afterHide=await assertSucceeds(getDoc(doc(db('alice'),publicPath)));
  assert.equal(afterHide.data().fogCells,'0'.repeat(16));
  assert.deepEqual(afterHide.data().tokens,[]);
  await assertSucceeds(updateDoc(ref,{fogEnabled:false}));
  assert.equal((await assertSucceeds(getDoc(ref))).data().fogEnabled,false);
});
test('players cannot reveal fog, alter scale or expose GM-only scenes',async()=>{
  await assertFails(updateDoc(doc(db('alice'),mapPath),{fogCells:'1'.repeat(16)}));
  await assertFails(updateDoc(doc(db('alice'),mapPath),{fogEnabled:false}));
  await assertFails(updateDoc(doc(db('alice'),mapPath),{metresPerCell:90}));
  await assertFails(updateDoc(doc(db('alice'),mapPath),{visibility:'gm'}));
  await assertFails(updateDoc(doc(db('visitor'),mapPath),{fogCells:'1'.repeat(16)}));
});
test('malformed fog snapshots and forbidden private-data fields cannot enter public maps',async()=>{
  const ref=doc(db('gm'),mapPath);
  await assertFails(updateDoc(ref,{fogCells:'1'.repeat(15)}));
  await assertFails(updateDoc(ref,{fogCells:'x'.repeat(16)}));
  await assertFails(updateDoc(ref,{fogCells:'1'.repeat(6401)}));
  await assertFails(updateDoc(ref,{metresPerCell:0}));
  await assertFails(updateDoc(ref,{metresPerCell:101}));
  await assertFails(updateDoc(ref,{privatePins:[samplePin]}));
  await assertFails(updateDoc(ref,{secretNotes:'Secret corridor'}));
  await assertFails(updateDoc(ref,{gridColumns:5}));
  await assertSucceeds(updateDoc(ref,{gridColumns:5,fogCells:'0'.repeat(20)}));
});
test('private note writes require canonical path, shape, author, and GM status',async()=>{
  const wrong=doc(db('gm'),mapPath+'/gmNotes/other');
  await assertFails(setDoc(wrong,notes([samplePin])));
  await assertFails(setDoc(doc(db('gm'),privatePath),notes([],'alice')));
  await assertFails(setDoc(doc(db('gm'),privatePath),{
    ...notes([samplePin]),visibility:'players'
  }));
  await assertFails(setDoc(doc(db('gm'),privatePath),notes(
    Array.from({length:41},(_,i)=>({...samplePin,id:'p'+i}))
  )));
  await assertFails(setDoc(doc(db('gone'),privatePath),notes([],'gone')));
  await assertSucceeds(setDoc(doc(db('gm'),privatePath),notes([])));
  await assertSucceeds(deleteDoc(doc(db('gm'),privatePath)));
});
test('older Phase 6.1 maps remain readable and can adopt fog without a data migration',async()=>{
  await env.withSecurityRulesDisabled(async context=>{
    const legacy={...fixture};
    delete legacy.fogEnabled;delete legacy.fogCells;delete legacy.metresPerCell;
    await setDoc(doc(context.firestore(),mapPath),legacy);
  });
  await projections.sync(campaignId,mapId);
  await assertFails(getDoc(doc(db('alice'),mapPath)));
  assert.equal((await assertSucceeds(getDoc(doc(db('alice'),publicPath)))).data().fogEnabled,false);
  await assertSucceeds(updateDoc(doc(db('gm'),mapPath),{
    fogEnabled:true,fogCells:'0'.repeat(16),metresPerCell:1
  }));
  await projections.sync(campaignId,mapId);
  assert.equal((await assertSucceeds(getDoc(doc(db('alice'),publicPath)))).data().fogEnabled,true);
});

test('automatic party vision persists exploration while retiring hidden tokens from the public feed',async()=>{
  const gm=db('gm'),player=db('alice');
  await env.withSecurityRulesDisabled(async context=>{
    await setDoc(doc(context.firestore(),'campaigns/'+campaignId+'/characters/pc-1'),{id:'pc-1',vision:{dark:2}});
  });
  const tokens=[fixture.tokens[0],{id:'enemy',kind:'creature',label:'Guardian',x:36,y:10}];
  await assertSucceeds(updateDoc(doc(gm,mapPath),{tokens,vision:{automatic:true,ambient:'dark'}}));
  await projections.sync(campaignId,mapId);
  const first=(await getDoc(doc(player,publicPath))).data();
  assert.deepEqual(first.tokens.map(row=>row.id),['hero','enemy']);
  assert.ok(!Object.hasOwn(first,'vision'));
  await assertFails(updateDoc(doc(player,mapPath),{exploredCells:'1'.repeat(16)}));
  await assertSucceeds(updateDoc(doc(gm,mapPath),{tokens:[{...tokens[0],x:90,y:90},tokens[1]]}));
  await projections.sync(campaignId,mapId);
  const second=(await getDoc(doc(player,publicPath))).data();
  assert.equal(second.fogCells[1],'0');assert.equal(second.exploredCells[1],'1');
  assert.deepEqual(second.tokens.map(t=>t.id),['hero']);
  assert.equal(JSON.stringify(second).includes('Guardian'),false);
});
