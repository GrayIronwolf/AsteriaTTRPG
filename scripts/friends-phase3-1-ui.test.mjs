import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function harness({enabled=true}={}){
  const nodes={},events={};
  let uid='alice',open=true,deferred=null;
  const calls=[];
  function element(id){
    return {
      id,children:[],attributes:{},handlers:{},hidden:true,disabled:false,
      textContent:'',isConnected:true,
      addEventListener(name,fn){this.handlers[name]=fn;},
      setAttribute(key,value){this.attributes[key]=value;},
      appendChild(child){this.children.push(child);},
      append(...children){this.children.push(...children);},
      replaceChildren(){this.children=[];}
    };
  }
  for(const id of ['accountFriendsAccepted','accountFriendsAcceptedTitle',
    'accountFriendsAcceptedStatus','accountFriendsAcceptedList',
    'accountFriendsAcceptedRefresh','accountFriendsAcceptedMore'])
    nodes[id]=element(id);
  const document={readyState:'complete',
    getElementById:id=>nodes[id]||null,
    createElement:tag=>element(tag),addEventListener(){}};
  const window={
    AsteriaFeatureFlags:{friendRequestsEnabled:enabled},
    AsteriaAuthBridge:{isLoggedIn:()=>Boolean(uid)},
    AsteriaFriends:{isOpen:()=>open},
    AsteriaFirebase:{
      isReady:()=>true,getUser:()=>uid?{uid}:null,
      listAcceptedFriends:async(cursor)=>{
        calls.push({uid,cursor});
        if(deferred)return await deferred.promise;
        return {items:[],nextCursor:null};
      }
    },
    addEventListener(name,fn){events[name]=fn;}
  };
  vm.runInNewContext(read('js/asteria-accepted-friends.js'),
    {document,window});
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  return {window,nodes,calls,events,api:window.AsteriaAcceptedFriends,tick,
    setUid:value=>{uid=value;events['asteria:auth-changed']();},
    setOpen:value=>{open=value;},
    defer(){
      let resolve;
      const promise=new Promise(r=>{resolve=r;});
      deferred={promise,resolve};return deferred;
    }
  };
}
test('accepted list is present once, accessible and not enabled globally',()=>{
 const html=read('index.html');
 for(const id of ['accountFriendsAccepted','accountFriendsAcceptedTitle',
  'accountFriendsAcceptedStatus','accountFriendsAcceptedList',
  'accountFriendsAcceptedRefresh','accountFriendsAcceptedMore'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/id="accountFriendsAccepted"[^>]*aria-labelledby="accountFriendsWorkspaceFriends"/);
 assert.match(html,/asteria-accepted-friends\.js\?v=friends-phase3-3/);
 assert.doesNotMatch(html,/friendRequestsEnabled:true/);
 assert.match(read('css/asteria-account-friends.css'),/asteria-accepted-friend-card/);
 assert.match(read('js/asteria-account-friends.js'),/AsteriaAcceptedFriends\?\.onOpen/);
 assert.match(read('js/asteria-account-friends.js'),/AsteriaAcceptedFriends\?\.onClose/);
});
test('disabled manager does not read backend and keeps UI inert',async()=>{
 const h=harness({enabled:false});
 h.api.onOpen();await h.tick();
 assert.equal(h.calls.length,0);
 assert.equal(h.nodes.accountFriendsAcceptedRefresh.disabled,true);
 assert.match(h.nodes.accountFriendsAcceptedStatus.textContent,/not active/);
});
test('enabled list loads on open and accepts refresh',async()=>{
 const h=harness();h.api.onOpen();await h.tick();
 assert.deepEqual(h.calls.map(x=>x.cursor),[0]);
 h.nodes.accountFriendsAcceptedRefresh.handlers.click();
 await h.tick();
 assert.deepEqual(h.calls.map(x=>x.cursor),[0,0]);
});
test('sign out or account switch invalidates pending accepted friends results',async()=>{
 const h=harness(),pending=h.defer();h.api.onOpen();await h.tick();
 h.setUid('bob');
 pending.resolve({items:[{username:'Private',accountId:'Private#01234',
  friendsSinceMs:1000}],nextCursor:null});
 await h.tick();
 assert.equal(h.nodes.accountFriendsAcceptedList.children.length,0);
 assert.equal(h.nodes.accountFriendsAcceptedStatus.textContent,'');
 assert.equal(h.nodes.accountFriendsAcceptedRefresh.disabled,true);
});
test('only approved public attributes render via textContent, not HTML',()=>{
 const ui=read('js/asteria-accepted-friends.js');
 const bridge=read('js/firebase-auth.js');
 const backend=read('functions/friendRequestInbox.mjs');
 assert.doesNotMatch(ui,/getDocs\(|getDoc\(|setDoc\(|localStorage|sessionStorage|innerHTML/);
 assert.match(ui,/name\.textContent=friend\.username/);
 assert.match(ui,/handle\.textContent=friend\.accountId/);
 assert.match(bridge,/listAcceptedFriends: async function/);
 assert.match(bridge,/ownershipReadyUid!==uid/);
 assert.match(backend,/record\.status!=='accepted'/);
 assert.match(backend,/friendRequestInboxThrottle/);
 assert.doesNotMatch(read('index.html'),/friendRequestsEnabled:true/);
});
