import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function harness({enabled=true}={}){
 let uid='alice',open=true,respond,hold=false;
 const events={},elements={},mutations=[],listCalls=[];
 function node(id){
   return {id,hidden:true,disabled:false,textContent:'',isConnected:true,
     children:[],handlers:{},attributes:{},dataset:{},
     addEventListener(k,fn){this.handlers[k]=fn;},
     setAttribute(k,v){this.attributes[k]=v;},
     appendChild(n){this.children.push(n);},
     append(...v){this.children.push(...v);},
     replaceChildren(){this.children=[];},
     querySelectorAll(){return [];},
     focus(){document.activeElement=this;}
   };
 }
 const ids=['accountFriendsBlockedList','accountFriendsBlockedRefresh',
 'accountFriendsBlockedMore','accountFriendsBlockedStatus','accountFriendsBlock',
 'accountFriendsAcceptedList','accountFriendsManageConfirm',
 'accountFriendsManageTitle','accountFriendsManageMessage',
 'accountFriendsManageApprove','accountFriendsManageCancel'];
 ids.forEach(id=>elements[id]=node(id));
 const document={readyState:'complete',activeElement:elements.accountFriendsBlock,
   getElementById:id=>elements[id]||null,
   createElement:tag=>node(tag),addEventListener(){}};
 const window={
  AsteriaFeatureFlags:{friendRequestsEnabled:enabled},
  AsteriaAuthBridge:{isLoggedIn:()=>Boolean(uid)},
  AsteriaFriends:{isOpen:()=>open},
  AsteriaFirebase:{
    isReady:()=>true,getUser:()=>uid?{uid}:null,
    listBlockedFriends:async(cursor)=>{listCalls.push({uid,cursor});
      if(hold)return await new Promise(r=>{respond=r;});
      return {items:[],nextCursor:null};
    },
    manageFriendRelationship:async(action,target,version)=>{
      mutations.push({uid,action,target,version});
      return {ok:true,status:action==='block'?'blocked':'removed',version:3};
    }
  },
  AsteriaAcceptedFriends:{refresh:async()=>true},
  addEventListener:(name,cb)=>events[name]=cb
 };
 vm.runInNewContext(read('js/asteria-friend-management.js'),{window,document});
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 return {window,document,elements,events,mutations,listCalls,tick,
   api:window.AsteriaFriendManagement,
   setUid:id=>{uid=id;events['asteria:auth-changed']();},
   defer:()=>{hold=true;return data=>respond(data);},
   close:()=>{open=false;window.AsteriaFriendManagement.onClose();}
 };
}
test('all management UI controls exist with explicit confirmation and disabled defaults',()=>{
 const html=read('index.html'),css=read('css/asteria-account-friends.css');
 for(const id of ['accountFriendsBlockedList','accountFriendsBlockedRefresh',
 'accountFriendsBlockedMore','accountFriendsBlockedStatus','accountFriendsBlock',
 'accountFriendsManageConfirm','accountFriendsManageTitle',
 'accountFriendsManageMessage','accountFriendsManageApprove',
 'accountFriendsManageCancel'])
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html,/role="alertdialog"/);
 assert.match(html,/aria-modal="true"/);
 assert.match(html,/asteria-friend-management\.js\?v=friends-phase3-2/);
 assert.match(css,/asteria-friend-manage-actions/);
 assert.doesNotMatch(html,/friendRequestsEnabled:true/);
});
test('disabled functionality cannot display live controls or submit mutations',async()=>{
 const h=harness({enabled:false});h.api.onOpen();await h.tick();
 h.api.setCandidate('Poppa_J#52816');
 assert.equal(h.elements.accountFriendsBlock.disabled,true);
 assert.equal(h.elements.accountFriendsBlockedRefresh.disabled,true);
 assert.equal(h.listCalls.length,0);
 assert.equal(h.mutations.length,0);
});
test('blocking exact searched account requires confirmation; Cancel does not mutate',async()=>{
 const h=harness();h.api.onOpen();await h.tick();
 h.api.setCandidate('Poppa_J#52816');
 assert.equal(h.elements.accountFriendsBlock.hidden,false);
 h.elements.accountFriendsBlock.handlers.click();
 assert.equal(h.elements.accountFriendsManageConfirm.hidden,false);
 assert.match(h.elements.accountFriendsManageMessage.textContent,/Poppa_J#52816/);
 h.elements.accountFriendsManageCancel.handlers.click();
 assert.equal(h.elements.accountFriendsManageConfirm.hidden,true);
 assert.equal(h.mutations.length,0);
 h.elements.accountFriendsBlock.handlers.click();
 h.elements.accountFriendsManageApprove.handlers.click();
 await h.tick();await h.tick();
 assert.deepEqual(h.mutations.map(x=>({action:x.action,id:x.target})),
  [{action:'block',id:'Poppa_J#52816'}]);
});
test('accepted friend controls use revision and require approval',async()=>{
 const h=harness();h.api.onOpen();await h.tick();
 const card=h.document.createElement('article');
 h.api.decorateFriendCard(card,{username:'Poppa_J',accountId:'Poppa_J#52816',
   friendsSinceMs:1,version:2});
 assert.equal(card.children.length,1);
 const group=card.children[0];
 assert.equal(group.children.length,2);
 group.children[0].handlers.click();
 assert.match(h.elements.accountFriendsManageMessage.textContent,/Remove/);
 h.elements.accountFriendsManageApprove.handlers.click();
 await h.tick();await h.tick();
 assert.deepEqual(h.mutations.map(x=>({action:x.action,version:x.version})),
  [{action:'remove',version:2}]);
});
test('sign-out invalidates delayed blocked listing and clears private results',async()=>{
 const h=harness(),resolve=h.defer();h.api.onOpen();await h.tick();
 h.setUid('bob');
 resolve({items:[{username:'Private',accountId:'Private#01234',
  blockedAtMs:1000,version:2}],nextCursor:null});
 await h.tick();
 assert.equal(h.elements.accountFriendsBlockedList.children.length,0);
 assert.equal(h.elements.accountFriendsBlockedStatus.textContent,'');
 assert.equal(h.elements.accountFriendsBlockedRefresh.disabled,true);
});
test('no direct Firestore permission or unsafe HTML insertion',()=>{
 const source=read('js/asteria-friend-management.js');
 const bridge=read('js/firebase-auth.js');
 const server=read('functions/friendRequestInbox.mjs');
 assert.doesNotMatch(source,/getDoc\(|getDocs\(|setDoc\(|localStorage|innerHTML|sessionStorage/);
 assert.match(source,/name\.textContent=entry\.username/);
 assert.match(source,/handle\.textContent=entry\.accountId/);
 assert.match(bridge,/manageFriendRelationship: async function/);
 assert.match(bridge,/listBlockedFriends: async function/);
 assert.match(server,/record\.blockedByUids\.includes\(actorUid\)/);
 assert.match(server,/nextFriendInboxQuota/);
});
