import { inspectAccountProfileDisplay } from '../src/state/accountProfileDisplay.mjs';

// Read-only, authenticated account profile. Never writes to Firestore.
const get=id=>document.getElementById(id);
let requestVersion=0;
let activeUid='';
let verifiedId=null;
let returnFocus=null;
const isOpen=()=>get('accountProfileOverlay')?.hidden===false;
function reset(){
  verifiedId=null;
  get('accountProfileCopyId').disabled=true;
  get('accountProfileId').textContent='—';
  get('accountProfileName').textContent='—';
  get('accountProfileUsername').textContent='—';
  get('accountProfileEmail').textContent='—';
  get('accountProfileStatus').textContent='Loading your profile…';
  get('accountProfileCopyStatus').textContent='';
}
function close({restoreFocus=true}={}){
  requestVersion++;
  activeUid='';
  verifiedId=null;
  const overlay=get('accountProfileOverlay');
  if(overlay)overlay.hidden=true;
  get('accountProfileCopyId').disabled=true;
  get('accountProfileCopyStatus').textContent='';
  if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus();
  returnFocus=null;
}
function showResult(data){
  get('accountProfileName').textContent=data.name||'Not provided';
  get('accountProfileUsername').textContent=data.username||'Not provided';
  get('accountProfileEmail').textContent=data.email||'Not provided';
  verifiedId=data.status==='assigned'?data.accountId:null;
  get('accountProfileId').textContent=verifiedId||'Not assigned';
  get('accountProfileCopyId').disabled=!verifiedId;
  get('accountProfileStatus').textContent={
    assigned:'Verified Account ID',
    pending:'Your Account ID has not been assigned yet.',
    review:'Account ID information needs verification. Copying is disabled.',
    unavailable:'Your account profile could not be verified.'
  }[data.status]||'Your account profile could not be verified.';
}
async function refresh(){
  const version=++requestVersion;
  const user=window.AsteriaFirebase?.getUser?.();
  if(!isOpen()||!user?.uid||user.uid!==activeUid){close({restoreFocus:false});return;}
  reset();
  try{
    const read=await window.AsteriaFirebase?.readAccountProfileForDisplay?.();
    // Always reject stale reads after sign-out or account switching.
    if(version!==requestVersion||!isOpen()||window.AsteriaFirebase?.getUser?.()?.uid!==activeUid)return;
    const profile=inspectAccountProfileDisplay({uid:activeUid,authEmail:read?.authEmail,profile:read?.profile});
    showResult(profile);
  }catch{
    if(version===requestVersion&&isOpen()){
      showResult({status:'unavailable',name:'',username:'',email:'',accountId:null});
    }
  }
}
async function open(){
  const user=window.AsteriaFirebase?.getUser?.();
  if(!user?.uid)return false;
  if(isOpen())close({restoreFocus:false});
  activeUid=user.uid;
  returnFocus=document.activeElement;
  const overlay=get('accountProfileOverlay');
  if(!overlay)return false;
  overlay.hidden=false;
  get('accountProfileClose')?.focus();
  await refresh();
  return true;
}
async function copyId(){
  const uid=activeUid,version=requestVersion,id=verifiedId;
  if(!isOpen()||!id||window.AsteriaFirebase?.getUser?.()?.uid!==uid)return false;
  get('accountProfileCopyId').disabled=true;
  get('accountProfileCopyStatus').textContent='Verifying before copying…';
  try {
    const read=await window.AsteriaFirebase.readAccountProfileForDisplay();
    const fresh=inspectAccountProfileDisplay({uid,authEmail:read?.authEmail,profile:read?.profile});
    if(!isOpen()||uid!==activeUid||version!==requestVersion||
       window.AsteriaFirebase?.getUser?.()?.uid!==uid ||
       fresh.status!=='assigned'||fresh.accountId!==id) {
      if(version===requestVersion&&isOpen()){
        showResult({status:'review',name:'',username:'',email:'',accountId:null});
      }
      return false;
    }
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(id);
    if(isOpen()&&version===requestVersion&&uid===activeUid)
      get('accountProfileCopyStatus').textContent='Account ID copied.';
    return true;
  }catch {
    if(isOpen()&&version===requestVersion)
      get('accountProfileCopyStatus').textContent='Could not copy. Try again or select your ID.';
    return false;
  }finally {
    if(isOpen()&&version===requestVersion)
      get('accountProfileCopyId').disabled=!verifiedId;
  }
}
function bind(){
  const overlay=get('accountProfileOverlay');
  if(!overlay)return;
  get('accountProfileClose')?.addEventListener('click',()=>close());
  get('accountProfileRefresh')?.addEventListener('click',refresh);
  get('accountProfileCopyId')?.addEventListener('click',copyId);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key!=='Tab')return;
    const items=[...overlay.querySelectorAll('button:not(:disabled)')].filter(item=>item.getClientRects().length);
    if(!items.length)return;
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  window.addEventListener('asteria:firebase-signed-out',()=>close({restoreFocus:false}));
  window.addEventListener('asteria:auth-changed',()=>{
    if(isOpen()&&window.AsteriaFirebase?.getUser?.()?.uid!==activeUid)
      close({restoreFocus:false});
  });
  window.addEventListener('asteria:firebase-ready',()=>{
    if(isOpen()&&window.AsteriaFirebase?.getUser?.()?.uid!==activeUid)
      close({restoreFocus:false});
  });
}
window.AsteriaAccountProfile=Object.freeze({open,close,refresh,isOpen,copyId});
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
