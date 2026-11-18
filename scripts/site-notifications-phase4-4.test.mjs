import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 validateNotice,validateNotificationPage,validateNoticeAcknowledgement,
 notificationDestination,firstPageUnread
} from '../frontend/src/notifications/notificationContracts.mjs';
import {createFirebaseNotificationsService} from '../frontend/src/notifications/firebaseNotificationsService.mjs';
import {createNotificationPoller} from '../frontend/src/notifications/notificationPoller.mjs';
import {createAppServices,previewServices} from '../frontend/src/services/appServices.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const id='a'.repeat(64),otherId='b'.repeat(64);
const base={notificationId:id,kind:'incoming-request',title:'New friend request',
 body:'Review a friend request.',createdAt:'2026-11-18T08:00:00.000Z',readAt:null};
const campaign={...base,kind:'join-request',campaignId:'campaign-1',
 title:'Campaign join request',body:'A player has requested to join.'};

test('public notification projection strictly validates social and campaign payloads',()=>{
 assert.equal(validateNotice(base,'social').readAt,null);
 assert.equal(validateNotice(campaign,'campaign').campaignId,'campaign-1');
 assert.equal(validateNotice({...campaign,kind:'friend-invitation',inviteId:otherId},'campaign').inviteId,otherId);
 for(const key of ['email','recipientUid','token','pairId','memberUid']){
  assert.throws(()=>validateNotice({...base,[key]:'unsafe'},'social'),/Invalid/);
 }
 assert.throws(()=>validateNotice({...base,kind:'not-approved'},'social'),/Invalid/);
 assert.throws(()=>validateNotice({...campaign,kind:'friend-invitation'},'campaign'),/Invalid/);
 assert.throws(()=>validateNotice({...campaign,readAt:'bad'},'campaign'),/Invalid/);
 assert.throws(()=>validateNotice({...base,body:'bad\u0000text'},'social'),/Invalid/);
 assert.equal(notificationDestination('social','incoming-request'),'#/account/friends');
 assert.equal(notificationDestination('campaign','join-approved'),'#/campaign-forge');
 assert.equal(notificationDestination('campaign','friend-invitation'),null);
});

test('private pages validate opaque cursor, deduplication, and first-page counts',()=>{
 const result={notifications:[base],unreadShown:1,nextCursor:null};
 assert.equal(validateNotificationPage(result,'social').unreadShown,1);
 assert.throws(()=>validateNotificationPage({...result,unreadShown:2},'social'),/Invalid/);
 assert.throws(()=>validateNotificationPage({...result,notifications:[base,base],unreadShown:2},'social'),/Duplicate/);
 assert.throws(()=>validateNotificationPage({...result,nextCursor:'invalid'},'social'),/Invalid/);
 assert.throws(()=>validateNotificationPage({...result,nextCursor:otherId},'social'),/pagination/);
 const page=validateNotificationPage(result,'social');
 assert.equal(firstPageUnread({social:{page},campaign:{page:null}},['social','campaign']),1);
 assert.deepEqual(validateNoticeAcknowledgement(
  {notificationId:id,readAt:'2026-11-18T08:05:00.000Z',alreadyRead:false},id),
  {notificationId:id,readAt:'2026-11-18T08:05:00.000Z',alreadyRead:false});
 assert.throws(()=>validateNoticeAcknowledgement(
  {notificationId:id,readAt:'2026-11-18T08:05:00.000Z',alreadyRead:false,uid:'unsafe'},id),/Invalid/);
});

test('existing callable adapter is owner-bound and does not disclose private target identity',async()=>{
 const auth={currentUser:{uid:'owner'}},calls=[];
 let postpone=null;
 const sdk={httpsCallable(_functions,name){return async data=>{
  calls.push({name,data});
  if(postpone)return new Promise(resolve=>{postpone=resolve;});
  if(data.action==='mark-read')return {data:{notificationId:id,readAt:'2026-11-18T09:00:00Z',alreadyRead:false}};
  const row=name==='asteriaFriendNotifications'?base:campaign;
  return {data:{notifications:[row],unreadShown:1,nextCursor:null}};
 }}};
 const service=createFirebaseNotificationsService({auth,functions:{},functionsSdk:sdk,
  flags:{social:true,campaign:true}});
 assert.equal((await service.list('social')).unreadShown,1);
 assert.equal((await service.list('campaign')).unreadShown,1);
 assert.equal((await service.markRead('social',id)).alreadyRead,false);
 assert.deepEqual(calls.map(x=>x.name),[
  'asteriaFriendNotifications','asteriaCampaignNotifications','asteriaFriendNotifications']);
 assert.ok(calls.every(c=>!Object.hasOwn(c.data,'uid')&&!Object.hasOwn(c.data,'email')));
 postpone=true;
 const pending=service.list('social');
 await Promise.resolve();
 auth.currentUser={uid:'another-owner'};
 postpone({data:{notifications:[base],unreadShown:1,nextCursor:null}});
 await assert.rejects(pending,/Account changed/);
 auth.currentUser=null;
 await assert.rejects(service.list('social'),/Sign in/);
 const closed=createFirebaseNotificationsService({auth,functions:{},functionsSdk:sdk,
  flags:{social:false,campaign:false}});
 assert.equal(closed.availability().enabled,false);
 await assert.rejects(closed.list('social'),/disabled/);
});

function environment(){
 const handlers=new Map(),timers=new Map();
 let counter=0;
 const add=(type,fn)=>{const list=handlers.get(type)||new Set();list.add(fn);handlers.set(type,list);};
 const remove=(type,fn)=>handlers.get(type)?.delete(fn);
 return {
  document:{hidden:false,addEventListener:add,removeEventListener:remove},
  window:{addEventListener:add,removeEventListener:remove,
   setInterval:fn=>{timers.set(++counter,fn);return counter;},
   clearInterval:id=>{timers.delete(id);}},
  emit:type=>{for(const fn of handlers.get(type)||[])fn();},
  count:type=>handlers.get(type)?.size||0,
  timerCount:()=>timers.size
 };
}
test('shared foreground refresh discards old owner data and cleans listeners',async()=>{
 let uid='one',pending=null,requestCount=0;
 const env=environment(),emissions=[];
 const service={
  currentUid:()=>uid,availability:()=>({social:true,campaign:false}),
  list:()=>{requestCount++;return pending||Promise.resolve({notifications:[base],unreadShown:1,nextCursor:null});},
  markRead:async()=>({notificationId:id,readAt:'2026-11-18T09:00:00Z',alreadyRead:false})
 };
 const controller=createNotificationPoller({uid:'one',service,
  environment:env,publish:value=>emissions.push(value)});
 controller.start();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(controller.getSnapshot().unreadLatest,1);
 assert.equal(env.count('visibilitychange'),1);
 assert.equal(env.timerCount(),1);
 await controller.acknowledge('social',id);
 assert.equal(controller.getSnapshot().unreadLatest,0);
 controller.dispose();
 assert.equal(env.count('visibilitychange'),0);
 assert.equal(env.count('focus'),0);
 assert.equal(env.timerCount(),0);
 assert.equal(await controller.refresh(true),false);
 const deferred={};
 pending=new Promise(resolve=>{deferred.resolve=resolve;});
 const another=createNotificationPoller({uid:'one',service,
  environment:env,publish:value=>emissions.push(value)});
 another.start();
 await Promise.resolve();
 const count=emissions.length;
 uid='two';
 deferred.resolve({notifications:[base],unreadShown:1,nextCursor:null});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(emissions.length,count,'Old account result must never publish.');
 another.dispose();
 assert.ok(requestCount>=2);
});

test('Phase 4.4 routes and header remain opt-in with no separate Firebase client',()=>{
 assert.equal(canActivateRoute('notifications',previewServices),false);
 const onlyAuth=createAppServices({auth:{subscribe(){}}});
 assert.equal(canActivateRoute('notifications',onlyAuth),false);
 const full=createAppServices({auth:{subscribe(){}},notifications:{list(){}}});
 assert.equal(canActivateRoute('notifications',full),true);
 for(const route of ['dashboard','character-forge','campaign-forge','gm-dashboard','character-dashboard','invitation']){
  assert.equal(canActivateRoute(route,full),false);
 }
 const src=read('frontend/src/auth/firebaseAuthAdapter.mjs');
 assert.match(src,/createFirebaseNotificationsService/);
 assert.match(src,/VITE_ASTERIA_SOCIAL_NOTIFICATIONS_ENABLED/);
 assert.match(src,/VITE_ASTERIA_CAMPAIGN_NOTIFICATIONS_ENABLED/);
 assert.doesNotMatch(src,/window\.AsteriaFirebase/);
 const provider=read('frontend/src/notifications/NotificationsProvider.jsx');
 assert.match(provider,/createNotificationPoller/);
 const app=read('frontend/src/app/App.jsx');
 assert.match(app,/<NotificationsPage \/>/);
 const header=read('frontend/src/components/HeaderAccountControls.jsx');
 assert.match(header,/useNotifications\(\)/);
 assert.match(header,/site-header-unread/);
 const page=read('frontend/src/pages/NotificationsPage.jsx');
 assert.match(page,/site-notifications-page/);
 assert.doesNotMatch(page,/getDoc\(|getDocs\(|onSnapshot\(|localStorage|sessionStorage|dangerouslySetInnerHTML/);
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts['site:check'],/site-notifications-phase4-4\.test\.mjs/);
 assert.match(read('.github/workflows/site-foundation.yml'),/Phase 4\.4 Notifications/);
 assert.doesNotMatch(read('index.html'),/frontend\/src\/notifications/);
});
