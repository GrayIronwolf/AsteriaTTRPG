import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatedEditableProfile,identityFieldsUnchanged,avatarUploadError,accountAvatarPath} from '../src/state/accountProfileEdit.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('account editing cannot change the permanent username, UID or Account ID',()=>{
  const edits=validatedEditableProfile({firstName:' Jaida ',lastName:' Hale ',displayName:' Jade '});
  assert.deepEqual(edits,{firstName:'Jaida',lastName:'Hale',displayName:'Jade'});
  for(const key of ['username','usernameLower','uid','accountId','accountNumber','accountIdKey','email']){
    assert.throws(()=>validatedEditableProfile({...edits,[key]:'changed'}),/identity/);
  }
  const initial={uid:'one',username:'Grayson',usernameLower:'grayson',accountId:'Grayson#01448',accountNumber:'01448',accountIdKey:'grayson#01448'};
  assert.equal(identityFieldsUnchanged(initial,{...initial,...edits}),true);
  assert.equal(identityFieldsUnchanged(initial,{...initial,accountNumber:'01449'}),false);
});
test('profile input rejects empty or invalid names',()=>{
  assert.equal(validatedEditableProfile({firstName:'Éowyn',lastName:'',displayName:''}).firstName,'Éowyn');
  assert.throws(()=>validatedEditableProfile({firstName:'',lastName:'',displayName:''}),/at least one/);
  assert.throws(()=>validatedEditableProfile({firstName:'<script>',lastName:'',displayName:''}),/invalid/);
});
test('avatar validates size, content and authenticated owner path',()=>{
  assert.equal(accountAvatarPath('alice'),'users/alice/profile/avatar');
  assert.throws(()=>accountAvatarPath('../bob'),/Invalid/);
  assert.equal(avatarUploadError({type:'image/jpeg',size:1024}),'');
  assert.match(avatarUploadError({type:'image/svg+xml',size:1024}),/PNG/);
  assert.match(avatarUploadError({type:'image/webp',size:4*1024*1024+1}),/4 MB/);
  const rules=read('storage.rules');
  assert.match(rules,/match \/users\/\{uid\}\/profile\/avatar/);
  assert.match(rules,/request\.auth\.uid == uid/);
  assert.match(rules,/request\.resource\.contentType == 'image\/webp'/);
});
test('header removes duplicate home and keeps account accessible on mobile',()=>{
  const html=read('index.html'),nav=read('js/asteria-navigation.js'),css=read('css/asteria-account-experience.css');
  for(const id of ['asteriaHeaderProfile','asteriaHeaderAvatar','asteriaHeaderAccountId','accountMenuAppearance']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.doesNotMatch(html,/id="sidebarHomeButton"/);
  assert.match(html,/class="asteria-header-brand" href="#home"/);
  assert.match(nav,/mobileNavigationSlot'\)\?\.appendChild\(nav\)/);
  assert.doesNotMatch(nav,/mobileAccountSlot'\)\?\.appendChild\(accounts\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/asteria-header-arriving/);
});
test('My Profile edits never issue new IDs or modify the registry',()=>{
  const html=read('index.html'),profile=read('js/asteria-account-profile.js');
  for(const id of ['accountProfileEdit','accountProfileEditForm','accountProfileSave',
   'accountProfileAvatarFile','accountProfileAvatarUpload','accountProfileAvatarRemove']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(profile,/saveEditableAccountProfile\(details\)/);
  assert.match(profile,/saveOwnAccountAvatar\(file\)/);
  assert.match(profile,/removeOwnAccountAvatar\(\)/);
  assert.doesNotMatch(profile,/accountIdRegistry|accountIdAssignments|runTransaction\(/);
});
test('Firebase profile edits remain authenticated and independent of permanent identity',()=>{
  const src=read('js/firebase-auth.js');
  assert.match(src,/saveEditableAccountProfile: async function/);
  assert.match(src,/validatedEditableProfile\(input\)/);
  assert.match(src,/runTransaction\(db,async tx=>/);
  assert.match(src,/readOwnAccountAvatar: async function/);
  assert.match(src,/saveOwnAccountAvatar: async function/);
  assert.match(src,/removeOwnAccountAvatar: async function/);
  const edit=src.slice(src.indexOf('saveEditableAccountProfile: async function'),src.indexOf('subscribeAppearancePreferences: function'));
  assert.doesNotMatch(edit,/accountIdRegistry|accountIdAssignments|usernameLower\s*:/);
});
test('header reads fresh verified identity and disregards switched accounts',()=>{
  const src=read('js/asteria-account-header.js');
  assert.match(src,/inspectAccountProfileDisplay\(/);
  assert.match(src,/requestVersion/);
  assert.match(src,/signedInUid\(\)!==uid/);
  assert.match(src,/asteria:firebase-signed-out/);
  assert.match(src,/window\.AsteriaFeatureFlags\?\.campaignNotifications!==true/);
});
test('Appearance is separate from explicit Logout',()=>{
  const source=read('js/asteria-account-menu.js');
  assert.match(source,/window\.openSettings\?\.\(\)/);
  assert.match(source,/window\.logout\?\.\(\)/);
  assert.match(source,/window\.AsteriaAccountProfile\?\.open\?\.\(\)/);
  assert.match(source,/window\.AsteriaAccountSecurity\?\.open\?\.\(\)/);
  assert.doesNotMatch(read('index.html'),/onclick="logout\(\)"/);
});

test('avatar release is independently approved and limited to Storage rules',()=>{
 const yaml=read('.github/workflows/firebase-deploy.yml');
 const block=yaml.slice(yaml.indexOf('  account_profile_avatar_rules:'));
 assert.ok(block.length>100,'scoped production job is defined');
 assert.match(block,/inputs\.operation == 'account-profile-avatar-rules-deploy'/);
 assert.match(block,/inputs\.production_confirmation == 'DEPLOY-ASTERIA-PROFILE-AVATAR-RULES'/);
 assert.match(block,/environment: firebase-production/);
 assert.match(block,/firebase deploy --project asteria-ttrpg --only storage --non-interactive/);
 assert.doesNotMatch(block,/--only functions|--only firestore|deploy --project asteria-ttrpg --only functions/);
});
