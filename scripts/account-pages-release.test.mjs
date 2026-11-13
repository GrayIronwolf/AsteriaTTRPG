import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function harness(){
  const elements={},domEvents={},events={},calls=[];
  let uid='alice',loggedIn=true;
  const make=id=>({
    id,hidden:false,dataset:{},textContent:'',attrs:{},children:[],parentElement:null,
    classList:{values:new Set(),
      contains(v){return this.values.has(v);},
      add(v){this.values.add(v);},
      remove(v){this.values.delete(v);}
    },
    setAttribute(k,v){this.attrs[k]=v;},
    removeAttribute(k){delete this.attrs[k];},
    replaceChildren(...items){this.children=items;this.children.length=items.length;},
    appendChild(node){node.parentElement=this;this.children.push(node);},
    addEventListener(k,fn){this.events=this.events||{};this.events[k]=fn;},
    querySelector(){return null;},querySelectorAll(){return [];},
    focus(){calls.push('focus:'+this.id);}
  });
  for(const id of ['asteriaFriendsPage','asteriaNotificationsPage','asteriaAccountPage',
    'asteriaFriendsPageMount','accountFriendsOverlay','asteriaNotificationsFeeds',
    'asteriaNotificationsFriendFeed','asteriaNotificationsCampaignFeed',
    'asteriaNotificationsFilteredStatus','asteriaNotificationsServiceStatus',
    'asteriaAccountPageStatus','asteriaHeaderMail','mainContent','settingsPanel','settingsTitle',
    'asteriaAccountTabProfile','asteriaAccountTabSettings','asteriaAccountTabAppearance','asteriaAccountTabSecurity',
    'asteriaAccountPanelProfile','asteriaAccountPanelSettings','asteriaAccountPanelAppearance','asteriaAccountPanelSecurity']){
    elements[id]=make(id);
  }
  for(const name of ['asteriaFriendsPage','asteriaNotificationsPage','asteriaAccountPage'])
    elements[name].querySelector=selector=>selector==='h1'?make(name+'Heading'):null;
  const body=make('body');
  elements.accountFriendsOverlay.parentElement=body;
  elements.accountFriendsOverlay.querySelector=selector=>
    selector==='.asteria-friends-dialog'?make('friendsContent'):null;
  elements.asteriaNotificationsFeeds.querySelectorAll=()=>[];
  const document={
    readyState:'loading',
    getElementById:id=>elements[id]||null,
    querySelectorAll:()=>[],
    addEventListener(name,fn){domEvents[name]=fn;}
  };
  let friendsOpen=false;
  const window={
    document,
    AsteriaFirebase:{getUser:()=>uid?{uid}:null},
    AsteriaAuthBridge:{isLoggedIn:()=>loggedIn},
    AsteriaFeatureFlags:{friendNotificationsEnabled:true,campaignNotifications:false},
    AsteriaFriends:{
      isOpen:()=>friendsOpen,
      open(){friendsOpen=true;calls.push('friends-open');return true;},
      close(){friendsOpen=false;calls.push('friends-close');}
    },
    AsteriaFriendNotificationsUI:{render(node){calls.push('render-friend');return true;}},
    AsteriaCampaignNotificationsUI:{render(node){calls.push('render-campaign');}},
    AsteriaAccountMenu:{close(){calls.push('menu-close');}},
    closeSettings(){calls.push('settings-close');},
    setView(name){
      calls.push('view:'+name);
      for(const id of ['asteriaFriendsPage','asteriaNotificationsPage','asteriaAccountPage'])
        elements[id].classList.values.clear();
      elements[name]?.classList.add('show');
    },
    addEventListener(name,fn){events[name]=fn;},
    scrollTo(){calls.push('scroll');}
  };
  vm.runInNewContext(read('js/asteria-account-pages.js'),{window});
  return {
    api:window.AsteriaAccountPages,window,elements,events,domEvents,calls,
    load:()=>domEvents.DOMContentLoaded?.(),
    signOut(){uid='';loggedIn=false;events['asteria:firebase-signed-out']?.();},
    setUid:x=>{uid=x;},
    isFriendsOpen:()=>friendsOpen
  };
}

test('three distinct account destinations exist with preserved Friends IDs and private feeds',()=>{
  const html=read('index.html');
  for(const id of ['asteriaFriendsPage','asteriaNotificationsPage',
    'asteriaAccountPage','asteriaFriendsPageMount',
    'asteriaNotificationsFriendFeed','asteriaNotificationsCampaignFeed',
    'asteriaNoticeFilterAll','asteriaNoticeFilterUnread','asteriaNoticeFilterRead',
    'asteriaHeaderUnreadCount']){
    assert.equal(html.split('id="'+id+'"').length-1,1,id);
  }
  for(const id of ['accountFriendsOverlay','accountFriendsSearchForm','accountFriendsAcceptedList',
    'accountFriendsRequestList','accountFriendsBlockedList','accountFriendsPublicPreview'])
    assert.equal(html.split('id="'+id+'"').length-1,1,id);
  assert.ok(html.includes('css/asteria-account-pages.css?v=gm-toolkit-1-2'));
  assert.ok(html.includes('js/asteria-account-pages.js?v=gm-toolkit-1-2'));
  assert.ok(html.indexOf('js/asteria-friend-notifications.js')<
    html.indexOf('js/asteria-account-pages.js'));
  assert.ok(html.indexOf('js/asteria-account-pages.js')<
    html.indexOf('js/clean-compendium.js'));
});

test('Friend navigation reuses original component and switches to real page',()=>{
  const h=harness();
  assert.equal(h.api.open('friends'),true);
  assert.ok(h.elements.asteriaFriendsPage.classList.contains('show'));
  assert.equal(h.elements.accountFriendsOverlay.parentElement,h.elements.asteriaFriendsPageMount);
  assert.equal(h.isFriendsOpen(),true);
  assert.equal(h.api.open('account'),true);
  assert.equal(h.isFriendsOpen(),false);
  assert.ok(h.elements.asteriaAccountPage.classList.contains('show'));
  assert.equal(h.api.open('unreviewed'),false);
});

test('Notification page respects flags, loads private renderer and supports in-page filters',()=>{
  const h=harness();h.load();
  assert.equal(h.api.open('notifications'),true);
  assert.ok(h.calls.includes('render-friend'));
  assert.ok(h.elements.asteriaNotificationsPage.classList.contains('show'));
  assert.equal(h.elements.asteriaNotificationsFeeds.dataset.filter,'all');
  h.elements.asteriaNotificationsPage.events.click({
    target:{closest:()=>({dataset:{asteriaNoticeFilter:'unread'}})}
  });
  assert.equal(h.elements.asteriaNotificationsFeeds.dataset.filter,'unread');
  assert.equal(h.api.isOpen('notifications'),true);
  const openFromBadge=h.elements.asteriaHeaderMail.events.click;
  openFromBadge();
  assert.ok(h.calls.filter(x=>x==='view:asteriaNotificationsPage').length>=2);
});

test('Account pages fail closed on sign-out and discard account-specific messages',()=>{
  const h=harness();h.load();
  assert.equal(h.api.open('notifications'),true);
  h.signOut();
  assert.equal(h.api.isOpen('notifications'),false);
  assert.equal(h.elements.asteriaNotificationsFriendFeed.children.length,0);
  assert.equal(h.api.open('account'),false);
  assert.ok(h.calls.includes('view:loginPage'));
});

test('Only authenticated callable renderers access notification data; no new browser reads',()=>{
  const src=read('js/asteria-account-pages.js');
  for(const fragment of [
    'root.AsteriaFriendNotificationsUI?.render?.(social)',
    'root.AsteriaCampaignNotificationsUI?.render?.(campaigns)',
    "root.AsteriaFriends?.open?.()",
    'root.AsteriaAuthBridge?.isLoggedIn?.()===true',
    "'asteria:firebase-signed-out'",
    "'asteria:notifications-updated'"
  ])assert.ok(src.includes(fragment),fragment);
  assert.doesNotMatch(src,/getDoc\(|getDocs\(|collection\(|localStorage|sessionStorage|indexedDB|fetch\(/);
  const html=read('index.html');
  assert.match(html,/campaignNotifications:new URLSearchParams/);
  assert.match(html,/emailInvitationControls:false/);
  assert.match(html,/friendRequestsEnabled:true/);
});

test('Unified Account page keeps original authenticated actions',()=>{
  const menu=read('js/asteria-account-menu.js');
  assert.match(menu,/AsteriaAccountPages\?\.open\?\.\(name\)/);
  const source=read('js/asteria-account-pages.js');
  assert.match(source,/AsteriaAccountSecurity\?\.open\?\.\(\)/);
  assert.match(source,/AsteriaAccountProfile\?\.open\?\.\(\)/);
  assert.match(source,/root\.logout\?\.\(\)/);
  const css=read('css/asteria-account-pages.css');
  assert.match(css,/asteria-account-signout/);
  assert.match(css,/data-filter="unread"/);
  assert.doesNotMatch(source,/lastSeen|presenceHeartbeat|online:true|onlineStatus/);
});
test('Phase 1.1 uses the sketched text-only account sidebar and accessible content panels',()=>{
  const html=read('index.html');
  const css=read('css/asteria-account-pages.css');
  assert.match(html,/class="asteria-account-shell"/);
  assert.match(html,/class="asteria-account-sidebar-options" role="tablist"/);
  for(const id of ['Profile','Settings','Appearance','Security']){
    assert.equal(html.split('id="asteriaAccountTab'+id+'"').length-1,1);
    assert.equal(html.split('id="asteriaAccountPanel'+id+'"').length-1,1);
  }
  assert.doesNotMatch(html,/asteria-account-hub-actions/);
  assert.match(css,/background:linear-gradient\(to bottom,transparent,#7e9bad/);
  assert.match(css,/background:none!important;border:0!important/);
  assert.match(html,/data-asteria-account-action="logout" class="asteria-account-signout asteria-account-logout"/);
  for(const section of ['profile','appearance','security'])
    assert.match(html,new RegExp('data-asteria-account-section="'+section+'"'));
  assert.match(html,/data-asteria-account-page="friends"/);
  assert.match(html,/data-asteria-account-page="notifications"/);
});

test('Phase 1.1 sidebar switches content with keyboard support and resets on sign-out',()=>{
  const h=harness();h.load();
  assert.equal(h.api.open('account'),true);
  assert.equal(h.elements.asteriaAccountPanelProfile.hidden,false);
  assert.equal(h.elements.asteriaAccountPanelSecurity.hidden,true);
  let prevented=false;
  h.domEvents.click({
    target:{closest:selector=>selector==='[data-asteria-account-section]'?
      {dataset:{asteriaAccountSection:'security'}}:null},
    preventDefault(){prevented=true;}
  });
  assert.equal(prevented,true);
  assert.equal(h.elements.asteriaAccountTabSecurity.attrs['aria-selected'],'true');
  assert.equal(h.elements.asteriaAccountPanelProfile.hidden,true);
  assert.equal(h.elements.asteriaAccountPanelSecurity.hidden,false);
  h.elements.asteriaAccountPage.events.keydown({
    target:{closest:selector=>selector==='[data-asteria-account-section]'?
      {dataset:{asteriaAccountSection:'security'}}:null},
    key:'Home',preventDefault(){}
  });
  assert.equal(h.elements.asteriaAccountPanelProfile.hidden,false);
  assert.equal(h.elements.asteriaAccountTabProfile.tabIndex,0);
  assert.ok(h.calls.includes('focus:asteriaAccountTabProfile'));
  h.signOut();
  assert.equal(h.api.isOpen('account'),false);
  assert.equal(h.elements.asteriaAccountPanelSecurity.hidden,true);
});

test('Unread header badge reports first-page data, clears on account switching and remains navigable',()=>{
  const src=read('js/asteria-account-header.js');
  assert.match(src,/notice\.hidden=false/);
  assert.match(src,/badge\.textContent=unread>99\?'99\+'/);
  assert.match(src,/version!==noticeVersion\|\|profileVersion!==requestVersion/);
  assert.match(src,/signedInUid\(\)!==uid/);
  assert.match(src,/asteriaHeaderUnreadCount/);
  assert.match(src,/latest page/);
});
