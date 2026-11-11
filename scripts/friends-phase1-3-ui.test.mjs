import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function harness({enabled=false}={}){
  const nodes={};
  const documentListeners={},windowListeners={};
  let uid='alice',signedIn=true,ready=true,response={found:true,username:'Asteria',accountId:'Asteria#00009'};
  let deferred=null,lookups=[];
  function element(id){
    const handlers={},attributes={};
    return {id,handlers,attributes,disabled:false,hidden:true,textContent:'',value:'',isConnected:true,
      focus(){this.focused=true;},
      addEventListener:(name,fn)=>{handlers[name]=fn;},
      getClientRects:()=>[{}],
      querySelectorAll:()=>[nodes.accountFriendsClose,nodes.accountFriendsAccountId,nodes.accountFriendsFind],
      setAttribute:(key,value)=>{attributes[key]=value;}
    };
  }
  const ids=['accountFriendsOverlay','accountFriendsClose','accountFriendsSearchForm',
    'accountFriendsAccountId','accountFriendsFind','accountFriendsStatus',
    'accountFriendsResult','accountFriendsResultName','accountFriendsResultId',
    'accountFriendsResultInitial'];
  for(const id of ids)nodes[id]=element(id);
  const document={readyState:'complete',activeElement:nodes.accountFriendsClose,
    getElementById:id=>nodes[id]||null,
    addEventListener:(name,fn)=>{documentListeners[name]=fn;}};
  const window={
    AsteriaFeatureFlags:{friendAccountLookup:enabled},
    AsteriaAuthBridge:{isLoggedIn:()=>signedIn},
    AsteriaFirebase:{
      getUser:()=>uid?{uid}:null,
      isReady:()=>ready,
      findFriendByAccountId:async(handle)=>{
        lookups.push(handle);
        return deferred?deferred.promise:response;
      }
    },
    addEventListener:(name,fn)=>{windowListeners[name]=fn;}
  };
  const context={document,window};
  vm.runInNewContext(read('js/asteria-account-friends.js'),context);
  const api=window.AsteriaFriends;
  const finish=()=>new Promise(resolve=>setImmediate(resolve));
  const submit=()=>nodes.accountFriendsSearchForm.handlers.submit({preventDefault(){}});
  return {api,nodes,lookups,windowListeners,finish,submit,
    enable:()=>{window.AsteriaFeatureFlags.friendAccountLookup=true;},
    setUser:x=>{uid=x;},
    signOut:()=>{uid='';signedIn=false;windowListeners['asteria:firebase-signed-out']();},
    setResponse:x=>{response=x;},
    defer:()=>{
      let resolve,reject;
      const promise=new Promise((a,b)=>{resolve=a;reject=b;});
      deferred={promise,resolve,reject};return deferred;
    }
  };
}
test('Friends Account menu and dialog are present exactly once, accessible and off by default',()=>{
  const html=read('index.html'),menu=read('js/asteria-account-menu.js'),css=read('css/asteria-account-friends.css');
  for(const id of ['accountMenuFriends','accountFriendsOverlay','accountFriendsClose',
    'accountFriendsSearchForm','accountFriendsAccountId','accountFriendsFind',
    'accountFriendsStatus','accountFriendsResult','accountFriendsResultInitial',
    'accountFriendsResultName','accountFriendsResultId'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.match(html,/friendAccountLookup:new URLSearchParams\(window\.location\.search\)\.get\('friends-lookup-canary'\)==='1'/);
  assert.doesNotMatch(html,/friendAccountLookup:true/);
  assert.match(html,/aria-modal="true" aria-labelledby="accountFriendsTitle"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(menu,/window\.AsteriaFriends\?\.open\?\.\(\)/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(html,/asteria-account-friends\.js\?v=friends-phase3-3/);
});
test('disabled search is inert but Friends workspace can be viewed',()=>{
  const h=harness();
  assert.equal(h.api.open(),true);
  assert.equal(h.nodes.accountFriendsFind.disabled,true);
  assert.equal(h.nodes.accountFriendsAccountId.disabled,true);
  assert.match(h.nodes.accountFriendsStatus.textContent,/not active yet/);
  h.nodes.accountFriendsAccountId.value='Asteria#00009';
  h.submit();
  assert.deepEqual(h.lookups,[]);
  assert.equal(h.nodes.accountFriendsResult.hidden,true);
  h.api.close();
  assert.equal(h.nodes.accountFriendsAccountId.value,'');
});
test('enabled lookup only accepts exact handle and returns minimal validated public data',async()=>{
  const h=harness({enabled:true});h.api.open();
  h.nodes.accountFriendsAccountId.value='wrong';
  h.submit();
  assert.equal(h.lookups.length,0);
  assert.match(h.nodes.accountFriendsStatus.textContent,/full Account ID/);
  h.nodes.accountFriendsAccountId.value='Asteria#00009';
  h.submit();await h.finish();
  assert.deepEqual(h.lookups,['Asteria#00009']);
  assert.equal(h.nodes.accountFriendsResult.hidden,false);
  assert.equal(h.nodes.accountFriendsResultName.textContent,'Asteria');
  assert.equal(h.nodes.accountFriendsResultId.textContent,'Asteria#00009');
  assert.equal(h.nodes.accountFriendsResultInitial.textContent,'A');
  assert.equal(h.nodes.accountFriendsFind.disabled,false);
});
test('valid no-match and malformed backend data never expose private identifiers',async()=>{
  const h=harness({enabled:true});h.api.open();
  h.setResponse({found:false});h.nodes.accountFriendsAccountId.value='Asteria#00009';
  h.submit();await h.finish();
  assert.equal(h.nodes.accountFriendsResult.hidden,true);
  assert.match(h.nodes.accountFriendsStatus.textContent,/No player found/);
  h.setResponse({found:true,username:'Asteria',accountId:'Mismatch#00009',uid:'bob'});
  h.submit();await h.finish();
  assert.equal(h.nodes.accountFriendsResult.hidden,true);
  assert.match(h.nodes.accountFriendsStatus.textContent,/could not be verified/);
});
test('sign-out, account switch and close revoke pending UI results',async()=>{
  for(const action of ['signout','switch','close']){
    const h=harness({enabled:true});h.api.open();
    const pending=h.defer();
    h.nodes.accountFriendsAccountId.value='Asteria#00009';
    h.submit();
    await h.finish();
    if(action==='signout')h.signOut();
    if(action==='switch'){h.setUser('bob');h.windowListeners['asteria:auth-changed']();}
    if(action==='close')h.api.close();
    pending.resolve({found:true,username:'Asteria',accountId:'Asteria#00009'});
    await h.finish();
    assert.equal(h.api.isOpen(),false,action);
    assert.equal(h.nodes.accountFriendsResult.hidden,true,action);
    assert.equal(h.nodes.accountFriendsResultId.textContent,'',action);
    assert.equal(h.nodes.accountFriendsAccountId.value,'',action);
  }
});
test('opening fresh account session never shows previous search response',async()=>{
  const h=harness({enabled:true});h.api.open();
  h.nodes.accountFriendsAccountId.value='Asteria#00009';
  h.submit();await h.finish();
  assert.equal(h.nodes.accountFriendsResult.hidden,false);
  h.setUser('bob');h.windowListeners['asteria:firebase-ready']();
  assert.equal(h.api.isOpen(),false);
  h.api.open();
  assert.equal(h.nodes.accountFriendsResult.hidden,true);
  assert.equal(h.nodes.accountFriendsAccountId.value,'');
});
test('search client bridge uses callable only and revalidates authenticated identity',()=>{
  const source=read('js/firebase-auth.js');
  const block=source.split('// Phase 1.3 — only the deployed, gated callable')[1]?.split('  listCampaignNotifications:')[0];
  assert.ok(block);
  assert.match(block,/auth\.currentUser\?\.uid!==uid/);
  assert.match(block,/ownershipReadyUid!==uid/);
  assert.match(block,/friendAccountLookup!==true/);
  assert.match(block,/httpsCallable\(functionsClient,'asteriaFriendAccountLookup'\)/);
  assert.match(block,/action:'find',accountId/);
  assert.doesNotMatch(block,/accountIdRegistry|accountIdAssignments|collection\(|getDocs\(|getDoc\(|localStorage|sessionStorage/);
  assert.match(block,/Object\.keys\(result\)\.sort\(\)\.join/);
  assert.doesNotMatch(read('index.html'),/friendAccountLookup:true/);
});
test('friends UI never includes friend write, invitation, storage or private profile read actions',()=>{
  const ui=read('js/asteria-account-friends.js');
  assert.doesNotMatch(ui,/setDoc\(|updateDoc\(|deleteDoc\(|getDoc\(|localStorage|sessionStorage|sendFriendRequest|campaignInvite|avatarUrl|email/);
  assert.match(ui,/textContent=result\.username/);
  assert.match(ui,/textContent=result\.accountId/);
  assert.match(ui,/asteria:firebase-signed-out/);
  assert.match(ui,/asteria:auth-changed/);
});
