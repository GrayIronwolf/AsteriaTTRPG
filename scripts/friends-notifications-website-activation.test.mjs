import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('index.html');
const flagsMatch=source.match(/<script>window\.AsteriaFeatureFlags = Object\.freeze\((\{[^<]*\})\);<\/script>/);
function flags(){
  assert.ok(flagsMatch,'Expected one immutable website feature flag object.');
  const window={location:{search:''}};
  vm.runInNewContext('window.flags='+flagsMatch[1],{window,URLSearchParams});
  return window.flags;
}

test('social inbox enabled only, campaign controls and independent canaries unaffected',()=>{
  const f=flags();
  assert.equal(f.friendNotificationsEnabled,true);
  assert.equal(f.campaignNotifications,false);
  assert.equal(f.serverCampaignUCN,false);
  assert.equal(f.campaignJoinRequests,false);
  assert.equal(f.friendAccountLookup,false);
  assert.equal(f.friendRequestsEnabled,false);
  const canary={location:{search:'?friends-lookup-canary=1&friends-requests-canary=1'}};
  vm.runInNewContext('window.flags='+flagsMatch[1],{
    window:canary,URLSearchParams
  });
  assert.equal(canary.flags.friendAccountLookup,true);
  assert.equal(canary.flags.friendRequestsEnabled,true);
  assert.equal(canary.flags.friendNotificationsEnabled,true);
  assert.equal(canary.flags.campaignNotifications,false);
});

test('website activation references versioned notification client assets exactly once',()=>{
  const assets=[
    'js/asteria-account-menu.js',
    'js/asteria-account-header.js',
    'js/firebase-auth.js',
    'js/asteria-friend-notifications.js',
    'js/clean-compendium.js'
  ];
  for(const asset of assets){
    const version=asset+'?v='+(
      asset==='js/firebase-auth.js'?'friends-phase5-2':
        'friends-notifications-website-20261111');
    assert.equal(source.split(version).length-1,1,asset+' must be cache-busted once');
  }
  assert.match(source,/css\/asteria-friend-notifications\.css/);
  const flag=source.indexOf('window.AsteriaFeatureFlags = Object.freeze(');
  const firebase=source.indexOf('js/firebase-auth.js?v=friends-phase5-2');
  const social=source.indexOf('js/asteria-friend-notifications.js?v=friends-notifications-website-20261111');
  const workspace=source.indexOf('js/clean-compendium.js?v=friends-notifications-website-20261111');
  assert.ok(flag>=0&&flag<firebase&&firebase<social&&social<workspace);
});

test('client requests remain authenticated, recipient-scoped and server-only',()=>{
  const firebase=read('js/firebase-auth.js');
  const social=read('js/asteria-friend-notifications.js');
  assert.match(firebase,/httpsCallable\(functionsClient,'asteriaFriendNotifications'\)/);
  assert.match(firebase,/ownershipReadyUid!==uid/);
  assert.match(firebase,/currentUser\?\.uid!==uid/);
  assert.match(social,/root\.AsteriaAuthBridge\?\.isLoggedIn\?\.\(\)===true/);
  assert.match(social,/sessionRevision===revision/);
  assert.match(social,/asteria:firebase-signed-out/);
  assert.match(social,/new Intl\.DateTimeFormat/);
  assert.match(social,/Mark as Read/);
  assert.doesNotMatch(social,/getDoc\(|getDocs\(|localStorage|sessionStorage|innerHTML/);
});

test('backend emission, inbox auth, and private Firestore rules are still separate',()=>{
  const entry=read('functions/index.mjs');
  const rules=read('firestore.rules');
  assert.match(entry,/ASTERIA_FRIEND_NOTIFICATIONS_ENABLED!=='1'/);
  assert.match(entry,/notificationsEnabled:process\.env\.ASTERIA_FRIEND_NOTIFICATIONS_ENABLED==='1'/);
  assert.match(rules,/match \/friendNotificationInbox\/\{uid\}/);
  assert.match(rules,/match \/friendNotificationAccessThrottle\/\{uid\}/);
  const workflow=read('.github/workflows/firebase-deploy.yml');
  assert.match(workflow,/friend-notifications-events-deactivate/);
  assert.match(workflow,/friend-notifications-read-deactivate/);
  assert.match(workflow,/environment: firebase-production/);
  // The website-only activation must not change any Firebase deployment scope.
  assert.match(workflow,/--only "functions:asteria:\$NOTIFICATION_RELEASE_TARGET"/);
});

test('website release remains a separate PR; preserve a reversible flag-only path',()=>{
  assert.equal((source.match(/friendNotificationsEnabled:true/g)||[]).length,1);
  assert.equal((source.match(/campaignNotifications:new URLSearchParams/g)||[]).length,1);
  assert.equal((source.match(/campaignInAppCanary:new URLSearchParams/g)||[]).length,1);
  const helper=read('scripts/friends-notifications-activation-release.mjs');
  assert.match(helper,/clientFlag\.length!==1/);
  assert.doesNotMatch(helper,/isOn\(operation\)&&clientFlag\[0\]/);
  const rules=read('scripts/friends-notifications-scoped-rules.mjs');
  assert.doesNotMatch(rules,/source\.includes\('friendNotificationsEnabled:true'\)/);
});
