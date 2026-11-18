import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountProfileProjection,copyableAccountId } from '../frontend/src/auth/accountProfileModel.mjs';
import { cloudAppearancePatch,readCloudAppearance,appearanceRevisionsMatch } from '../frontend/src/auth/accountAppearanceBridge.mjs';
import { validatedEditableProfile,proposedAccountUsername,avatarUploadError } from '../src/state/accountProfileEdit.mjs';
import { canActivateRoute } from '../frontend/src/app/featureRegistry.mjs';
import { previewServices,createAppServices } from '../frontend/src/services/appServices.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(resolve(root,path),'utf8');
const auth={uid:'owner',email:'owner@example.test',emailVerified:false};
const idAssigned='2026-11-18T10:00:00.000Z';
const profile={uid:'owner',email:'owner@example.test',username:'Owner',
  usernameLower:'owner',firstName:'First',lastName:'Last',
  accountId:'Owner#01234',accountNumber:'01234',accountIdKey:'owner#01234',
  accountIdAssignedAt:idAssigned,avatarUpdatedAt:{seconds:123,nanoseconds:5}};

test('profile presentation requires fresh owner UID and exact Auth email',()=>{
  assert.equal(accountProfileProjection(auth,{...profile,uid:'other'}),null);
  assert.equal(accountProfileProjection(auth,{...profile,email:'other@example.test'}),null);
  assert.equal(accountProfileProjection(auth,null),null);
  const account=accountProfileProjection(auth,profile);
  assert.equal(account.status,'assigned');
  assert.equal(account.accountId,'Owner#01234');
  assert.equal(account.avatarVersion,'123:5');
  assert.equal(copyableAccountId(account),'Owner#01234');
  assert.equal(copyableAccountId(accountProfileProjection(auth,{...profile,accountIdKey:'bad'})),null);
  assert.equal(copyableAccountId(accountProfileProjection(auth,{
    uid:'owner',email:'owner@example.test',username:'Owner'
  })),null);
});

test('identity fields cannot be patched or fake username reservations created',()=>{
  assert.deepEqual(validatedEditableProfile({firstName:' First ',lastName:' Last '}),
    {firstName:'First',lastName:'Last'});
  assert.throws(()=>validatedEditableProfile({firstName:'Name',lastName:'Other',accountId:'fake'}),/private fields/);
  assert.throws(()=>validatedEditableProfile({firstName:'',lastName:''}),/at least one name/);
  assert.deepEqual(proposedAccountUsername('NewOwner','01234'),{
    username:'NewOwner',accountId:'NewOwner#01234'
  });
  assert.throws(()=>proposedAccountUsername('NewOwner','bad'),/verified/);
});

test('avatar path and size are validated before upload; script has no arbitrary Storage path',()=>{
  assert.equal(avatarUploadError({type:'image/png',size:100}), '');
  assert.match(avatarUploadError({type:'image/svg+xml',size:100}),/PNG/);
  assert.match(avatarUploadError({type:'image/jpeg',size:5*1024*1024}),/4 MB/);
  const adapter=read('frontend/src/auth/firebaseAuthAdapter.mjs');
  assert.match(adapter,/accountAvatarPath\(user\.uid\)/);
  assert.match(adapter,/uploadBytes/);
  assert.match(adapter,/deleteObject/);
  assert.match(adapter,/getDocFromServer/);
  assert.match(adapter,/runTransaction/);
  assert.doesNotMatch(adapter.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,''),
    /window\.AsteriaFirebase|accountIdRegistry|accountIdAssignments/);
  assert.match(read('frontend/src/auth/avatarProcessor.mjs'),/canvas\.toBlob/);
});

test('cloud appearance retains unrelated legacy theme settings and guards revisions',()=>{
  const current={
    theme:{revision:3,value:{background:'dark',theme:'spellblade',accent:'#123456',glow:0.4}},
    typography:{revision:4,value:{heading:'Arial',reading:'Calibri',size:100}}
  };
  const parsed=readCloudAppearance(current);
  assert.equal(parsed.themeRevision,3);
  assert.equal(parsed.typographyRevision,4);
  assert.equal(parsed.appearance.bodyFont,'calibri');
  assert.ok(appearanceRevisionsMatch(current,parsed));
  const changed=cloudAppearancePatch({
    background:'dark-blue',bodyFont:'arial',displayFont:'baskerville',textSize:'large'
  },current);
  assert.equal(changed.theme.value.background,'darkBlue');
  assert.equal(changed.theme.value.accent,'#123456');
  assert.equal(changed.typography.value.reading,'Arial');
  assert.equal(changed.theme.revision,4);
  assert.equal(changed.typography.revision,5);
  assert.equal(appearanceRevisionsMatch({...current,theme:{revision:4}},parsed),false);
});

test('account routes require injected auth; protected gameplay remains locked',()=>{
  const authServices=createAppServices({auth:{subscribe(){}}});
  for(const id of ['account','profile','settings']){
    assert.equal(canActivateRoute(id,previewServices),false);
    assert.equal(canActivateRoute(id,authServices),true);
  }
  for(const id of ['dashboard','friends','notifications','character-forge','campaign-forge',
    'gm-dashboard','character-dashboard','invitation']){
    assert.equal(canActivateRoute(id,authServices),false,id);
  }
  const app=read('frontend/src/app/App.jsx');
  assert.match(app,/<AccountPage route=\{route\}/);
  const page=read('frontend/src/pages/AccountPage.jsx');
  assert.match(page,/isVerifiedOwnedSession/);
  assert.match(page,/verificationResendAvailable/);
  assert.match(page,/data-testid="site-account-settings"/);
  assert.match(page,/data-testid="site-account-profile"/);
  assert.match(page,/data-testid="site-account-security"/);
  assert.match(page,/data-testid="site-account-appearance"/);
  assert.doesNotMatch(page,/dangerouslySetInnerHTML|localStorage|sessionStorage/);
});

test('Phase 4.2 CI tests authenticated accounts against Auth, Firestore and Storage emulators',()=>{
  const pkg=JSON.parse(read('package.json'));
  const ci=read('.github/workflows/site-foundation.yml');
  assert.match(pkg.scripts['site:check'],/site-account-phase4-2\.test\.mjs/);
  assert.match(ci,/--only auth,firestore,storage/);
  assert.match(ci,/npm run site:auth-browser/);
  assert.match(ci,/npm run site:acceptance/);
  assert.doesNotMatch(read('index.html'),/frontend\/src\/pages\/AccountPage/);
});
