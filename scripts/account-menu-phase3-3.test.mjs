import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(file,'utf8');

function securityHarness(){
  const nodes={};
  const listeners={},windowListeners={},calls=[];
  let uid='alice',email='alice@example.test',loggedIn=true,emailVerified=false;
  let shouldFailVerification=false;
  function make(id){
    const handlers={};
    const element={
      id,hidden:true,disabled:false,textContent:'',handlers,isConnected:true,
      focus(){this.focused=true;},
      addEventListener(name,callback){handlers[name]=callback;},
      getClientRects:()=>[{}],querySelectorAll:()=>[nodes.accountSecurityClose,nodes.accountSecuritySendReset,nodes.accountSecuritySendVerification,nodes.accountSecurityCheckVerification,nodes.accountSecurityFinishId]
    };
    return element;
  }
  for(const id of ['accountSecurityOverlay','accountSecurityClose',
    'accountSecurityEmail','accountSecurityStatus','accountSecuritySendReset',
    'accountSecuritySendVerification','accountSecurityCheckVerification',
    'accountSecurityFinishId','accountSecurityVerification'])nodes[id]=make(id);
  const window={
    AsteriaFeatureFlags:{accountIds:false,accountIdCanary:false},
    AsteriaFirebase:{getUser:()=>uid?{uid,email,emailVerified}:null,
      sendAccountPasswordReset:async()=>{calls.push('send');return {ok:true};},
      sendAccountVerificationEmail:async()=>{calls.push('verify-send');if(shouldFailVerification)throw Error('offline');return {sent:true};},
      refreshAccountEmailVerification:async()=>{calls.push('verify-refresh');return {verified:emailVerified};},
      completeNewAccountId:async()=>{calls.push('canary-finish');return {accountId:'alice#01416'};}},
    AsteriaAuthBridge:{isLoggedIn:()=>loggedIn},
    addEventListener:(name,cb)=>windowListeners[name]=cb
  };
  const document={readyState:'complete',activeElement:null,
    getElementById:id=>nodes[id]||null,
    addEventListener:(name,cb)=>listeners[name]=cb};
  vm.runInNewContext(read('js/asteria-account-security.js'),{window,document});
  return {api:window.AsteriaAccountSecurity,nodes,calls,windowListeners,
    setUser:(nextUid,nextEmail=email)=>{uid=nextUid;email=nextEmail;},
    setVerified:value=>{emailVerified=value;},
    setCanary:value=>{window.AsteriaFeatureFlags.accountIdCanary=value;},
    failVerification:value=>{shouldFailVerification=value;},
    signOut:()=>{loggedIn=false;uid='';windowListeners['asteria:firebase-signed-out']();}};
}
test('security modal requires authenticated account and never asks for a password',()=>{
  const h=securityHarness();
  assert.equal(h.api.open(),true);
  assert.equal(h.nodes.accountSecurityEmail.textContent,'alice@example.test');
  assert.equal(h.nodes.accountSecuritySendReset.disabled,false);
  h.signOut();
  assert.equal(h.api.isOpen(),false);
  assert.equal(h.nodes.accountSecurityEmail.textContent,'—');
  assert.equal(h.api.open(),false);
});
test('security sends password reset once, disables duplicates and keeps identity scoped',async()=>{
  const h=securityHarness();h.api.open();
  assert.equal(await h.api.sendReset(),true);
  assert.equal(h.calls.length,1);
  assert.equal(await h.api.sendReset(),false);
  assert.equal(h.calls.length,1);
  assert.equal(h.nodes.accountSecuritySendReset.disabled,true);
  h.api.close();
  assert.equal(h.nodes.accountSecurityEmail.textContent,'—');
});
test('account switches cancel security requests and old account email is cleared',()=>{
  const h=securityHarness();h.api.open();
  h.setUser('bob','bob@example.test');
  h.windowListeners['asteria:auth-changed']();
  assert.equal(h.api.isOpen(),false);
  assert.equal(h.nodes.accountSecurityEmail.textContent,'—');
});
test('new menu groups existing actions with notifications and security',()=>{
  const html=read('index.html');
  const menu=read('js/asteria-account-menu.js');
  const css=read('css/asteria-account-menu.css');
  for(const id of ['accountMenuProfile','accountMenuSettings','accountMenuNotifications',
    'accountMenuSecurity','accountMenuLogout','accountSecurityOverlay','accountSecuritySendReset']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.equal((html.match(/id="accountSettingsTop"/g)||[]).length,0);
  assert.match(html,/role="group" aria-label="Profile and preferences"/);
  assert.match(html,/role="group" aria-label="Updates"/);
  assert.match(html,/role="group" aria-label="Security"/);
  assert.match(menu,/window\.AsteriaWorkspace\?\.openDashboard\?\.\('settings'\)/);
  assert.match(menu,/window\.AsteriaWorkspace\?\.openNotifications\?\.\(\)/);
  assert.match(menu,/window\.AsteriaAccountSecurity\?\.open\?\.\(\)/);
  assert.match(menu,/window\.logout\?\.\(\)/);
  assert.match(css,/\.asteria-account-menu-group/);
});
test('notifications menu leads to account-scoped existing service, not placeholder',()=>{
  const workspace=read('js/clean-compendium.js');
  const ui=read('js/campaign-notifications-ui.js');
  const html=read('index.html');
  assert.match(workspace,/openNotifications:\(\) => openDashboard\('notifications'\)/);
  assert.match(workspace,/currentDashboardMode==='notifications'/);
  assert.match(workspace,/window\.AsteriaCampaignNotificationsUI\.render\(grid\)/);
  assert.match(workspace,/Campaign notifications are not active yet/);
  assert.match(workspace,/action:\(\) => openDashboard\('notifications'\)/);
  assert.match(ui,/root\.AsteriaFeatureFlags\?\.campaignNotifications!==true/);
  assert.match(html,/campaignNotifications:false,accountIds:true/);
});
test('password reset only targets current authenticated Firebase user',()=>{
  const firebase=read('js/firebase-auth.js');
  const security=read('js/asteria-account-security.js');
  assert.match(firebase,/sendAccountPasswordReset: async function\(\)/);
  assert.match(firebase,/auth\.currentUser\?\.uid!==user\.uid/);
  assert.match(firebase,/sendPasswordResetEmail\(auth,user\.email\)/);
  assert.match(security,/await api\.sendAccountPasswordReset\(\)/);
  assert.doesNotMatch(security,/password\s*=|localStorage|sessionStorage|sendPasswordResetEmail\(/);
});
test('existing account ID display and responsive controls remain unchanged',()=>{
  const html=read('index.html');
  const profile=read('js/asteria-account-profile.js');
  const css=read('css/asteria-account-security.css');
  assert.match(profile,/get\('accountProfileCopyId'\)\.disabled=!verifiedId/);
  assert.match(html,/id="accountProfileOverlay"/);
  assert.match(html,/accountIds:true/);
  assert.match(css,/@media \(max-width:600px\)/);
  assert.match(read('js/asteria-navigation.js'),/media\.addEventListener\('change',reflow\)/);
});

test('email verification controls are bound to the current signed-in account',async()=>{
  const h=securityHarness();
  h.api.open();
  assert.equal(h.nodes.accountSecuritySendVerification.disabled,false);
  assert.equal(h.nodes.accountSecurityFinishId.hidden,true);
  assert.equal(await h.api.sendVerification(),true);
  assert.equal(h.calls.filter(x=>x==='verify-send').length,1);
  assert.equal(await h.api.sendVerification(),false);
  assert.equal(h.calls.filter(x=>x==='verify-send').length,1);
  h.setVerified(true);
  assert.equal(await h.api.checkVerification(),true);
  assert.equal(h.nodes.accountSecuritySendVerification.disabled,true);
  assert.equal(h.nodes.accountSecurityVerification.textContent,'Email verified.');
  h.signOut();
  assert.equal(h.api.isOpen(),false);
  assert.equal(h.nodes.accountSecurityVerification.textContent,'');
});

test('canary completion stays hidden unless explicitly enabled by separate browser flag',async()=>{
  const h=securityHarness();h.api.open();h.setVerified(true);
  await h.api.checkVerification();
  assert.equal(h.nodes.accountSecurityFinishId.hidden,true);
  assert.equal(await h.api.finishAccountId(),false);
  h.setCanary(true);h.windowListeners['asteria:auth-changed']();
  assert.equal(h.nodes.accountSecurityFinishId.hidden,false);
  assert.equal(h.nodes.accountSecurityFinishId.disabled,false);
  assert.equal(await h.api.finishAccountId(),true);
  assert.equal(h.calls.includes('canary-finish'),true);
  assert.match(h.nodes.accountSecurityVerification.textContent,/assigned/);
});

test('email verification does not send or finish for a switched account',async()=>{
  const h=securityHarness();h.api.open();
  h.setUser('bob','bob@example.test');
  h.windowListeners['asteria:auth-changed']();
  assert.equal(h.api.isOpen(),false);
  assert.equal(await h.api.sendVerification(),false);
  assert.equal(h.calls.includes('verify-send'),false);
});
