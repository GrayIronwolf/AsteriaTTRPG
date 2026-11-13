import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html');
const controller=read('js/asteria-account-pages.js');
const friends=read('js/asteria-account-friends.js');
const menu=read('js/asteria-account-menu.js');
const header=read('js/asteria-account-header.js');
const style=read('css/asteria-account-pages.css');

test('dedicated account destinations are unique and use native authenticated view routing',()=>{
  for(const id of ['asteriaFriendsPage','asteriaNotificationsPage','asteriaAccountPage']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
    assert.match(controller,new RegExp(id));
  }
  for(const id of ['asteriaFriendsPageMount','asteriaNotificationsFriendFeed',
    'asteriaNotificationsCampaignFeed','asteriaNotificationsFilteredStatus'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(controller,/root\.setView\(pages\[name\]\)/);
  assert.match(controller,/ownerUid!==signedUid\(\)/);
  assert.match(controller,/asteria:firebase-signed-out/);
  assert.match(controller,/asteria:auth-changed/);
});

test('existing friend search, friend requests, and block UI are reused, not duplicated',()=>{
  for(const id of ['accountFriendsOverlay','accountFriendsSearchForm',
    'accountFriendsResult','accountFriendsAccepted','accountFriendsRequests',
    'accountFriendsBlocked','accountFriendsManageConfirm'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.match(controller,/mount\.appendChild\(overlay\)/);
  assert.match(controller,/content\.removeAttribute\('aria-modal'\)/);
  assert.match(friends,/window\.AsteriaAccountPages\.open\('friends'\)/);
  assert.match(menu,/AsteriaAccountPages\?\.open\?\.\('friends'\)/);
});

test('private notification feeds preserve existing callable implementations and per-page filters',()=>{
  for(const f of ['all','unread','read'])
    assert.match(html,new RegExp('data-asteria-notice-filter="'+f+'"'));
  assert.match(controller,/AsteriaFriendNotificationsUI\?\.render/);
  assert.match(controller,/AsteriaCampaignNotificationsUI\?\.render/);
  assert.match(controller,/classList\.contains\('is-unread'\)/);
  assert.match(style,/data-filter="unread"/);
  assert.match(style,/data-filter="read"/);
  assert.match(html,/Filters apply to the messages on the loaded pages/);
  assert.doesNotMatch(controller,/localStorage|indexedDB|collection\(|getDocs\(/);
});

test('account page reuses authenticated controls without a dropdown',()=>{
  for(const key of ['profile','appearance','security'])
    assert.match(html,new RegExp('data-asteria-account-section="'+key+'"'));
  assert.match(html,/data-asteria-account-action="logout"/);
  assert.match(controller,/AsteriaAccountProfile\?\.open/);
  assert.match(controller,/AsteriaAccountSecurity\?\.open/);
  assert.match(controller,/root\.logout\?\.\(\)/);
  assert.match(menu,/AsteriaAccountPages\?\.open\?\.\(name\)/);
  assert.match(html,/id="asteriaFriendsTop"/);
  assert.match(style,/asteria-account-logout/);
});
test('unread badge is private, clears on logout and counts only returned first-page messages',()=>{
  assert.match(html,/id="asteriaHeaderMail"[^>]*type="button"/);
  assert.match(html,/id="asteriaHeaderUnreadCount"/);
  assert.match(header,/noticeVersion\+\+/);
  assert.match(header,/signedInUid\(\)!==uid/);
  assert.match(header,/results\.reduce/);
  assert.match(header,/result\.value\.notifications\.filter/);
  assert.match(header,/readAt==null/);
  assert.match(header,/badge\.hidden=true/);
  assert.match(header,/99\+/);
  assert.match(controller,/asteriaHeaderMail'\)\?\.addEventListener\('click'/);
});

test('standalone additions do not change Firebase gates or email invitations',()=>{
  assert.match(html,/friendAccountLookup:true,friendRequestsEnabled:true,friendNotificationsEnabled:true/);
  assert.match(html,/emailInvitationControls:false/);
  assert.match(html,/campaignNotifications:new URLSearchParams/);
  assert.match(html,/campaignInAppCanary:new URLSearchParams/);
  assert.match(html,/css\/asteria-account-pages\.css/);
  assert.match(html,/js\/asteria-account-pages\.js/);
  assert.doesNotMatch(controller,/firebase deploy|functions\.httpsCallable|sendEmail/);
});
