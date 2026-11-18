import {firstPageUnread,notificationChannel,notificationId} from './notificationContracts.mjs';

const NO_FEED=Object.freeze({page:null,error:null});
export const EMPTY_NOTIFICATION_STATE=Object.freeze({
  social:NO_FEED,campaign:NO_FEED,loading:false,checkedAt:null,
  unreadLatest:0,hasData:false
});
const FAILURE='Notifications could not be refreshed. Check your connection.';

/**
 * Server-only callables do not support push subscriptions. Refresh at most once
 * per minute while visible, and on foreground return, with a bounded minimum
 * automatic gap. This single controller serves the Account header and inbox.
 * All timers/listeners are detached and all results are discarded on UID switch.
 */
export function createNotificationPoller({
 service,uid,publish,environment,intervalMs=60_000,minimumAutoGapMs=30_000
}) {
  if(!service || typeof service.list!=='function' ||
      typeof service.markRead!=='function' ||
      typeof service.currentUid!=='function' ||
      !uid || typeof publish!=='function' || !environment)
    throw new TypeError('Notification polling requires one authenticated owner.');
  const {document:doc,window:win}=environment;
  if(!doc || !win || typeof win.setInterval!=='function' ||
      typeof win.clearInterval!=='function' ||
      !Number.isSafeInteger(intervalMs)||intervalMs<10_000)
    throw new TypeError('Notification refresh requires browser event access.');
  const flags=service.availability();
  const channels=['social','campaign'].filter(key=>flags[key]);
  let disposed=false,running=false,inFlight=false,pendingForced=false;
  let lastStart=-Infinity,timer=null;
  let current={...EMPTY_NOTIFICATION_STATE};
  const owner=()=>!disposed && service.currentUid()===uid;
  const publishCurrent=next=>{
    if(!owner())return;
    current=Object.freeze({
      ...next,unreadLatest:firstPageUnread(next,channels),
      hasData:channels.some(channel=>Boolean(next[channel]?.page))
    });
    publish(current);
  };
  async function refresh(force=false) {
    if(!owner() || !channels.length || doc.hidden===true)return false;
    if(inFlight) {
      if(force)pendingForced=true;
      return false;
    }
    const now=Date.now();
    if(!force&&now-lastStart<minimumAutoGapMs)return false;
    lastStart=now;
    inFlight=true;
    publishCurrent({...current,loading:true});
    const results=await Promise.allSettled(channels.map(channel=>service.list(channel,null)));
    if(!owner()){inFlight=false;return false;}
    const next={...current,loading:false,checkedAt:Date.now()};
    channels.forEach((channel,index)=>{
      const result=results[index];
      next[channel]=result.status==='fulfilled'
        ? {page:result.value,error:null}
        : {page:null,error:result.reason?.code==='functions/resource-exhausted' ?
            'Notification refresh limit reached. Try again later.' : FAILURE};
    });
    inFlight=false;
    publishCurrent(next);
    if(pendingForced){
      pendingForced=false;
      // A read receipt may have arrived during an in-flight page request.
      void refresh(true);
    }
    return true;
  }
  function onForeground(){
    if(doc.hidden!==true)void refresh(false);
  }
  function start(){
    if(running||disposed)return;
    running=true;
    doc.addEventListener('visibilitychange',onForeground);
    win.addEventListener('focus',onForeground);
    timer=win.setInterval(()=>{void refresh(false);},intervalMs);
    void refresh(true);
  }
  async function acknowledge(channel,id) {
    notificationChannel(channel);notificationId(id);
    if(!channels.includes(channel)||!owner())
      throw new Error('Notification inbox is not available for this account.');
    const response=await service.markRead(channel,id);
    if(!owner())throw new Error('Account changed during notification update.');
    const feed=current[channel],page=feed.page;
    if(page){
      let changed=false;
      const rows=page.notifications.map(item=>{
        if(item.notificationId!==id||item.readAt!==null)return item;
        changed=true;
        return Object.freeze({...item,readAt:response.readAt});
      });
      if(changed)publishCurrent({...current,[channel]:{
        ...feed,page:Object.freeze({
          ...page,notifications:Object.freeze(rows),
          unreadShown:rows.filter(item=>item.readAt===null).length
        })
      }});
    }
    void refresh(true);
    return response;
  }
  function dispose(){
    if(disposed)return;
    disposed=true;pendingForced=false;running=false;
    if(timer!==null)win.clearInterval(timer);
    doc.removeEventListener('visibilitychange',onForeground);
    win.removeEventListener('focus',onForeground);
  }
  return Object.freeze({start,refresh,acknowledge,dispose,getSnapshot:()=>current});
}
