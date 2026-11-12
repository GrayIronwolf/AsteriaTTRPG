import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const notice=(kind='incoming-request',readAt=null)=>({
  kind,title:'New friend request',body:'A private friend request was received.',
  readAt,createdAt:'2026-11-11T06:00:00.000Z',notificationId:'a'.repeat(64)
});
function harness({enabled=true,ready=true}={}){
  let uid='alice',attached=true,isReady=ready,loggedIn=true;
  const root={children:[],prepend(node){this.children.unshift(node);node.isConnected=true;}};
  const events={},calls=[],updates=[];
  let pending=null,markPending=null,open=true;
  function element(tag){
    const handlers={},attrs={};
    return {
      tag,handlers,attrs,children:[],textContent:'',disabled:false,
      isConnected:false,className:'',type:'',dataset:{},
      setAttribute(key,value){attrs[key]=value;},
      addEventListener(key,cb){handlers[key]=cb;},
      append(...children){this.children.push(...children);},
      replaceChildren(...children){this.children=[...children];},
      focus(){}
    };
  }
  const api={
    getUser:()=>uid?{uid}:null,
    isReady:()=>isReady,
    async listFriendNotifications(cursor){
      calls.push({uid,cursor});
      return pending?pending.promise:{notifications:[notice()],unreadShown:1,nextCursor:null};
    },
    async markFriendNotificationRead(id){
      updates.push({uid,id});
      return markPending?markPending.promise:{notificationId:id,readAt:'2026-11-11T06:01:00Z',alreadyRead:false};
    }
  };
  const window={
    document:{createElement:element},
    AsteriaFeatureFlags:{friendNotificationsEnabled:enabled},
    AsteriaFirebase:api,
    AsteriaAuthBridge:{isLoggedIn:()=>loggedIn},
    AsteriaAccountHeader:{refreshNotifications(){updates.push('refresh-header');}},
    AsteriaFriends:{open:()=>open},
    AsteriaFriendsWorkspace:{select:section=>updates.push({section})},
    addEventListener(name,fn){events[name]=fn;}
  };
  vm.runInNewContext(read('js/asteria-friend-notifications.js'),{window});
  function deferred(){
    let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
    return {promise,resolve,reject};
  }
  return {root,window,calls,updates,tick,
    render:()=>window.AsteriaFriendNotificationsUI.render(root),
    setUid:value=>{uid=value;},setReady:value=>{isReady=value;},
    setLoggedIn:value=>{loggedIn=value;},
    setEnabled:value=>{window.AsteriaFeatureFlags.friendNotificationsEnabled=value;},
    detach:()=>{root.children[0].isConnected=false;attached=false;},
    deferList:()=>{pending=deferred();return pending;},
    deferMark:()=>{markPending=deferred();return markPending;},
    clearList:()=>{pending=null;},
    setFriendsOpen:value=>{open=value;},
    get host(){return root.children[0];},
    find(node,fn){
      if(fn(node))return node;
      for(const child of node.children||[]){
        const found=this.find(child,fn);if(found)return found;
      }
      return null;
    },
    buttons(text){
      const found=[];
      function visit(node){
        if(node.tag==='button'&&node.textContent===text)found.push(node);
        for(const child of node.children||[])visit(child);
      }
      visit(root);return found;
    }
  };
}
test('gated feature does not query when disabled or unauthenticated',async()=>{
  for(const opts of [{enabled:false},{ready:false}]){
    const h=harness(opts);
    assert.equal(h.render(),false);
    assert.equal(h.calls.length,0);
  }
  const h=harness();h.setLoggedIn(false);
  assert.equal(h.render(),false);
});
test('renders only recipient-scoped private data, with separate campaign labels',async()=>{
  const h=harness();assert.equal(h.render(),true);await tick();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].uid,'alice');
  assert.equal(h.host.attrs['aria-label'],'Friend notifications');
  const labels=h.find(h.host,x=>x.attrs?.['aria-label']==='Your private friend notifications');
  assert.ok(labels);
  assert.equal(labels.children.length,1);
  assert.equal(h.buttons('Mark as Read').length,1);
  assert.equal(h.buttons('Open Friends').length,1);
  assert.equal(h.find(h.host,x=>x.textContent==='1 unread on this page')!==null,true);
});
test('navigate to correct Friends tab without broad profile lookups',async()=>{
  const h=harness();h.render();await tick();
  h.buttons('Open Friends')[0].handlers.click();
  assert.deepEqual(h.updates[0],{section:'requests'});
  h.setFriendsOpen(false);
  h.buttons('Open Friends')[0].handlers.click();
  assert.equal(h.updates.length,1);
});
test('read acknowledges only current account and refreshes page and header',async()=>{
  const h=harness();h.render();await tick();
  h.buttons('Mark as Read')[0].handlers.click();
  await tick();await tick();
  assert.equal(h.updates.some(x=>x==='refresh-header'),true);
  assert.equal(h.updates[0].uid,'alice');
  assert.equal(h.updates[0].id,'a'.repeat(64));
  assert.equal(h.calls.length,2);
});
test('delayed result is discarded after logout or account switch',async()=>{
  for(const kind of ['account','logout','detach']){
    const h=harness();const pending=h.deferList();
    h.render();await tick();
    if(kind==='account')h.setUid('bob');
    else if(kind==='logout')h.setLoggedIn(false);
    else h.detach();
    pending.resolve({notifications:[notice()],unreadShown:1,nextCursor:null});
    await tick();
    assert.equal(h.buttons('Mark as Read').length,0);
  }
});
test('delayed acknowledgement never causes a cross-account refresh',async()=>{
  const h=harness();h.render();await tick();
  const pending=h.deferMark();
  h.buttons('Mark as Read')[0].handlers.click();
  h.setUid('bob');
  pending.resolve({notificationId:'a'.repeat(64),readAt:'2026-11-11T06:01:00Z',alreadyRead:false});
  await tick();await tick();
  assert.equal(h.updates.some(x=>x==='refresh-header'),false);
  assert.equal(h.calls.length,1);
});
test('source keeps separate feature flags, no client Firestore calls and safe presentation',()=>{
  const js=read('js/asteria-friend-notifications.js');
  const auth=read('js/firebase-auth.js');
  const html=read('index.html');
  const workspace=read('js/clean-compendium.js');
  const css=read('css/asteria-friend-notifications.css');
  assert.match(js,/root\.AsteriaFeatureFlags\?\.friendNotificationsEnabled!==true/);
  assert.match(js,/root\.AsteriaFriendsWorkspace\?\.select/);
  assert.match(js,/host\.isConnected/);
  assert.doesNotMatch(js,/getDocs\(|getDoc\(|localStorage|sessionStorage|innerHTML|fetch\(/);
  assert.match(auth,/httpsCallable\(functionsClient,'asteriaFriendNotifications'\)/);
  assert.match(auth,/ownershipReadyUid!==uid/);
  assert.match(auth,/Account changed during friend notification/);
  assert.match(html,/friendNotificationsEnabled:true,serverCampaignUCN:false/);
  assert.match(html,/campaignNotifications:new URLSearchParams/);
  assert.match(html,/campaignFriendRecipients:new URLSearchParams/);
  assert.match(html,/campaignInAppCanary:new URLSearchParams/);
  assert.match(html,/accountIds:true/);
  assert.match(workspace,/window\.AsteriaFriendNotificationsUI\.render\(grid\)/);
  assert.match(workspace,/window\.AsteriaCampaignNotificationsUI\.render\(grid\)/);
  assert.match(workspace,/Friend notifications are not active yet/);
  assert.match(workspace,/Campaign notifications are not active yet/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(read('js/asteria-account-header.js'),/Promise\.allSettled\(reads\)/);
});
