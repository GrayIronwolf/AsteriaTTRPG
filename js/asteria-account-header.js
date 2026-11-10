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
  lastUid='';
  profileImageUrl='';
  const bar=byId('asteriaHeaderProfile');
  if(bar)bar.hidden=true;
  const avatar=byId('asteriaHeaderAvatar');
  if(avatar){avatar.hidden=true;avatar.removeAttribute('src');}
  for(const id of ['asteriaHeaderName','asteriaHeaderAccountId'])
    if(byId(id))byId(id).textContent='';
  if(byId('asteriaHeaderMail'))byId('asteriaHeaderMail').hidden=true;
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
    const preferred=typeof response.profile?.displayName==='string'
      ?response.profile.displayName.trim().slice(0,64):'';
    const name=preferred||verified.name||verified.username;
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
async function refreshNotifications(){
  const notice=byId('asteriaHeaderMail'),api=window.AsteriaFirebase;
  if(!notice)return;
  notice.hidden=true;
  if(window.AsteriaFeatureFlags?.campaignNotifications!==true||
    !api?.listCampaignNotifications||!api.getUser?.()?.uid)return;
  const uid=api.getUser().uid,version=requestVersion;
  try{
    const result=await api.listCampaignNotifications(null);
    if(version!==requestVersion||signedInUid()!==uid)return;
    const notices=Array.isArray(result?.notifications)?result.notifications:[];
    notice.hidden=!notices.some(item=>!item.readAt);
  }catch{notice.hidden=true;}
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
