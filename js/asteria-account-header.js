import {inspectAccountProfileDisplay} from '../src/state/accountProfileDisplay.mjs';

// Header identity is always derived from a fresh, authenticated Firestore read.
// Never infer permanent IDs from a cached username, UID or display name.
const byId=id=>document.getElementById(id);
let requestVersion=0;
let lastUid='';
let profileImageUrl='';
function signedInUid(){
  const api=window.AsteriaFirebase;
  const user=api?.getUser?.();
  return user?.uid&&window.AsteriaAuthBridge?.isLoggedIn?.()?user.uid:'';
}
function reset(){
  requestVersion++;
  noticeVersion++;
  lastUid='';
  profileImageUrl='';
  const bar=byId('asteriaHeaderProfile');
  if(bar)bar.hidden=true;
  const avatar=byId('asteriaHeaderAvatar');
  if(avatar){avatar.hidden=true;avatar.removeAttribute('src');}
  for(const id of ['asteriaHeaderName','asteriaHeaderAccountId'])
    if(byId(id))byId(id).textContent='';
  if(byId('asteriaHeaderMail')){
    byId('asteriaHeaderMail').hidden=true;
    byId('asteriaHeaderMail').classList.remove('has-unread');
  }
  if(byId('asteriaHeaderUnreadCount')){
    byId('asteriaHeaderUnreadCount').hidden=true;
    byId('asteriaHeaderUnreadCount').textContent='';
  }
}
async function refresh(){
  const uid=signedInUid(),version=++requestVersion;
  if(!uid){reset();return;}
  lastUid=uid;
  const api=window.AsteriaFirebase;
  const bar=byId('asteriaHeaderProfile');
  if(!bar)return;
  bar.hidden=false;
  bar.classList.remove('asteria-header-arriving');
  if(byId('asteriaHeaderName'))byId('asteriaHeaderName').textContent='Loading profile';
  if(byId('asteriaHeaderAccountId'))byId('asteriaHeaderAccountId').textContent='';
  try{
    const response=await api.readAccountProfileForDisplay();
    if(version!==requestVersion||signedInUid()!==uid||response?.uid!==uid)return;
    const verified=inspectAccountProfileDisplay({
      uid,authEmail:response.authEmail,profile:response.profile
    });
    if(verified.status==='unavailable')throw Error('Unverified account profile.');
    // One canonical public name: the registered username that owns #00000.
    // The editable personal name does not replace the verified account handle.
    const name=verified.username;
    byId('asteriaHeaderName').textContent=name;
    byId('asteriaHeaderAccountId').textContent=
      verified.status==='assigned'?verified.accountId:'Account ID pending';
    byId('asteriaHeaderAvatarFallback').textContent=(name||'A').charAt(0).toUpperCase();
    bar.classList.add('asteria-header-arriving');
    const avatar=await api.readOwnAccountAvatar?.();
    if(version!==requestVersion||signedInUid()!==uid)return;
    const img=byId('asteriaHeaderAvatar');
    if(img){
      if(typeof avatar==='string'&&avatar.startsWith('https://')){
        img.src=avatar;img.hidden=false;profileImageUrl=avatar;
      }else{
        img.hidden=true;img.removeAttribute('src');profileImageUrl='';
      }
    }
    void refreshNotifications();
  }catch{
    if(version===requestVersion&&signedInUid()===uid){
      byId('asteriaHeaderName').textContent='Account';
      byId('asteriaHeaderAccountId').textContent='Profile unavailable';
      byId('asteriaHeaderAvatar').hidden=true;
    }
  }
}
let noticeVersion=0;
async function refreshNotifications(){
  const notice=byId('asteriaHeaderMail'),api=window.AsteriaFirebase;
  const version=++noticeVersion;
  if(!notice)return;
  const badge=byId('asteriaHeaderUnreadCount');
  if(badge){badge.hidden=true;badge.textContent='';}
  notice.hidden=true;
  notice.classList.remove('has-unread');
  notice.setAttribute('aria-label','Open Notifications');
  const friendsEnabled=window.AsteriaFeatureFlags?.friendNotificationsEnabled===true;
  const campaignsEnabled=window.AsteriaFeatureFlags?.campaignNotifications===true;
  const uid=signedInUid();
  if(!uid||(!friendsEnabled&&!campaignsEnabled))return;
  // Inbox navigation stays available even when no messages are unread.
  notice.hidden=false;
  if(!api?.isReady?.())return;
  const profileVersion=requestVersion;
  const reads=[];
  if(friendsEnabled&&typeof api.listFriendNotifications==='function')
    reads.push(api.listFriendNotifications(null));
  if(campaignsEnabled&&typeof api.listCampaignNotifications==='function')
    reads.push(api.listCampaignNotifications(null));
  if(!reads.length)return;
  const results=await Promise.allSettled(reads);
  if(version!==noticeVersion||profileVersion!==requestVersion||
     signedInUid()!==uid)return;
  // Only first-page data is available from the private callables. This badge
  // reports messages on those pages, not a fabricated total across all pages.
  const unread=results.reduce((total,result)=>
    total+(result.status==='fulfilled'&&Array.isArray(result.value?.notifications)?
      result.value.notifications.filter(item=>item&&item.readAt==null).length:0),0);
  if(unread>0&&badge){
    badge.textContent=unread>99?'99+':String(unread);
    badge.hidden=false;
    notice.classList.add('has-unread');
    notice.setAttribute('aria-label','Open Notifications; '+unread+
      ' unread on the latest page'+(reads.length===1?'':'s'));
  }
}

function bind(){
  byId('asteriaHeaderAvatarButton')?.addEventListener('click',()=>{
    if(signedInUid())window.AsteriaAccountProfile?.open?.();
  });
  window.addEventListener('asteria:firebase-ready',()=>{void refresh();});
  window.addEventListener('asteria:account-profile-updated',()=>{void refresh();});
  window.addEventListener('asteria:account-id-assigned',()=>{void refresh();});
  window.addEventListener('asteria:firebase-signed-out',reset);
  window.addEventListener('asteria:auth-changed',()=>{
    if(signedInUid()!==lastUid){reset();void refresh();}
  });
  window.addEventListener('asteria:notifications-updated',()=>{void refreshNotifications();});
  if(signedInUid())void refresh();
}
window.AsteriaAccountHeader=Object.freeze({refresh,reset,refreshNotifications});
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
