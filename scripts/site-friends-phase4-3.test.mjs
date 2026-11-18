import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 assertHandle,assertCursor,assertCandidate,validateLookup,validatePage,
 validateAction,validateMutationInput,confirmationText
} from '../frontend/src/friends/friendContracts.mjs';
import {createFirebaseFriendsService} from '../frontend/src/friends/firebaseFriendsService.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';
import {previewServices,createAppServices} from '../frontend/src/services/appServices.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(resolve(root,name),'utf8');
const account={username:'Player',accountId:'Player#01234'};
const person={...account,version:3,friendsSinceMs:1000};
const blocked={...account,version:3,blockedAtMs:1000};
const incoming={...account,version:3,direction:'incoming',
 status:'pending',requestedAtMs:1000,expiresAtMs:5000};

test('exact account discovery excludes guesses and private identity fields',()=>{
 assert.equal(assertHandle('Player#01234'),'Player#01234');
 for(const invalid of ['Player','Player#1234','player@example.test','A#01234',' Player#01234']) {
  assert.throws(()=>assertHandle(invalid),/full Username/);
 }
 assert.deepEqual(validateLookup({found:false}),{found:false});
 assert.deepEqual(validateLookup({found:true,...account}),{found:true,...account});
 assert.throws(()=>validateLookup({found:true,...account,uid:'private'}),/Invalid/);
 assert.throws(()=>validateLookup({found:true,...account,email:'private@example.test'}),/Invalid/);
 assert.throws(()=>validateLookup({found:true,username:'Other',accountId:'Player#01234'}),/Invalid/);
});

test('bounded server-side friend pagination and versions are verified',()=>{
 assert.equal(assertCursor(20),20);
 for(const bad of [-1,1,19,1001,NaN]) assert.throws(()=>assertCursor(bad),/Invalid/);
 assert.deepEqual(assertCandidate(account),account);
 assert.equal(validatePage({items:[person],nextCursor:20},'accepted',0).items[0].version,3);
 assert.equal(validatePage({items:[blocked],nextCursor:null},'blocked',0).items[0].accountId,account.accountId);
 assert.equal(validatePage({items:[incoming],nextCursor:null},'requests',0).items[0].direction,'incoming');
 assert.throws(()=>validatePage({items:[{...person,uid:'unsafe'}],nextCursor:null},'accepted',0),/Invalid/);
 assert.throws(()=>validatePage({items:Array(21).fill(person),nextCursor:null},'accepted',0),/Invalid/);
 assert.throws(()=>validatePage({items:[incoming],nextCursor:0},'requests',0),/Invalid/);
 assert.throws(()=>validatePage({items:[{...incoming,status:'accepted'}],nextCursor:null},'requests',0),/Invalid/);
});

test('mutation actions are constrained by server version and exact action result',()=>{
 assert.deepEqual(validateMutationInput('send',account.accountId),
   {action:'send',targetAccountId:account.accountId});
 assert.deepEqual(validateMutationInput('accept',account.accountId,3),
   {action:'accept',targetAccountId:account.accountId,expectedVersion:3});
 assert.throws(()=>validateMutationInput('remove',account.accountId),/Refresh/);
 assert.throws(()=>validateMutationInput('cancel',account.accountId),/Refresh/);
 assert.throws(()=>validateMutationInput('delete-everything',account.accountId),/Unsupported/);
 assert.equal(validateAction({ok:true,status:'blocked',version:3,expiresAtMs:null},'block').ok,true);
 assert.equal(validateAction({ok:true,status:'removed',version:3,expiresAtMs:null},'unblock').ok,true);
 assert.throws(()=>validateAction({ok:true,status:'accepted',version:3,expiresAtMs:null,uid:'unsafe'},'accept'),/Invalid/);
 assert.throws(()=>validateAction({ok:true,status:'removed',version:3,expiresAtMs:null},'block'),/Invalid/);
 assert.match(confirmationText('block',account.accountId),/does not restore/);
 assert.match(confirmationText('unblock',account.accountId),/seven-day/);
 assert.match(confirmationText('remove',account.accountId),/seven-day/);
});

test('single Firebase Functions service scopes reads to authenticated owner and rejects switches',async()=>{
 const auth={currentUser:{uid:'actor'}},calls=[];
 let deferred;
 const sdk={httpsCallable(_functions,name){return async data=>{
   calls.push({name,data});
   if(deferred)return new Promise(resolve=>{deferred=resolve;});
   if(name==='asteriaFriendAccountLookup')return {data:{found:true,...account}};
   if(data.action==='list-friends')return {data:{items:[person],nextCursor:null}};
   if(data.action==='list-blocked')return {data:{items:[blocked],nextCursor:null}};
   if(data.action==='list')return {data:{items:[incoming],nextCursor:null}};
   return {data:{ok:true,status:'pending',version:1,expiresAtMs:null}};
 }}};
 const flags={enabled:true,lookup:true,requests:true};
 const service=createFirebaseFriendsService({auth,functions:{},functionsSdk:sdk,flags});
 assert.deepEqual(await service.find(account.accountId),{found:true,...account});
 assert.equal((await service.list('accepted')).items[0].username,'Player');
 assert.equal((await service.list('blocked')).items[0].version,3);
 assert.equal((await service.list('incoming')).items[0].direction,'incoming');
 assert.equal((await service.change('send',account.accountId)).status,'pending');
 assert.equal(calls[0].name,'asteriaFriendAccountLookup');
 assert.equal(calls[0].data.uid,undefined);
 assert.ok(calls.every(call=>!('uid' in call.data)&&!('email' in call.data)));
 deferred=true;
 const pending=service.find(account.accountId);
 await Promise.resolve();
 auth.currentUser={uid:'other'};
 deferred({data:{found:true,...account}});
 await assert.rejects(pending,/Account changed/);
 auth.currentUser=null;
 await assert.rejects(service.list('accepted'),/Sign in/);
});

test('Friends requires explicit injected service and keeps gameplay and notifications closed',()=>{
 assert.equal(canActivateRoute('friends',previewServices),false);
 const services=createAppServices({auth:{subscribe(){}},friends:{list(){} }});
 assert.equal(canActivateRoute('friends',services),true);
 for(const id of ['notifications','dashboard','character-forge','campaign-forge',
   'gm-dashboard','character-dashboard','invitation'])
  assert.equal(canActivateRoute(id,services),false,id);
 const bootstrap=read('frontend/src/auth/AuthBootstrap.jsx');
 assert.match(bootstrap,/adapter\.friends\?\.availability\(\)\.enabled/);
 const source=read('frontend/src/auth/firebaseAuthAdapter.mjs');
 assert.match(source,/VITE_ASTERIA_FRIENDS_ENABLED==='true'/);
 assert.match(source,/createFirebaseFriendsService/);
 const noComments=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 assert.doesNotMatch(noComments,/friendRelationshipPath|accountIdRegistry|accountIdAssignments|localStorage/);
 const page=read('frontend/src/pages/FriendsPage.jsx');
 assert.match(page,/site-friends-page/);
 assert.match(page,/session\.profileAvailable/);
 assert.match(page,/epoch\.current/);
 assert.match(page,/Private friend-to-friend messaging is not enabled/);
 assert.doesNotMatch(page,/dangerouslySetInnerHTML|localStorage|sessionStorage|getDoc\(|getDocs\(/);
 const css=read('frontend/src/pages/FriendsPage.module.css');
 assert.doesNotMatch(css,/:global\(|!important|@import/);
});

test('Phase 4.3 preserves offline preview and prior React checks',()=>{
 const pkg=JSON.parse(read('package.json'));
 const ci=read('.github/workflows/site-foundation.yml');
 assert.match(pkg.scripts['site:check'],/site-friends-phase4-3\.test\.mjs/);
 assert.match(ci,/React\/Vite site migration/);
 assert.match(ci,/npm run site:auth-browser/);
 assert.match(ci,/npm run site:acceptance/);
 assert.doesNotMatch(read('index.html'),/frontend\/src\/pages\/FriendsPage/);
});
