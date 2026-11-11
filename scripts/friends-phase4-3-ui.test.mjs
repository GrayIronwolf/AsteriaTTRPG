import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/asteria-friend-notifications.js',import.meta.url),'utf8');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const notice=(id='a'.repeat(64))=>({
 notificationId:id,kind:'incoming-request',title:'Friend request',
 body:'Review your request',createdAt:'2026-11-11T06:00:00.000Z',readAt:null
});
function setup({enabled=true}={}){
 let uid='alice',ready=true,online=true,unread=1;
 const listeners={},requests=[],acks=[],responses=[];
 const queue=[];
 function element(tag){
  return {tag,children:[],handlers:{},attrs:{},textContent:'',disabled:false,
   hidden:false,isConnected:false,addEventListener(name,fn){this.handlers[name]=fn;},
   setAttribute(key,value){this.attrs[key]=value;},
   append(...items){this.children.push(...items);},
   replaceChildren(...items){this.children=[...items];},
   focus(){}
  };
 }
 const grid={children:[],prepend(child){
  child.isConnected=true;this.children.unshift(child);
 }};
 const api={
  isReady:()=>ready,
  getUser:()=>uid?{uid}:null,
  async listFriendNotifications(cursor){
   requests.push({uid,cursor});
   if(queue.length)return queue.shift().promise;
   return {notifications:[notice()],unreadShown:unread,nextCursor:null};
  },
  async markFriendNotificationRead(id){
   acks.push({uid,id});return {notificationId:id,readAt:'2026-11-11T06:01:00Z'};
  }
 };
 const root={
  document:{createElement:element},
  AsteriaFeatureFlags:{friendNotificationsEnabled:enabled},
  AsteriaFirebase:api,
  AsteriaAuthBridge:{isLoggedIn:()=>online},
  addEventListener(event,handler){listeners[event]=handler;},
  AsteriaFriends:{open:()=>true},
  AsteriaFriendsWorkspace:{select:()=>true},
  AsteriaAccountHeader:{refreshNotifications(){}}
 };
 vm.runInNewContext(source,{window:root});
 const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((done,fail)=>{resolve=done;reject=fail;});
  const obj={promise,resolve,reject};queue.push(obj);return obj;
 };
 function all(node,fn){
  const items=fn(node)?[node]:[];
  for(const child of node.children||[])items.push(...all(child,fn));
  return items;
 }
 return {
  root,grid,requests,acks,deferred,tick,
  render:()=>root.AsteriaFriendNotificationsUI.render(grid),
  buttons:label=>all(grid,x=>x.tag==='button'&&x.textContent===label),
  text:label=>all(grid,x=>x.textContent===label),
  items:()=>all(grid,x=>x.attrs?.role==='listitem'),
  events:listeners,
  signOut(){
   online=false;uid=null;listeners['asteria:firebase-signed-out']();
  },
  switchTo(next){
   uid=next;listeners['asteria:auth-changed']();
  },
  disable(){root.AsteriaFeatureFlags.friendNotificationsEnabled=false;},
  setReadCount(value){unread=value;}
 };
}
test('active session switch clears rendered private information immediately',async()=>{
 const h=setup();h.render();await tick();
 assert.equal(h.items().length,1);
 h.switchTo('bob');
 assert.equal(h.items().length,0);
 assert.equal(h.grid.children[0].hidden,true);
 assert.equal(h.text('Friend request').length,0);
 assert.equal(h.buttons('Mark as Read').length,0);
});
test('sign-out clears the private notification list and controls',async()=>{
 const h=setup();h.render();await tick();
 h.signOut();
 assert.equal(h.items().length,0);
 assert.equal(h.grid.children[0].hidden,true);
 assert.equal(h.buttons('Mark as Read').length,0);
});
test('late response cannot resurrect prior account notices even after switching back',async()=>{
 const h=setup(),pending=h.deferred();h.render();await tick();
 h.switchTo('bob');
 h.switchTo('alice');
 pending.resolve({notifications:[notice()],unreadShown:1,nextCursor:null});
 await tick();
 assert.equal(h.items().length,0);
 assert.equal(h.grid.children[0].hidden,true);
 assert.equal(h.requests.length,1);
});
test('rapid pagination rejects double clicks and refreshes from page one',async()=>{
 const h=setup();const first=h.deferred();
 h.render();await tick();
 assert.equal(h.buttons('Next')[0].disabled,true);
 first.resolve({notifications:[notice()],unreadShown:1,nextCursor:'b'.repeat(64)});
 await tick();
 const next=h.buttons('Next')[0];
 assert.equal(next.disabled,false);
 const second=h.deferred();
 next.handlers.click();
 next.handlers.click();
 await tick();
 assert.equal(h.requests.length,2);
 assert.equal(h.requests[1].cursor,'b'.repeat(64));
 second.resolve({notifications:[],unreadShown:0,nextCursor:null});
 await tick();
 assert.equal(h.items().length,0);
 h.buttons('Refresh Friend Notifications')[0].handlers.click();
 await tick();
 assert.equal(h.requests.at(-1).cursor,null);
});
test('bad cursor or backend rate limit preserves safe error without old notices',async()=>{
 const h=setup();h.render();await tick();
 const rejected=h.deferred();
 h.buttons('Refresh Friend Notifications')[0].handlers.click();
 await tick();
 rejected.reject({code:'functions/resource-exhausted'});
 await tick();
 assert.equal(h.items().length,0);
 assert.equal(h.text('Too many notification refreshes. Try again later.').length,1);
 assert.equal(h.buttons('Next')[0].disabled,true);
});
test('mobile controls and high contrast semantics are present without relying on artwork',()=>{
 const css=read('css/asteria-friend-notifications.css');
 const source=read('js/asteria-friend-notifications.js');
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/min-height:var\(--asteria-touch-target,44px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/is-unread/);
 assert.match(source,/setAttribute\('aria-busy'/);
 assert.match(source,/setAttribute\('aria-live','polite'\)/);
 assert.match(source,/setAttribute\('role','listitem'\)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|document\.cookie|innerHTML|eval\(/);
 assert.match(read('index.html'),/friendNotificationsEnabled:false/);
});
