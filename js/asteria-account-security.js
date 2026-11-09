/* Phase 3.3 — authenticated account security navigation.
 * Uses Firebase Auth's existing password reset flow. Never asks for passwords. */
(function(){
  'use strict';
  const get=id=>document.getElementById(id);
  let activeUid='',requestBusy=false,resetSent=false,returnFocus=null;

  const currentUser=()=>window.AsteriaFirebase?.getUser?.() || null;
  const visible=()=>get('accountSecurityOverlay')?.hidden===false;
  const matchingUser=()=>Boolean(activeUid && currentUser()?.uid===activeUid &&
    window.AsteriaAuthBridge?.isLoggedIn?.());
  function close({restoreFocus=true}={}){
    const overlay=get('accountSecurityOverlay');
    if(overlay)overlay.hidden=true;
    activeUid='';requestBusy=false;resetSent=false;
    if(get('accountSecurityEmail'))get('accountSecurityEmail').textContent='—';
    if(get('accountSecurityStatus'))get('accountSecurityStatus').textContent='';
    if(get('accountSecuritySendReset'))get('accountSecuritySendReset').disabled=true;
    if(restoreFocus && returnFocus?.isConnected)returnFocus.focus();
    returnFocus=null;
  }
  function open(){
    const user=currentUser();
    if(!user?.uid||!window.AsteriaAuthBridge?.isLoggedIn?.())return false;
    const overlay=get('accountSecurityOverlay');
    if(!overlay)return false;
    if(visible())close({restoreFocus:false});
    returnFocus=document.activeElement;
    activeUid=user.uid;requestBusy=false;resetSent=false;
    get('accountSecurityEmail').textContent=user.email || 'No email on this account';
    get('accountSecuritySendReset').disabled=!user.email;
    get('accountSecurityStatus').textContent=user.email?
      'Use the button below to request a reset link for your account email.':
      'Password recovery requires an email address on your Firebase account.';
    overlay.hidden=false;
    get('accountSecurityClose')?.focus();
    return true;
  }
  async function sendReset(){
    if(!visible()||!matchingUser()||requestBusy||resetSent)return false;
    const uid=activeUid;
    const api=window.AsteriaFirebase;
    if(typeof api?.sendAccountPasswordReset!=='function'){
      get('accountSecurityStatus').textContent='Password reset is unavailable. Try again later.';
      return false;
    }
    requestBusy=true;
    get('accountSecuritySendReset').disabled=true;
    get('accountSecurityStatus').textContent='Requesting a password reset email…';
    try{
      await api.sendAccountPasswordReset();
      if(!visible()||!matchingUser()||activeUid!==uid)return false;
      resetSent=true;
      get('accountSecurityStatus').textContent='Password reset email requested. Check your inbox and spam folder.';
      return true;
    }catch{
      if(visible()&&matchingUser()&&activeUid===uid)
        get('accountSecurityStatus').textContent='Unable to send the reset email. Please try again later.';
      return false;
    }finally{
      requestBusy=false;
      if(visible()&&matchingUser()&&activeUid===uid)
        get('accountSecuritySendReset').disabled=resetSent;
    }
  }
  function bind(){
    const overlay=get('accountSecurityOverlay');
    if(!overlay)return;
    get('accountSecurityClose')?.addEventListener('click',()=>close());
    get('accountSecuritySendReset')?.addEventListener('click',()=>{void sendReset();});
    overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key!=='Tab')return;
      const focusable=[...overlay.querySelectorAll('button:not(:disabled)')]
        .filter(el=>el.getClientRects().length);
      if(!focusable.length)return;
      const first=focusable[0],last=focusable.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    window.addEventListener('asteria:firebase-signed-out',()=>close({restoreFocus:false}));
    const accountChanged=()=>{
      if(visible()&&!matchingUser())close({restoreFocus:false});
    };
    window.addEventListener('asteria:auth-changed',accountChanged);
    window.addEventListener('asteria:firebase-ready',accountChanged);
  }
  window.AsteriaAccountSecurity=Object.freeze({open,close,sendReset,isOpen:visible});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();