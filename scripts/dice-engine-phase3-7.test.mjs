import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultDiceAppearance} from '../src/dice/diceAppearanceCatalogue.mjs';
import {defaultDiceTrayAppearance} from '../src/dice/diceTrayCatalogue.mjs';
import {emptyDiceAppearanceLibrary,normalizeDiceAppearanceLibrary,
 appearanceForCharacter,applyDiceAppearanceMutation,validateDiceAppearanceAction}
 from '../src/dice/diceAppearanceCollections.mjs';
import {advancedDiceAction} from '../functions/advancedDiceCommands.mjs';
const look={dice:defaultDiceAppearance('dice-ruby'),tray:defaultDiceTrayAppearance('royal-marble')};
const create=(revision,id='collection-12345',name='Royal dice')=>({
 action:'appearance-save',expectedRevision:revision,collection:{id,name,...look}
});
function fakeDb(){
 const docs=new Map(),reads=[];
 return {docs,reads,db:{doc:path=>({path}),runTransaction:async work=>work({
  get:async ref=>{reads.push(ref.path);return{exists:docs.has(ref.path),data:()=>docs.get(ref.path)};},
  set:(ref,value)=>docs.set(ref.path,value)
 })}};
}
test('empty and legacy appearance documents safely migrate',()=>{
 assert.deepEqual(normalizeDiceAppearanceLibrary({}),emptyDiceAppearanceLibrary());
 const v=normalizeDiceAppearanceLibrary({version:1,collections:[{
  version:1,name:'Old look',dice:defaultDiceAppearance('dice-familiar')
 }]});
 assert.equal(v.version,2);assert.equal(v.revision,0);
 assert.equal(v.collections[0].id,'legacy-00000000');
 assert.equal(v.collections[0].tray.designId,'obsidian-hexagon');
});
test('schema rejects owner spoofing and unsupported values',()=>{
 for(const q of [
  {...create(0),uid:'victim'},
  {...create(0),expectedRevision:-1},
  {...create(0),collection:{...create(0).collection,total:20}},
  {...create(0),collection:{...create(0).collection,id:'bad'}},
  {action:'appearance-assign',expectedRevision:0,collectionId:'collection-12345',characterId:'bad'}
 ])assert.throws(()=>validateDiceAppearanceAction(q));
 const base=emptyDiceAppearanceLibrary();
 for(const value of [{...base,ownerUid:'evil'}, {...base,revision:-1},
  {...base,version:9}, {...base,assignments:{'character-12345':'collection-12345'}}])
  assert.throws(()=>normalizeDiceAppearanceLibrary(value));
});
test('save duplicate default assign unassign and delete have bounded semantics',()=>{
 let state=emptyDiceAppearanceLibrary();
 const act=req=>{state=applyDiceAppearanceMutation(state,req,1730000000000+state.revision);return state;};
 act(create(0));
 assert.equal(state.defaultCollectionId,'collection-12345');
 act(create(1,'collection-67890','Another style'));
 act({action:'appearance-duplicate',expectedRevision:2,collectionId:'collection-12345',
  newId:'collection-duplicate',name:'Royal copy'});
 assert.equal(state.collections.length,3);
 act({action:'appearance-default',expectedRevision:3,collectionId:'collection-67890'});
 act({action:'appearance-assign',expectedRevision:4,collectionId:'collection-12345',characterId:'character-12345'});
 assert.equal(appearanceForCharacter(state,'character-12345').id,'collection-12345');
 assert.equal(appearanceForCharacter(state,'other-character').id,'collection-67890');
 act({action:'appearance-unassign',expectedRevision:5,characterId:'character-12345'});
 assert.equal(appearanceForCharacter(state,'character-12345').id,'collection-67890');
 act({action:'appearance-delete',expectedRevision:6,collectionId:'collection-67890'});
 assert.equal(state.defaultCollectionId,'collection-12345');
 assert.throws(()=>act(create(0)),/another device/);
 assert.throws(()=>act(create(7,'collection-other','Royal dice')),/already exists/);
});
test('20 collection cap and revision conflict are enforced',()=>{
 let state=emptyDiceAppearanceLibrary();
 for(let i=0;i<20;i++)state=applyDiceAppearanceMutation(state,
  create(i,'collection-'+String(i).padStart(8,'0'),'Style '+i),i);
 assert.equal(state.collections.length,20);
 assert.throws(()=>applyDiceAppearanceMutation(state,
  create(20,'collection-overflow','Extra'),20),/Maximum 20/);
 assert.throws(()=>applyDiceAppearanceMutation(state,create(3),20),/another device/);
});
test('server validates owned character and never writes roll history',async()=>{
 const {db,docs,reads}=fakeDb();
 const act=(uid,data)=>advancedDiceAction(db,uid,data,()=>1730000000000,()=>new Date());
 docs.set('users/alice/diceWorkspace/current',{version:1,presets:[{id:'old'}],history:[{total:20}]});
 const original=JSON.stringify(docs.get('users/alice/diceWorkspace/current'));
 await act('alice',create(0));
 assert.equal(docs.get('users/alice/diceAppearances/current').collections.length,1);
 docs.set('users/alice/characters/character-12345',{ownerUid:'alice'});
 await act('alice',{action:'appearance-assign',expectedRevision:1,
  collectionId:'collection-12345',characterId:'character-12345'});
 assert.equal(docs.get('users/alice/diceAppearances/current').assignments['character-12345'],'collection-12345');
 assert.ok(reads.includes('users/alice/characters/character-12345'));
 await assert.rejects(()=>act('alice',{action:'appearance-assign',expectedRevision:2,
  collectionId:'collection-12345',characterId:'character-nope'}),/owned characters/);
 await assert.rejects(()=>act('bob',{action:'appearance-delete',expectedRevision:0,
  collectionId:'collection-12345'}),/not found/);
 assert.equal(JSON.stringify(docs.get('users/alice/diceWorkspace/current')),original);
});
test('existing callable and studio are reused rather than duplicated',()=>{
 const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
 assert.match(read('src/dashboards/AdvancedDiceWorkspace.jsx'),/<DiceAppearanceCollections/);
 assert.match(read('js/firebase-auth.js'),/subscribeOwnedDiceCharacters/);
 assert.match(read('functions/advancedDiceCommands.mjs'),/diceAppearanceAction/);
 assert.match(read('functions/index.mjs'),/asteriaAdvancedDice=onCall/);
 assert.match(read('firestore.rules'),/collectionId != 'diceAppearances'/);
 assert.doesNotMatch(read('src/dice/DiceAppearanceCollections.jsx'),/firebaseService|Math\.random/);
});
