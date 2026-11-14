import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {getDoc,doc,setDoc,updateDoc,deleteDoc,Timestamp} from 'firebase/firestore';

const campaignId='battle-session',mapId='arena';
let env;
const scene={
 id:mapId,campaignId,name:'Battle Arena',description:'',visibility:'players',
 kind:'video',contentType:'video/mp4',
 storagePath:'campaigns/'+campaignId+'/battleMaps/'+mapId+'/scene.mp4',
 gridColumns:12,gridRows:12,gridOpacity:50,gridVisible:true,
 fogEnabled:false,fogCells:'0'.repeat(144),metresPerCell:1,
 tokens:[{id:'hero',label:'Hero',kind:'character',refId:'hero',x:25,y:25}],
 width:1920,height:1080,createdBy:'gm',createdAt:Timestamp.now(),updatedAt:Timestamp.now()
};
const participant={id:'hero',label:'Hero',kind:'character',refId:'hero',
 combatantId:'actor-1',x:25,y:25};
const db=user=>env.authenticatedContext(user).firestore();
before(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-asteria-combat-map',
  firestore:{rules:readFileSync('firestore.rules','utf8')}});
});
after(async()=>env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async context=>{
  const f=context.firestore();
  await setDoc(doc(f,'campaigns/'+campaignId),{ownerUid:'gm',membershipSchemaVersion:2});
  await setDoc(doc(f,'campaigns/'+campaignId+'/members/alice'),{
   uid:'alice',campaignId,role:'player',status:'active'
  });
  await setDoc(doc(f,'campaigns/'+campaignId+'/battleMaps/'+mapId),scene);
 });
});
test('player can view an explicitly published combat map but not edit positions',async()=>{
 const path='campaigns/'+campaignId+'/battleMaps/'+mapId;
 await assertSucceeds(getDoc(doc(db('alice'),path)));
 await assertFails(updateDoc(doc(db('alice'),path),{tokens:[participant]}));
 await assertFails(updateDoc(doc(db('alice'),path),{combatId:'combat-1'}));
 await assertFails(deleteDoc(doc(db('alice'),path)));
});
test('GM can author unlocked markers and configure encounter map settings',async()=>{
 const path='campaigns/'+campaignId+'/battleMaps/'+mapId;
 await assertSucceeds(updateDoc(doc(db('gm'),path),{tokens:[participant]}));
 await assertSucceeds(updateDoc(doc(db('gm'),path),{gridOpacity:70}));
 await assertFails(updateDoc(doc(db('gm'),path),{combatId:'forged'}));
});
test('backend-linked map prevents browser token edits even from GM',async()=>{
 const path='campaigns/'+campaignId+'/battleMaps/'+mapId;
 await env.withSecurityRulesDisabled(async context=>{
  await updateDoc(doc(context.firestore(),path),{
   combatId:'combat-1',tokens:[participant]
  });
 });
 await assertSucceeds(getDoc(doc(db('alice'),path)));
 await assertFails(updateDoc(doc(db('gm'),path),{
  tokens:[{...participant,x:50,y:50}]
 }));
 await assertFails(updateDoc(doc(db('gm'),path),{combatId:'other'}));
 await assertSucceeds(updateDoc(doc(db('gm'),path),{fogCells:'1'.repeat(144)}));
 await assertSucceeds(updateDoc(doc(db('gm'),path),{gridOpacity:60}));
 await assertFails(deleteDoc(doc(db('gm'),path)));
});
test('GM can delete a disconnected map and cannot add secret combat bindings as new document fields',async()=>{
 const path='campaigns/'+campaignId+'/battleMaps/'+mapId;
 await assertFails(updateDoc(doc(db('gm'),path),{battleMapId:'fake'}));
 await assertFails(updateDoc(doc(db('gm'),path),{initiative:99}));
 await assertSucceeds(deleteDoc(doc(db('gm'),path)));
});
