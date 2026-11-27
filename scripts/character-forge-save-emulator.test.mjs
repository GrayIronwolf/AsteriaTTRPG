import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc,writeBatch,arrayUnion,serverTimestamp} from 'firebase/firestore';

let env,db;
const user=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-asteria',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
});
after(async()=>{await env?.cleanup();});
async function adminOperation(path,operation){
  let result;
  await env.withSecurityRulesDisabled(async context=>{result=await operation(doc(context.firestore(),path));});
  return result;
}
beforeEach(async()=>{
  await env.clearFirestore();
  db={doc:path=>({
    get:()=>adminOperation(path,async ref=>{const snap=await getDoc(ref);return {exists:snap.exists(),data:()=>snap.data()};}),
    set:value=>adminOperation(path,ref=>setDoc(ref,value)),delete:()=>adminOperation(path,ref=>deleteDoc(ref))
  })};
  await db.doc('users/alice/characters/a').set({id:'a',ownerUid:'alice'});
  await db.doc('campaigns/c/characters/a').set({id:'a',ownerUid:'alice'});
});

// Run the actual browser save API against real emulator rules and batches.
function forgeSaveApi(client,uid='alice') {
  const source=fs.readFileSync('js/firebase-auth.js','utf8');
  const start=source.indexOf('  saveCharacter: async function(');
  const end=source.indexOf('\n  },',start)+4;
  const dependencies={
    db:client,currentUser:uid?{uid}:null,currentProfile:{characters:[]},
    writeBatch,doc,arrayUnion,serverTimestamp,
    saveLocalProfile(){},syncCharacterToCampaigns:async()=>{},reportSyncError(){},console:{warn(){}}
  };
  return Function(...Object.keys(dependencies),'return ({'+source.slice(start,end)+'});')(...Object.values(dependencies));
}

test('Forge saves and edits atomically under deployed ownership rules without losing links',async()=>{
  const client=user('alice'),api=forgeSaveApi(client);
  const character={id:'forge',ownerUid:'alice',name:'First',linkedCampaignIds:['c'],campaignCharacterIds:{c:'a'}};
  assert.equal(await api.saveCharacter('forge',character,{throwOnError:true}),true);
  character.name='Edited';
  assert.equal(await api.saveCharacter('forge',character,{throwOnError:true}),true);
  const saved=(await getDoc(doc(client,'users/alice/characters/forge'))).data();
  assert.equal(saved.name,'Edited');assert.equal(saved.ownerUid,'alice');
  assert.deepEqual(saved.campaignCharacterIds,{c:'a'});assert.deepEqual(saved.linkedCampaignIds,['c']);
  assert.deepEqual((await getDoc(doc(client,'users/alice'))).data().characters,['forge']);
  assert.equal((await db.doc('campaigns/c/characters/a').get()).data().ownerUid,'alice');
});

test('Forge rules reject foreign and signed-out writes, including forged owner fields',async()=>{
  assert.equal(await forgeSaveApi(user('bob'),'bob').saveCharacter('a',{ownerUid:'alice'}),false);
  // Lie to the browser API about the session; Firestore still sees bob.
  await assert.rejects(forgeSaveApi(user('bob')).saveCharacter('a',{ownerUid:'alice'},{throwOnError:true}),e=>e.code==='permission-denied');
  await assert.rejects(forgeSaveApi(env.unauthenticatedContext().firestore()).saveCharacter('a',{ownerUid:'alice'},{throwOnError:true}),e=>e.code==='permission-denied');
  assert.equal((await db.doc('users/alice/characters/a').get()).data().ownerUid,'alice');
});

test('a rejected Forge batch leaves no profile entry and can retry the same ID',async()=>{
  const client=user('alice'),api=forgeSaveApi(client);
  await db.doc('users/alice/characters/retry').set({ownerUid:'bob',name:'Foreign record'});
  await assert.rejects(api.saveCharacter('retry',{ownerUid:'alice',name:'Retry'},{throwOnError:true}),e=>e.code==='permission-denied');
  assert.equal((await db.doc('users/alice').get()).exists,false);
  assert.equal((await db.doc('users/alice/characters/retry').get()).data().name,'Foreign record');
  await db.doc('users/alice/characters/retry').delete();
  assert.equal(await api.saveCharacter('retry',{ownerUid:'alice',name:'Retry'},{throwOnError:true}),true);
  assert.deepEqual((await getDoc(doc(client,'users/alice'))).data().characters,['retry']);
});

