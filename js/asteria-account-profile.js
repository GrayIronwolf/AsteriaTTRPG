import { inspectAccountProfileDisplay } from '../src/state/accountProfileDisplay.mjs';
import {proposedAccountUsername} from '../src/state/accountProfileEdit.mjs';

// Authenticated account profile: presentation and server-authorized personal edits.
const get=id=>document.getElementById(id);
let requestVersion=0;
let activeUid='';
let verifiedId=null;
let returnFocus=null;
let lastProfile=null;
let editingBusy=false;
let avatarBusy=false;
const isOpen=()=>get('accountProfileOverlay')?.hidden===false;
function reset(){
  verifiedId=null;
  lastProfile=null;
  get('accountProfileEditForm').hidden=true;
  get('accountProfileUsernameEditForm').hidden=true;
  get('accountProfileChangeUsername').hidden=true;
  get('accountProfileEditStatus').textContent='';
  get('accountProfileAvatarFile').value='';
  const picture=get('accountProfileAvatar');
  picture.hidden=true;picture.removeAttribute('src');
  get('accountProfileAvatarFallback').textContent='A';
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
  lastProfile=null;
  const picture=get('accountProfileAvatar');
  if(picture){picture.hidden=true;picture.removeAttribute('src');}
  get('accountProfileEditForm').hidden=true;
  get('accountProfileUsernameEditForm').hidden=true;
  get('accountProfileEditStatus').textContent='';
  const overlay=get('accountProfileOverlay');
  if(overlay)overlay.hidden=true;
  get('accountProfileCopyId').disabled=true;
  get('accountProfileCopyStatus').textContent='';
  if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus();
  returnFocus=null;
}
function showResult(data){
  get('accountProfileName').textContent=data.name||'Not provided';
  get('accountProfileAvatarFallback').textContent=(data.username||'A').charAt(0).toUpperCase();
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
    lastProfile=read?.profile||null;
    showResult(profile);
    // Only show username editing after the dedicated backend callable exists.
    // This avoids publishing a button that would fail before its scoped release.
    const available=profile.status==='assigned'&&
      await window.AsteriaFirebase?.usernameEditingAvailable?.();
    if(version!==requestVersion||!isOpen()||window.AsteriaFirebase?.getUser?.()?.uid!==activeUid)return;
    get('accountProfileChangeUsername').hidden=!available;
    const url=await window.AsteriaFirebase?.readOwnAccountAvatar?.();
    if(version===requestVersion&&isOpen()&&window.AsteriaFirebase?.getUser?.()?.uid===activeUid){
      const image=get('accountProfileAvatar');
      if(typeof url==='string'&&url.startsWith('https://')){
        image.src=url;image.hidden=false;
        get('accountProfileAvatarFallback').hidden=true;
      } else{
        image.hidden=true;image.removeAttribute('src');
        get('accountProfileAvatarFallback').hidden=false;
      }
    }
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
function beginEdit(){
  if(!isOpen()||editingBusy||!lastProfile||window.AsteriaFirebase?.getUser?.()?.uid!==activeUid)return;
  get('accountProfileUsernameEditForm').hidden=true;
  get('accountProfileEditFirst').value=String(lastProfile.firstName||'');
  get('accountProfileEditLast').value=String(lastProfile.lastName||'');
  get('accountProfileEditForm').hidden=false;
  get('accountProfileEditStatus').textContent='';
  get('accountProfileEditFirst').focus();
}
function cancelEdit(){
  if(editingBusy)return;
  get('accountProfileEditForm').hidden=true;
  get('accountProfileEditStatus').textContent='';
  get('accountProfileEdit').focus();
}
function updateUsernamePreview(){
  const preview=get('accountProfileUsernamePreview');
  if(!preview)return;
  try{
    const candidate=proposedAccountUsername(get('accountProfileEditUsername').value,lastProfile?.accountNumber);
    preview.textContent='New public Account ID: '+candidate.accountId+'. Uniqueness is checked by the server when you confirm.';
  }catch(error){
    preview.textContent=error?.message||'Enter a valid username.';
  }
}
function beginUsernameEdit(){
  if(!isOpen()||editingBusy||get('accountProfileChangeUsername')?.hidden||
     !verifiedId||!lastProfile||window.AsteriaFirebase?.getUser?.()?.uid!==activeUid)return;
  get('accountProfileEditForm').hidden=true;
  get('accountProfileEditStatus').textContent='';
  get('accountProfileEditUsername').value=String(lastProfile.username||'');
  get('accountProfileUsernameEditForm').hidden=false;
  updateUsernamePreview();
  get('accountProfileEditUsername').focus();
}
function cancelUsernameEdit(){
  if(editingBusy)return;
  get('accountProfileUsernameEditForm').hidden=true;
  get('accountProfileEditStatus').textContent='';
  get('accountProfileChangeUsername').focus();
}
async function saveEdit(event){
  event?.preventDefault?.();
  const uid=activeUid,version=requestVersion;
  if(!isOpen()||editingBusy||window.AsteriaFirebase?.getUser?.()?.uid!==uid)return;
  editingBusy=true;
  get('accountProfileSave').disabled=true;
  get('accountProfileEditStatus').textContent='Saving your personal details…';
  try{
    const details={
      firstName:get('accountProfileEditFirst').value,
      lastName:get('accountProfileEditLast').value
    };
    await window.AsteriaFirebase.saveEditableAccountProfile(details);
    if(!isOpen()||uid!==activeUid||window.AsteriaFirebase?.getUser?.()?.uid!==uid)return;
    get('accountProfileEditForm').hidden=true;
    await refresh();
    if(isOpen()&&activeUid===uid)get('accountProfileEditStatus').textContent='Personal details saved.';
  }catch(error){
    if(isOpen()&&uid===activeUid&&version===requestVersion)
      get('accountProfileEditStatus').textContent=error?.message||'Could not save personal details.';
  }finally{
    editingBusy=false;
    get('accountProfileSave').disabled=false;
  }
}
async function saveUsername(event){
  event?.preventDefault?.();
  const uid=activeUid,version=requestVersion;
  if(!isOpen()||editingBusy||!verifiedId||!lastProfile||
     get('accountProfileUsernameEditForm').hidden||
     window.AsteriaFirebase?.getUser?.()?.uid!==uid)return;
  let candidate;
  try{
    candidate=proposedAccountUsername(get('accountProfileEditUsername').value,lastProfile.accountNumber);
  }catch(error){
    get('accountProfileEditStatus').textContent=error.message;
    return;
  }
  if(candidate.username===lastProfile.username){
    get('accountProfileEditStatus').textContent='Your username is already '+candidate.username+'.';
    return;
  }
  editingBusy=true;
  get('accountProfileUsernameSave').disabled=true;
  get('accountProfileEditStatus').textContent='Checking and reserving your new username…';
  try{
    const changed=await window.AsteriaFirebase.renameAccountUsername(candidate.username);
    if(!changed?.ok||changed.accountId!==candidate.accountId)
      throw new Error('Your new Account ID could not be verified. Refresh My Profile.');
    if(!isOpen()||uid!==activeUid||window.AsteriaFirebase?.getUser?.()?.uid!==uid)return;
    get('accountProfileUsernameEditForm').hidden=true;
    await refresh();
    if(isOpen()&&activeUid===uid)
      get('accountProfileEditStatus').textContent='Username updated. Your Account ID is now '+changed.accountId+'.';
  }catch(error){
    if(isOpen()&&uid===activeUid&&version===requestVersion)
      get('accountProfileEditStatus').textContent=error?.message||'Could not change your username.';
  }finally{
    editingBusy=false;
    get('accountProfileUsernameSave').disabled=false;
  }
}
async function changeAvatar(remove=false){
  const uid=activeUid,version=requestVersion;
  if(!isOpen()||avatarBusy||window.AsteriaFirebase?.getUser?.()?.uid!==uid)return;
  const file=get('accountProfileAvatarFile').files?.[0];
  if(!remove&&!file){get('accountProfileEditStatus').textContent='Choose a profile picture.';return;}
  avatarBusy=true;
  get('accountProfileAvatarUpload').disabled=true;
  get('accountProfileAvatarRemove').disabled=true;
  get('accountProfileEditStatus').textContent=remove?'Removing picture…':'Uploading picture…';
  try{
    if(remove)await window.AsteriaFirebase.removeOwnAccountAvatar();
    else await window.AsteriaFirebase.saveOwnAccountAvatar(file);
    if(!isOpen()||uid!==activeUid||window.AsteriaFirebase?.getUser?.()?.uid!==uid)return;
    get('accountProfileEditStatus').textContent=remove?'Profile picture removed.':'Profile picture updated.';
    await refresh();
  }catch(error){
    if(isOpen()&&uid===activeUid&&version===requestVersion)
      get('accountProfileEditStatus').textContent=error?.message||'Could not update your picture.';
  }finally{
    avatarBusy=false;
    get('accountProfileAvatarUpload').disabled=false;
    get('accountProfileAvatarRemove').disabled=false;
  }
}
function bind(){
  const overlay=get('accountProfileOverlay');
  if(!overlay)return;
  get('accountProfileClose')?.addEventListener('click',()=>close());
  get('accountProfileRefresh')?.addEventListener('click',refresh);
  get('accountProfileCopyId')?.addEventListener('click',copyId);
  get('accountProfileEdit')?.addEventListener('click',beginEdit);
  get('accountProfileChangeUsername')?.addEventListener('click',beginUsernameEdit);
  get('accountProfileEditUsername')?.addEventListener('input',updateUsernamePreview);
  get('accountProfileUsernameCancel')?.addEventListener('click',cancelUsernameEdit);
  get('accountProfileUsernameEditForm')?.addEventListener('submit',saveUsername);
  get('accountProfileCancel')?.addEventListener('click',cancelEdit);
  get('accountProfileEditForm')?.addEventListener('submit',saveEdit);
  get('accountProfileAvatarUpload')?.addEventListener('click',()=>{void changeAvatar(false);});
  get('accountProfileAvatarRemove')?.addEventListener('click',()=>{void changeAvatar(true);});
  window.addEventListener('asteria:account-profile-updated',()=>{if(isOpen())void refresh();});
  overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key!=='Tab')return;
    const items=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(item=>item.getClientRects().length);
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
