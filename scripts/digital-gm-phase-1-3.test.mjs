import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const nav=read('js/asteria-navigation.js');
const css=read('css/asteria-digital-gm-navigation.css');

test('Phase 1.3 follows approved seven-destination header order without duplicate navigation',()=>{
  const start=html.indexOf('<nav id="globalNavigation"');
  const end=html.indexOf('</nav>',start);
  const header=html.slice(start,end);
  const order=['asteriaHandbookTop','worldLoreTop','compendiumIndexButton',
    'characterForgeTop','campaignsTop','asteriaFriendsTop'];
  let last=-1;
  for(const id of order){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
    const next=header.indexOf('id="'+id+'"');
    assert.ok(next>last,id+' follows previous destination');
    last=next;
  }
  assert.match(header,/href="#\/compendium\?group=rules&amp;category=handbook"/);
  assert.match(header,/href="#\/compendium\?group=world"/);
  assert.match(header,/id="compendiumQuickToggle"/);
  assert.equal((html.match(/id="loginToggle"/g)||[]).length,1);
  assert.equal((html.match(/id="asteriaHeaderProfile"/g)||[]).length,1);
  assert.doesNotMatch(html,/id="accountQuickMenu"/);
});
test('Handbook and World links reuse source-backed library routing with no duplicate content',()=>{
  assert.match(nav,/const GROUPS = \[/);
  assert.match(nav,/\['handbook','handbook','Asteria Handbook'\]/);
  assert.match(nav,/\{id:'world',title:'World & Lore'/);
  assert.match(nav,/groupId=GROUPS\.some/);
  assert.match(nav,/categoryId=CATEGORIES\.some/);
  assert.match(nav,/window\.setView\?\.\('compendiumLibrary'\)/);
  assert.match(nav,/link\.getAttribute\('href'\)\.split\('\?'\)/);
  assert.doesNotMatch(nav,/getDocs\(|setDoc\(|httpsCallable\(/);
});
test('Selected header section reflects filtered library and existing Friends and Account views',()=>{
  for(const target of ["asteriaHandbookTop:libraryVisible&&categoryId==='handbook'",
    "worldLoreTop:libraryVisible&&groupId==='world'",
    "asteriaFriendsTop:visible('asteriaFriendsPage')",
    "loginToggle:visible('asteriaAccountPage')"])
    assert.ok(nav.includes(target),target);
  assert.match(nav,/button\.setAttribute\('aria-current',current\?'page':'false'\)/);
});
test('Desktop navigation fits one row; mobile uses the existing drawer and Account remains in header',()=>{
  assert.match(css,/@media \(min-width:1680px\)/);
  assert.match(css,/display:flex!important;/);
  assert.match(css,/flex:0 1 clamp\(135px,8vw,185px\)!important;/);
  assert.match(css,/@media \(max-width:1679px\)/);
  assert.match(css,/#mobileNavigationSlot #globalNavigation/);
  assert.match(nav,/mobileNavigationSlot'\)\?\.appendChild\(nav\)/);
  assert.match(nav,/desktopNavParent\?\.insertBefore\(nav,desktopAccountsParent\)/);
  assert.match(nav,/The Account control and profile remain accessible in the header/);
  assert.match(html,/id="settingsToggle"/);
  assert.match(html,/id="asteriaFriendsTop"[^>]*data-asteria-account-page="friends"/);
});
test('Phase 1.3 adds only versioned site navigation assets; leaves Account pages and backend untouched',()=>{
  assert.match(html,/css\/asteria-digital-gm-navigation\.css\?v=gm-toolkit-1-3/);
  assert.match(html,/js\/asteria-navigation\.js\?v=gm-toolkit-1-3/);
  assert.match(html,/js\/asteria-menu-buttons\.js\?v=gm-toolkit-1-3/);
  assert.match(html,/css\/asteria-account-pages\.css\?v=gm-toolkit-1-2/);
  assert.match(html,/id="asteriaAccountTabProfile"/);
  assert.match(html,/id="asteriaAccountPanelSecurity"/);
  assert.match(html,/id="asteriaAccountTabAppearance"/);
  assert.match(html,/id="asteriaFriendsPage"/);
  assert.match(html,/emailInvitationControls:false/);
});
