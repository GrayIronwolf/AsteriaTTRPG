import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

function harness(){
 const nodes={},events={};
 let uid='alice',opened=true;
 function element(id){
   return {id,hidden:true,disabled:false,tabIndex:0,textContent:'',
     isConnected:true,handlers:{},attributes:{},children:[],
     addEventListener(type,fn){this.handlers[type]=fn;},
     setAttribute(name,value){this.attributes[name]=value;},
     focus(){document.activeElement=this;},
     replaceChildren(){this.children=[];},
     appendChild(child){this.children.push(child);}
   };
 }
 const ids=['accountFriendsPublicPreview','accountFriendsPublicPreviewTitle',
 'accountFriendsPublicPreviewInitial','accountFriendsPublicPreviewName',
 'accountFriendsPublicPreviewAccountId','accountFriendsPublicPreviewContext',
 'accountFriendsPublicPreviewClose','accountFriendsProfileFromSearch',
 'accountFriendsResult','accountFriendsResultName','accountFriendsResultId',
 'accountFriendsWorkspaceFriends','accountFriendsWorkspaceRequests',
 'accountFriendsWorkspaceBlocked','accountFriendsAccepted',
 'accountFriendsRequests','accountFriendsBlocked'];
 for(const id of ids)nodes[id]=element(id);
 nodes.accountFriendsResult.hidden=false;
 nodes.accountFriendsResultName.textContent='Grayson';
 nodes.accountFriendsResultId.textContent='Grayson#01448';
 const document={readyState:'complete',activeElement:null,
   getElementById:id=>nodes[id]||null,
   addEventListener(){}};
 const window={
   AsteriaFirebase:{getUser:()=>uid?{uid}:null},
   AsteriaAuthBridge:{isLoggedIn:()=>Boolean(uid)},
   AsteriaFriends:{isOpen:()=>opened},
   addEventListener:(name,cb)=>events[name]=cb
 };
 vm.runInNewContext(read('js/asteria-friends-workspace.js'),{window,document});
 return {window,document,nodes,events,
   changeUid(value){uid=value;events['asteria:auth-changed']();},
   close(){opened=false;window.AsteriaFriendsWorkspace.onClose();}
 };
}
test('workspace includes exactly three accessible tab panels and a public preview',()=>{
 const html=read('index.html');
 const parts=[
  'accountFriendsWorkspaceFriends','accountFriendsWorkspaceRequests',
  'accountFriendsWorkspaceBlocked','accountFriendsPublicPreview',
  'accountFriendsPublicPreviewName','accountFriendsPublicPreviewAccountId',
  'accountFriendsProfileFromSearch'
 ];
 for(const part of parts)
   assert.equal((html.match(new RegExp('id="'+part+'"','g'))||[]).length,1,part);
 assert.match(html,/role="tablist" aria-label="Friends sections"/);
 assert.match(html,/role="tabpanel" aria-labelledby="accountFriendsWorkspaceFriends"/);
 assert.match(html,/role="tabpanel" aria-labelledby="accountFriendsWorkspaceRequests" hidden/);
 assert.match(html,/role="tabpanel" aria-labelledby="accountFriendsWorkspaceBlocked" hidden/);
 assert.match(html,/asteria-friends-workspace\.js\?v=friends-phase3-3/);
 assert.match(html,/friendRequestsEnabled:true/);
 const css=read('css/asteria-account-friends.css');
 assert.match(css,/#accountFriendsPublicPreview\[hidden\]\{display:none!important\}/);
 assert.match(css,/@media\(max-width:480px\)/);
});
test('tabs are mutually exclusive and arrow, Home and End keyboard navigation works',()=>{
 const h=harness();h.window.AsteriaFriendsWorkspace.onOpen();
 assert.equal(h.nodes.accountFriendsAccepted.hidden,false);
 assert.equal(h.nodes.accountFriendsRequests.hidden,true);
 const tabs=h.nodes.accountFriendsWorkspaceFriends;
 let prevented=false;
 tabs.handlers.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
 assert.equal(prevented,true);
 assert.equal(h.nodes.accountFriendsAccepted.hidden,true);
 assert.equal(h.nodes.accountFriendsRequests.hidden,false);
 assert.equal(h.nodes.accountFriendsWorkspaceRequests.attributes['aria-selected'],'true');
 assert.equal(h.document.activeElement,h.nodes.accountFriendsWorkspaceRequests);
 h.nodes.accountFriendsWorkspaceRequests.handlers.keydown({
   key:'End',preventDefault(){}
 });
 assert.equal(h.nodes.accountFriendsBlocked.hidden,false);
 assert.equal(h.nodes.accountFriendsRequests.hidden,true);
 h.nodes.accountFriendsWorkspaceBlocked.handlers.keydown({
   key:'Home',preventDefault(){}
 });
 assert.equal(h.nodes.accountFriendsAccepted.hidden,false);
});
test('public preview uses exact public fields only and closes with Escape',()=>{
 const h=harness();h.window.AsteriaFriendsWorkspace.onOpen();
 h.nodes.accountFriendsProfileFromSearch.handlers.click();
 assert.equal(h.nodes.accountFriendsPublicPreview.hidden,false);
 assert.equal(h.nodes.accountFriendsPublicPreviewName.textContent,'Grayson');
 assert.equal(h.nodes.accountFriendsPublicPreviewAccountId.textContent,'Grayson#01448');
 assert.equal(h.nodes.accountFriendsPublicPreviewInitial.textContent,'G');
 let prevented=false,stopped=false;
 h.nodes.accountFriendsPublicPreview.handlers.keydown({
   key:'Escape',preventDefault(){prevented=true;},
   stopPropagation(){stopped=true;}
 });
 assert.equal(prevented,true);assert.equal(stopped,true);
 assert.equal(h.nodes.accountFriendsPublicPreview.hidden,true);
 assert.equal(h.nodes.accountFriendsPublicPreviewName.textContent,'');
 assert.equal(h.document.activeElement,h.nodes.accountFriendsProfileFromSearch);
});
test('invalid, stale and non-public profiles are rejected',()=>{
 const h=harness();h.window.AsteriaFriendsWorkspace.onOpen();
 const api=h.window.AsteriaFriendsWorkspace;
 assert.equal(api.preview({username:'A',accountId:'A#01448'}),false);
 assert.equal(api.preview({username:'Grayson',accountId:'Other#01448'}),false);
 assert.equal(api.preview({username:'Grayson',accountId:'Grayson#01448',
    uid:'private'}),true);
 assert.equal(h.nodes.accountFriendsPublicPreview.hidden,false);
 assert.equal(h.nodes.accountFriendsPublicPreviewName.textContent,'Grayson');
 assert.equal(h.nodes.accountFriendsPublicPreviewAccountId.textContent,'Grayson#01448');
 assert.equal(h.nodes.accountFriendsPublicPreview.textContent.includes('private'),false);
 h.changeUid('bob');
 assert.equal(h.nodes.accountFriendsPublicPreview.hidden,true);
 assert.equal(h.nodes.accountFriendsPublicPreviewName.textContent,'');
 assert.equal(api.preview({username:'Grayson',accountId:'Grayson#01448'}),false);
});
test('closing account clears all previews and restores default tab',()=>{
 const h=harness();const api=h.window.AsteriaFriendsWorkspace;
 api.onOpen();api.select('blocked');
 api.preview({username:'Grayson',accountId:'Grayson#01448'});
 h.close();
 assert.equal(h.nodes.accountFriendsBlocked.hidden,true);
 assert.equal(h.nodes.accountFriendsAccepted.hidden,false);
 assert.equal(h.nodes.accountFriendsPublicPreview.hidden,true);
 assert.equal(api.isActive(),false);
});
test('no extra backend, public avatar permissions or private profile reads',()=>{
 const ui=read('js/asteria-friends-workspace.js');
 const css=read('css/asteria-account-friends.css');
 assert.doesNotMatch(ui,/fetch\(|httpsCallable|firebase\/|getDoc\(|getDocs\(|innerHTML|localStorage|sessionStorage|imageUrl|avatarUrl/);
 assert.match(ui,/textContent=profile\.username/);
 assert.match(ui,/textContent=profile\.accountId/);
 assert.match(css,/asteria-friends-workspace-tabs/);
 const acc=read('js/asteria-accepted-friends.js');
 const req=read('js/asteria-friend-requests.js');
 assert.match(acc,/AsteriaFriendsWorkspace\?\.preview/);
 assert.match(req,/AsteriaFriendsWorkspace\?\.preview/);
});
test('confirmed block and unblock warning explains friendship loss and cooldown',()=>{
 const manage=read('js/asteria-friend-management.js');
 assert.match(manage,/Block '\+item\.accountId\+'\? This immediately ends your friendship/);
 assert.match(manage,/Unblocking will NOT restore the friendship/);
 assert.match(manage,/seven-day reconnection cooldown starts/);
 assert.match(manage,/If this is the final block, a seven-day reconnection cooldown begins now/);
 assert.match(manage,/el\('accountFriendsManageApprove'\)\?\.focus\(\)/);
 assert.match(manage,/if\(event\.key==='Escape'\)/);
 assert.match(manage,/hideConfirmation\(\);controls\(\)/);
});
