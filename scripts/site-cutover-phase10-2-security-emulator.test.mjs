/**
 * Phase 10.2: real Firebase rules emulator matrix for the replacement website.
 * No Admin credentials, production project, live accounts or direct deployments.
 * Security rules are evaluated by Firebase emulators, not string matching.
 */
import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {
  doc,collection,getDoc,getDocs,query,where,setDoc,updateDoc,deleteDoc
} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,listAll} from 'firebase/storage';

const projectId='demo-asteria';
const campaignId='phase10-cross-feature';
const prefix='campaigns/'+campaignId;
const at=(...parts)=>[prefix,...parts].join('/');
const profile=uid=>'users/'+uid;
const owned=uid=>'users/'+uid+'/characters/private';
const character=uid=>({id:'private',name:'Synthetic Hero',ownerUid:uid,
  sourceCharacterId:'private',sharedCampaignId:'',linkedCampaignIds:[]});
let env;
const database=uid=>uid?env.authenticatedContext(uid).firestore():env.unauthenticatedContext().firestore();
const storage=uid=>uid?env.authenticatedContext(uid).storage():env.unauthenticatedContext().storage();
const read=(uid,key)=>getDoc(doc(database(uid),key));
const write=(uid,key,data)=>setDoc(doc(database(uid),key),data);

before(async()=>{
  env=await initializeTestEnvironment({
    projectId,
    firestore:{rules:readFileSync('firestore.rules','utf8')},
    storage:{rules:readFileSync('storage.rules','utf8')}
  });
});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    const fixtures=[
      [profile('gm'),{uid:'gm',username:'BaselineGM',accountId:'BaselineGM#00001'}],
      [profile('alice'),{uid:'alice',username:'BaselinePlayer'}],
      [profile('bob'),{uid:'bob',username:'InactivePlayer'}],
      [owned('alice'),character('alice')],
      [at(),{id:campaignId,ownerUid:'gm',membershipSchemaVersion:2,ucn:'111122223333',
        playerCharacterLinks:{a:'alice'},gmUids:[],playerUids:[],roles:{}}],
      [at('members','alice'),{uid:'alice',campaignId,role:'player',status:'active'}],
      [at('members','bob'),{uid:'bob',campaignId,role:'player',status:'suspended'}],
      [at('members','co'),{uid:'co',campaignId,role:'co-gm',status:'active'}],
      [at('characters','a'),{id:'a',ownerUid:'alice',sourceCharacterId:'private',
        sharedCampaignId:campaignId,status:'linked',name:'Synthetic Hero'}],
      [at('checkRequests','own'),{id:'own',campaignId,gmUid:'gm',ownerUid:'alice',status:'pending'}],
      [at('checkRequests','other'),{id:'other',campaignId,gmUid:'gm',ownerUid:'bob',status:'pending'}],
      [at('checkGroups','group'),{id:'group',results:{own:{die:20},other:{die:1}}}],
      [at('checkCommandReceipts','receipt'),{uid:'alice',response:{die:20}}],
      [at('battleMaps','secret'),{id:'secret',campaignId,visibility:'gm',
        name:'Hidden Map',kind:'image',contentType:'image/png'}],
      [at('battleMaps','published'),{id:'published',campaignId,visibility:'players',
        name:'Shared Map',kind:'image',contentType:'image/png'}],
      [at('battleMaps','revocation'),{id:'revocation',campaignId,visibility:'players',
        name:'Revocation Test Map',kind:'image',contentType:'image/png'}],
      [at('battleMaps','secret','gmNotes','private'),{pins:[],updatedBy:'gm'}],
      [at('systems','gmWorkspace'),{gmNotes:'private'}],
      [at('systems','itemPublic'),{shops:[],partyLoot:[]}],
      [at('partyStashes','stash'),{id:'stash',contents:[]}],
      [at('partyLoot','loot'),{id:'loot',contents:[]}],
      [at('partyLootDrafts','private'),{id:'private',hiddenTreasure:true}],
      [at('rewardBundles','private'),{id:'private',hiddenRewards:true}],
      [at('itemRequests','alice'),{id:'alice',fromOwnerUid:'alice',toOwnerUid:'gm'}],
      [at('itemRequests','bob'),{id:'bob',fromOwnerUid:'bob',toOwnerUid:'gm'}],
      [at('merchantDeals','alice'),{id:'alice',ownerUid:'alice'}],
      [at('merchantDeals','bob'),{id:'bob',ownerUid:'bob'}],
      [at('audioTracks','shared'),{status:'ready',visibility:'players'}],
      [at('audioTracks','private'),{status:'ready',visibility:'gm'}],
      [at('liveSession','current'),{id:'live',status:'idle'}],
      ['friendRelationships/gm_alice',{participants:['gm','alice']}],
      ['accountIdAssignments/gm',{uid:'gm'}],
      ['friendNotificationInbox/alice/items/n1',{uid:'alice'}],
      ['campaignNotificationInbox/alice/items/n1',{uid:'alice'}]
    ];
    for(const [key,data] of fixtures)await setDoc(doc(db,key),data);
  });
});

test('guest, outsider and suspended member cannot read campaign or private user records',async()=>{
  for(const uid of [null,'stranger','bob']){
    await assertFails(read(uid,at()));
    await assertFails(read(uid,at('characters','a')));
    await assertFails(read(uid,at('systems','itemPublic')));
    await assertFails(read(uid,at('checkRequests','own')));
  }
  for(const uid of [null,'stranger','gm','co','bob']){
    await assertFails(read(uid,profile('alice')));
    await assertFails(read(uid,owned('alice')));
  }
  await assertSucceeds(read('alice',profile('alice')));
  await assertSucceeds(read('alice',owned('alice')));
  await assertSucceeds(read('alice',at()));
  await assertSucceeds(read('co',at()));
});

test('client identity and campaign membership never grant unauthorized role escalation',async()=>{
  const alice=database('alice');
  const gm=database('gm');
  await assertFails(updateDoc(doc(alice,at()),{ownerUid:'alice'}));
  await assertFails(updateDoc(doc(alice,at('members','alice')),{role:'co-gm'}));
  await assertFails(write('alice',at('members','stranger'),{
    uid:'stranger',role:'co-gm',campaignId,status:'active'}));
  await assertFails(write('gm',at('members','stranger'),{
    uid:'stranger',role:'player',campaignId,status:'active'}));
  await assertFails(getDoc(doc(alice,at('members','bob'))));
  await assertFails(getDocs(collection(alice,at('members'))));
  await assertSucceeds(getDoc(doc(alice,at('members','alice'))));
  await assertSucceeds(getDocs(collection(gm,at('members'))));
  await assertSucceeds(read('co',at('members','alice')));
  await assertFails(updateDoc(doc(database('gm'),profile('gm')),{accountId:'Fake#99999'}));
  await assertFails(write('alice','accountIdAssignments/alice',{uid:'alice'}));
});

test('server-owned checks, receipts and private groups cannot be forged or disclosed',async()=>{
  const alice=database('alice');
  const gm=database('gm');
  await assertSucceeds(read('alice',at('checkRequests','own')));
  await assertFails(read('alice',at('checkRequests','other')));
  await assertSucceeds(getDocs(query(collection(alice,at('checkRequests')),
    where('ownerUid','==','alice'))));
  await assertFails(getDocs(collection(alice,at('checkRequests'))));
  await assertSucceeds(getDocs(collection(gm,at('checkRequests'))));
  await assertSucceeds(read('gm',at('checkGroups','group')));
  for(const uid of ['alice','bob','stranger',null]){
    await assertFails(read(uid,at('checkGroups','group')));
    await assertFails(read(uid,at('checkCommandReceipts','receipt')));
  }
  await assertFails(read('gm',at('checkCommandReceipts','receipt')));
  for(const uid of ['gm','co','alice']){
    await assertFails(write(uid,at('checkRequests','fake'),{ownerUid:uid,status:'passed'}));
    await assertFails(write(uid,at('checkGroups','fake'),{results:{}}));
    await assertFails(write(uid,at('checkCommandReceipts','fake'),{response:{}}));
  }
});

test('published maps are readable to active players but private map details stay GM-only',async()=>{
  const alice=database('alice');
  const gm=database('gm');
  await assertSucceeds(read('alice',at('battleMaps','published')));
  await assertFails(read('alice',at('battleMaps','secret')));
  await assertFails(read('alice',at('battleMaps','secret','gmNotes','private')));
  await assertSucceeds(read('gm',at('battleMaps','secret')));
  await assertSucceeds(read('co',at('battleMaps','secret','gmNotes','private')));
  await assertSucceeds(getDocs(query(collection(alice,at('battleMaps')),
    where('visibility','==','players'))));
  await assertFails(getDocs(collection(alice,at('battleMaps'))));
  await assertSucceeds(getDocs(collection(gm,at('battleMaps'))));
  await assertFails(write('alice',at('battleMaps','fake'),{id:'fake',visibility:'players'}));
});

test('private economy rows, GM state and command-only actions obey role boundaries',async()=>{
  const alice=database('alice');
  await assertSucceeds(read('alice',at('systems','itemPublic')));
  await assertSucceeds(read('alice',at('partyStashes','stash')));
  await assertSucceeds(read('alice',at('partyLoot','loot')));
  await assertFails(read('alice',at('systems','gmWorkspace')));
  await assertSucceeds(read('co',at('systems','gmWorkspace')));
  await assertFails(read('alice',at('partyLootDrafts','private')));
  await assertSucceeds(read('gm',at('partyLootDrafts','private')));
  await assertFails(read('alice',at('rewardBundles','private')));
  await assertSucceeds(read('co',at('rewardBundles','private')));
  await assertSucceeds(read('alice',at('itemRequests','alice')));
  await assertFails(read('alice',at('itemRequests','bob')));
  await assertSucceeds(read('alice',at('merchantDeals','alice')));
  await assertFails(read('alice',at('merchantDeals','bob')));
  for(const uid of ['alice','gm']){
    await assertFails(write(uid,at('partyStashes','new'),{id:'new'}));
    await assertFails(write(uid,at('partyLoot','new'),{id:'new'}));
    await assertFails(write(uid,at('itemRequests','new'),{fromOwnerUid:uid}));
    await assertFails(write(uid,at('merchantDeals','new'),{ownerUid:uid}));
  }
});

test('private social and notification collections never leak via direct Firestore access',async()=>{
  for(const uid of ['alice','gm','stranger',null]){
    for(const key of [
      'friendRelationships/gm_alice','friendNotificationInbox/alice/items/n1',
      'campaignNotificationInbox/alice/items/n1','accountIdAssignments/gm'
    ]) {
      await assertFails(read(uid,key));
      await assertFails(write(uid,key,{uid:uid||'visitor'}));
    }
  }
});

test('Storage media enforces GM publishing, media visibility and private avatar ownership',async()=>{
  const secretPath='campaigns/'+campaignId+'/battleMaps/secret/scene.png';
  const publishedPath='campaigns/'+campaignId+'/battleMaps/published/scene.png';
  const avatarPath='users/alice/profile/avatar';
  const bytes=new Uint8Array([137,80,78,71,1,2,3,4]);
  await assertSucceeds(uploadBytes(ref(storage('gm'),secretPath),bytes,{contentType:'image/png'}));
  await assertSucceeds(uploadBytes(ref(storage('gm'),publishedPath),bytes,{contentType:'image/png'}));
  await assertSucceeds(getBytes(ref(storage('gm'),secretPath)));
  await assertSucceeds(getBytes(ref(storage('alice'),publishedPath)));
  await assertFails(getBytes(ref(storage('alice'),secretPath)));
  await assertFails(getBytes(ref(storage('bob'),publishedPath)));
  await assertFails(getBytes(ref(storage('stranger'),publishedPath)));
  await assertFails(getBytes(ref(storage(null),publishedPath)));
  await assertFails(uploadBytes(ref(storage('alice'),
    'campaigns/'+campaignId+'/battleMaps/new/scene.png'),bytes,{contentType:'image/png'}));
  await assertFails(listAll(ref(storage('alice'),'campaigns/'+campaignId+'/battleMaps')));
  await assertSucceeds(uploadBytes(ref(storage('alice'),avatarPath),bytes,{contentType:'image/webp'}));
  await assertSucceeds(getBytes(ref(storage('alice'),avatarPath)));
  await assertFails(getBytes(ref(storage('gm'),avatarPath)));
  await assertFails(uploadBytes(ref(storage('gm'),avatarPath),bytes,{contentType:'image/webp'}));
});

test('membership revocation immediately invalidates existing Firestore and Storage permissions',async()=>{
  const media='campaigns/'+campaignId+'/battleMaps/revocation/scene.png';
  await assertSucceeds(uploadBytes(ref(storage('gm'),media),
    new Uint8Array([137,80,78,71,1]),{contentType:'image/png'}));
  await assertSucceeds(read('alice',at()));
  // A dedicated published asset avoids treating a protected overwrite as create.
  await assertSucceeds(getBytes(ref(storage('alice'),media)));
  await env.withSecurityRulesDisabled(async context=>{
    await updateDoc(doc(context.firestore(),at('members','alice')),{status:'suspended'});
  });
  await assertFails(read('alice',at()));
  await assertFails(read('alice',at('battleMaps','published')));
  await assertFails(read('alice',at('checkRequests','own')));
  await assertFails(read('alice',at('partyStashes','stash')));
  await assertFails(getBytes(ref(storage('alice'),media)));
  // User profile remains available to its owner; only campaign access is revoked.
  await assertSucceeds(read('alice',profile('alice')));
});
