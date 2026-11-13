import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function harness({enabled=true,requestError=null}={}){
  const nodes={},events={};
  let uid='alice',isOpen=true,deferred=null;
  const calls=[],changes=[];
  function element(id){
    return {
      id,children:[],handlers:{},attributes:{},hidden:true,disabled:false,
      textContent:'',dataset:{},isConnected:true,
      addEventListener(name,callback){this.handlers[name]=callback;},
      setAttribute(key,value){this.attributes[key]=value;},
      appendChild(child){this.children.push(child);},
      append(...children){this.children.push(...children);},
      replaceChildren(){this.children=[];},
      querySelectorAll(selector){
        if(selector!=='button')return [];
        return this.children.flatMap(item=>
          (item.children||[]).flatMap(part=>(part.children||[])
            .filter(child=>child.type==='button')));
      }
    };
  }
  for(const id of ['accountFriendsSend','accountFriendsStatus','accountFriendsRequestsStatus',
    'accountFriendsIncomingTab','accountFriendsOutgoingTab',
    'accountFriendsRequestsRefresh','accountFriendsRequestList',
    'accountFriendsRequestsMore'])nodes[id]=element(id);
  const document={
    readyState:'complete',getElementById:id=>nodes[id]||null,
    createElement:tag=>{let e=element(tag);if(tag==='button')e.type='button';return e;},
    addEventListener(){}
  };
  const window={
    AsteriaFeatureFlags:{friendRequestsEnabled:enabled},
    AsteriaAuthBridge:{isLoggedIn:()=>Boolean(uid)},
    AsteriaFriends:{isOpen:()=>isOpen},
    AsteriaFirebase:{
      isReady:()=>true,getUser:()=>uid?{uid}:null,
      listFriendRequests:async(direction,cursor)=>{
        calls.push({uid,direction,cursor});
        if(deferred)return await deferred.promise;
        return {items:[],nextCursor:null};
      },
      manageFriendRequest:async(action,accountId,version)=>{
        changes.push({uid,action,accountId,version});
        if(requestError)throw requestError;
        return {ok:true,status:action==='send'?'pending':'accepted',
          version:2,expiresAtMs:null};
      }
    },
    addEventListener(name,cb){events[name]=cb;}
  };
  vm.runInNewContext(read('js/asteria-friend-requests.js'),{window,document});
  const api=window.AsteriaFriendRequests;
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  return {api,window,nodes,events,calls,changes,tick,
    switchUid:x=>{uid=x;events['asteria:auth-changed']();},
    setOpen:x=>{isOpen=x;},
    defer(){
      let resolve;const promise=new Promise(r=>{resolve=r;});
      deferred={promise,resolve};return deferred;
    }
  };
}
test('request manager exists in the Friends dialog and is disabled by default for normal visitors',()=>{
  const html=read('index.html'),css=read('css/asteria-account-friends.css');
  for(const id of ['accountFriendsRequests','accountFriendsSend',
    'accountFriendsRequestsStatus','accountFriendsIncomingTab',
    'accountFriendsOutgoingTab','accountFriendsRequestsRefresh',
    'accountFriendsRequestList','accountFriendsRequestsMore'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.match(html,/friendRequestsEnabled:true/);
  assert.doesNotMatch(html,/friendRequestsEnabled:new URLSearchParams/);
  assert.match(html,/role="tablist"/);
  assert.match(html,/role="tabpanel"/);
  assert.match(html,/asteria-friend-requests\.js\?v=friends-send-20261113/);
  const resultAt=html.indexOf('id="accountFriendsResult"');
  const sendAt=html.indexOf('id="accountFriendsSend"');
  const tabsAt=html.indexOf('id="accountFriendsWorkspaceTabs"');
  assert.ok(resultAt>=0&&resultAt<sendAt&&sendAt<tabsAt,
    'Send Friend Request must remain visible with the found player, outside the Requests tab');
  assert.match(css,/\.asteria-friends-result-actions/);
  assert.match(css,/@media\(max-width:600px\)/);
});
test('disabled feature never calls private lookup or request backend',async()=>{
  const h=harness({enabled:false});h.api.onOpen();await h.tick();
  h.api.setCandidate('Asteria#00009');
  assert.equal(h.nodes.accountFriendsSend.disabled,true);
  assert.equal(h.nodes.accountFriendsIncomingTab.disabled,true);
  assert.equal(h.calls.length,0);
  h.nodes.accountFriendsSend.handlers.click();
  await h.tick();
  assert.equal(h.changes.length,0);
});
test('enabled account fetches one incoming page and changes tab to outgoing',async()=>{
  const h=harness();h.api.onOpen();await h.tick();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].direction,'incoming');
  h.nodes.accountFriendsOutgoingTab.handlers.click();
  await h.tick();
  assert.equal(h.calls.length,2);
  assert.equal(h.calls[1].direction,'outgoing');
  assert.equal(h.nodes.accountFriendsOutgoingTab.attributes['aria-selected'],'true');
});
test('sending a request uses selected exact Account ID and confirms the action beside the player',async()=>{
  const h=harness();h.api.onOpen();await h.tick();
  h.api.setCandidate('Grayson#01448');
  assert.equal(h.nodes.accountFriendsSend.hidden,false);
  h.nodes.accountFriendsSend.handlers.click();await h.tick();await h.tick();
  assert.deepEqual(h.changes.map(c=>({action:c.action,id:c.accountId})),
    [{action:'send',id:'Grayson#01448'}]);
  assert.equal(h.nodes.accountFriendsSend.hidden,false);
  assert.equal(h.nodes.accountFriendsSend.disabled,true);
  assert.equal(h.nodes.accountFriendsSend.textContent,'Friend Request Sent');
  assert.match(h.nodes.accountFriendsStatus.textContent,/Friend request sent/);
  h.nodes.accountFriendsSend.handlers.click();await h.tick();
  assert.equal(h.changes.length,1,'a successful send must not submit twice');
  h.api.setCandidate('Crow#16702');
  assert.equal(h.nodes.accountFriendsSend.disabled,false);
  assert.equal(h.nodes.accountFriendsSend.textContent,'Send Friend Request');
});
test('a failed send keeps the button available and shows an error with the search result',async()=>{
  const h=harness({requestError:{code:'functions/failed-precondition'}});
  h.api.onOpen();await h.tick();
  h.api.setCandidate('Crow#16702');
  h.nodes.accountFriendsSend.handlers.click();await h.tick();await h.tick();
  assert.equal(h.changes.length,1);
  assert.equal(h.nodes.accountFriendsSend.hidden,false);
  assert.equal(h.nodes.accountFriendsSend.disabled,false);
  assert.match(h.nodes.accountFriendsStatus.textContent,/could not be completed/);
  assert.doesNotMatch(h.nodes.accountFriendsStatus.textContent,/request sent/i);
});
test('session change rejects a delayed inbox response and clears all results',async()=>{
  const h=harness(),pending=h.defer();
  h.api.onOpen();await h.tick();
  assert.equal(h.calls.length,1);
  h.switchUid('bob');
  pending.resolve({items:[{
    username:'Asteria',accountId:'Asteria#00009',
    status:'pending',version:1,direction:'incoming',
    requestedAtMs:100,expiresAtMs:200
  }],nextCursor:null});
  await h.tick();
  assert.equal(h.nodes.accountFriendsRequestList.children.length,0);
  assert.equal(h.nodes.accountFriendsRequestsStatus.textContent,'');
  assert.equal(h.nodes.accountFriendsIncomingTab.disabled,true);
});
test('request controls avoid direct Firestore, unsafe HTML, private IDs or browser persistence',()=>{
  const ui=read('js/asteria-friend-requests.js');
  const bridge=read('js/firebase-auth.js');
  const backend=read('functions/index.mjs');
  assert.doesNotMatch(ui,/getDocs\(|getDoc\(|setDoc\(|updateDoc\(|localStorage|sessionStorage|innerHTML/);
  assert.match(ui,/\.textContent=row\.username/);
  assert.match(ui,/\.textContent=row\.accountId/);
  assert.match(ui,/requestVersion|state\.sequence/);
  assert.match(bridge,/manageFriendRequest: async function/);
  assert.match(bridge,/listFriendRequests: async function/);
  assert.match(bridge,/ownershipReadyUid!==uid/);
  assert.match(backend,/await import\('\.\/friendRequestInbox\.mjs'\)/);
  assert.match(backend,/ASTERIA_FRIEND_REQUESTS_ENABLED!=='1'/);
});
