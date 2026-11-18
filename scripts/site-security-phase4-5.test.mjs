import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 isPublishedDefinition,validatePublishedCatalogue,
 validatePublishedEntry,validatePublishedSearch,resolveCompendiumPublicationAccess
} from '../frontend/src/compendium/publicationPolicy.mjs';
import {
 isVerifiedOwnedSession,classifyPrivateRoute,canReadRestrictedCompendium
} from '../frontend/src/auth/accountSecurityPolicy.mjs';
import {createAppServices,previewServices} from '../frontend/src/services/appServices.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const published={id:'lore:sample',title:'Example',slug:'sample',domain:'lore',
 visibility:'public',gmOnly:false,metadata:{visibility:'public'}};
const session={
 status:'authenticated',profileAvailable:true,
 identity:{status:'authenticated',verified:true,username:'Member'},
 user:{uid:'owner',email:'owner@example.test',emailVerified:false}
};

test('single build-time rule excludes private, GM and metadata-only restricted definitions',()=>{
 assert.equal(isPublishedDefinition(published),true);
 assert.equal(isPublishedDefinition({...published,metadata:{}}),true);
 for(const replacement of [
  {visibility:'gm-only'},{visibility:'player'},{visibility:'private'},
  {gmOnly:true},{private:true},{secret:true},
  {metadata:{visibility:'gm-only'}},{metadata:{visibility:'private'}},
  {metadata:{private:true}},{metadata:{secret:true}},{metadata:{gmOnly:true}}
 ]){
  assert.equal(isPublishedDefinition({...published,...replacement}),false,JSON.stringify(replacement));
 }
 assert.equal(resolveCompendiumPublicationAccess('public').visible,true);
 for(const visibility of ['gm-only','private','player','GM','unknown',null]){
  assert.deepEqual(resolveCompendiumPublicationAccess(visibility),
   {visible:false,source:'server-only-required'});
 }
});

test('published output contracts reject any extra sensitive fields or GM-only headings',()=>{
 const catalogue={id:'lore:sample',title:'Example',slug:'sample',domain:'lore',
  href:'#/compendium/lore/sample',categoryPath:[],category:'',summary:'',tags:[]};
 const entry={id:'lore:sample',title:'Example',slug:'sample',domain:'lore',
  summary:'',categoryPath:[],sections:[{title:'Overview',body:'Public'}]};
 const search={id:'lore:sample',text:'public'};
 assert.equal(validatePublishedCatalogue(catalogue,'lore').id,entry.id);
 assert.equal(validatePublishedEntry(entry,'lore').id,entry.id);
 assert.equal(validatePublishedSearch(search,'lore').id,entry.id);
 for(const field of ['gmNotes','privateNotes','recipientUid','ownerUid','role','permissions','sourcePath','body','visibility']){
  assert.throws(()=>validatePublishedCatalogue({...catalogue,[field]:'private'},'lore'),/Untrusted/);
  assert.throws(()=>validatePublishedEntry({...entry,[field]:'private'},'lore'),/Untrusted/);
  assert.throws(()=>validatePublishedSearch({...search,[field]:'private'},'lore'),/Untrusted/);
 }
 assert.throws(()=>validatePublishedEntry({...entry,sections:[
  {title:'GM Notes',body:'secret'}]},'lore'),/Untrusted/);
 assert.throws(()=>validatePublishedEntry({...entry,sections:[
  {title:'Private Notes',body:'secret'}]},'lore'),/Untrusted/);
 assert.throws(()=>validatePublishedCatalogue({...catalogue,id:'item:other'},'lore'),/Untrusted/);
});

test('verified account profile is distinct from GM authorization and arbitrary flags',()=>{
 assert.equal(isVerifiedOwnedSession(session),true);
 assert.equal(isVerifiedOwnedSession({...session,status:'guest'}),false);
 assert.equal(isVerifiedOwnedSession({...session,profileAvailable:false}),false);
 assert.equal(isVerifiedOwnedSession({...session,identity:null}),false);
 assert.equal(isVerifiedOwnedSession({...session,user:{uid:'',email:'owner@example.test'}}),false);
 assert.equal(classifyPrivateRoute(session,true),'allowed');
 assert.equal(classifyPrivateRoute({...session,profileAvailable:false},true),'profile-unverified');
 assert.equal(classifyPrivateRoute({...session,status:'checking'},true),'checking');
 assert.equal(classifyPrivateRoute({...session,status:'guest'},true),'login-required');
 assert.equal(classifyPrivateRoute(session,false),'unavailable');
 for(const role of ['GM','Admin','Owner','Player']){
   assert.equal(canReadRestrictedCompendium({...session,role,gm:true,permissions:['all']}),false);
 }
 assert.equal(canReadRestrictedCompendium({status:'guest'}),false);
});

test('protected services fail closed in guest and no campaign-role bypass exists',()=>{
 const authenticated=createAppServices({auth:{subscribe(){}}});
 assert.equal(canActivateRoute('account',previewServices),false);
 assert.equal(canActivateRoute('account',authenticated),true);
 for(const route of ['friends','notifications','dashboard','gm-dashboard','character-dashboard',
  'character-forge','campaign-forge','invitation']){
  assert.equal(canActivateRoute(route,authenticated),false,route);
 }
 for(const page of ['AccountPage.jsx','FriendsPage.jsx','NotificationsPage.jsx']){
  const code=read('frontend/src/pages/'+page);
  assert.match(code,/isVerifiedOwnedSession/);
  assert.doesNotMatch(code,/localStorage|sessionStorage|dangerouslySetInnerHTML/);
 }
 const source=read('frontend/src/notifications/NotificationsProvider.jsx');
 assert.match(source,/isVerifiedOwnedSession/);
 const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
 assert.match(adapter,/getDocFromServer/);
 assert.match(adapter,/assertOwner\(user.uid\)/);
 assert.doesNotMatch(adapter,/window\.AsteriaFirebase/);
});

test('public Vite loaders contain only static approved shards and no privileged fetch fallback',()=>{
 for(const name of ['publicCatalogue.mjs','publicEntryLoader.mjs','publicSearchIndex.mjs']){
  const file=read('frontend/src/compendium/'+name);
  assert.match(file,/publicationPolicy/);
  assert.match(file,/import\.meta\.glob/);
  assert.doesNotMatch(file,/window\.AsteriaFirebase|onSnapshot|firestore\/|getDoc\(|getDocs\(/);
 }
 for(const name of ['site-compendium-public-index.mjs','site-compendium-public-entries.mjs']){
  assert.match(read('scripts/'+name),/isPublishedDefinition/);
 }
 assert.match(read('scripts/site-compendium-search-index.mjs'),/validatePublishedEntry/);
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts['site:build'],/site:security-audit/);
 assert.match(pkg.scripts['site:check'],/site-security-phase4-5\.test\.mjs/);
 assert.match(read('.github/workflows/site-foundation.yml'),/site:security-audit/);
 assert.doesNotMatch(read('index.html'),/frontend\/src\/compendium/);
});

test('generated public definitions cannot contain canonical restricted IDs',()=>{
 const raw=readdirSync(resolve(root,'data/compendium-parts'))
  .filter(name=>/^[a-z]+-[a-f0-9]+\.json$/.test(name));
 const hidden=new Set(),publishedIds=new Set();
 for(const file of raw){
  const json=JSON.parse(read('data/compendium-parts/'+file));
  for(const item of json.entries){
   (isPublishedDefinition(item)?publishedIds:hidden).add(item.id);
  }
 }
 let count=0;
 for(const domain of ['race','class','creature','item','spell','talent','profession',
  'skill','origin','location','religion','faction','lore','handbook']){
  for(const part of ['public-index','public-entry-index','public-search-index']){
   const json=JSON.parse(read('frontend/src/compendium/'+part+'/'+domain+'.json'));
   for(const item of json.entries){
    assert.ok(publishedIds.has(item.id),'Unapproved public Compendium record');
    assert.equal(hidden.has(item.id),false);
    count++;
   }
  }
 }
 assert.ok(count>600);
});
