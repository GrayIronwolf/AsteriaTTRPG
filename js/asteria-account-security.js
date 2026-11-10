/* Phase 3.3 — authenticated account security navigation.
 * Uses Firebase Auth's existing password reset flow. Never asks for passwords. */
(function(){
  'use strict';
  const get=id=>document.getElementById(id);
  let activeUid='',requestBusy=false,resetSent=false,verifyBusy=false,verifySentAt=0,returnFocus=null;

  const currentUser=()=>window.AsteriaFirebase?.getUser?.() || null;
  const visible=()=>get('accountSecurityOverlay')?.hidden===false;
  const matchingUser=()=>Boolean(activeUid && currentUser()?.uid===activeUid &&
    window.AsteriaAuthBridge?.isLoggedIn?.());
  function close({restoreFocus=true}={}){
    const overlay=get('accountSecurityOverlay');
    if(overlay)overlay.hidden=true;
    activeUid='';requestBusy=false;resetSent=false;verifyBusy=false;verifySentAt=0;
    if(get('accountSecurityEmail'))get('accountSecurityEmail').textContent='—';
    if(get('accountSecurityStatus'))get('accountSecurityStatus').textContent='';
    for(const id of ['accountSecuritySendReset','accountSecuritySendVerification','accountSecurityCheckVerification','accountSecurityFinishId']){
      if(get(id))get(id).disabled=true;
    }
    if(get('accountSecurityVerification'))get('accountSecurityVerification').textContent='';
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
    activeUid=user.uid;requestBusy=false;resetSent=false;verifyBusy=false;verifySentAt=0;
    get('accountSecurityEmail').textContent=user.email || 'No email on this account';
    get('accountSecuritySendReset').disabled=!user.email;
    get('accountSecurityStatus').textContent=user.email?
      'Use the button below to request a reset link for your account email.':
      'Password recovery requires an email address on your Firebase account.';
    updateVerification(user);
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
  function updateVerification(user){
    const status=get('accountSecurityVerification');
    const send=get('accountSecuritySendVerification');
    const check=get('accountSecurityCheckVerification');
    const finish=get('accountSecurityFinishId');
    if(!status||!send||!check||!finish)return;
    const signed=Boolean(user?.uid&&user.uid===activeUid&&matchingUser());
    const verified=signed&&user.emailVerified===true;
    status.textContent=!signed?'':verified?'Email verified.':
      'Email not yet verified. Check your inbox and spam folder, then select Check Verification.';
    send.disabled=!signed||!user.email||verified||verifyBusy;
    check.disabled=!signed||!user.email||verifyBusy;
    finish.hidden=!signed||window.AsteriaFeatureFlags?.accountIdCanary!==true;
    finish.disabled=!signed||!verified||verifyBusy;
  }
  async function sendVerification(){
    if(!visible()||!matchingUser()||verifyBusy)return false;
    const uid=activeUid,now=Date.now();
    if(verifySentAt&&now-verifySentAt<60000){
      get('accountSecurityVerification').textContent='Verification email recently requested. Please check your inbox before retrying.';
      return false;
    }
    const api=window.AsteriaFirebase;
    if(typeof api?.sendAccountVerificationEmail!=='function')return false;
    verifyBusy=true;updateVerification(currentUser());
    try{
      await api.sendAccountVerificationEmail();
      if(!visible()||!matchingUser()||activeUid!==uid)return false;
      verifySentAt=now;
      get('accountSecurityVerification').textContent='Verification email requested. Check your inbox and spam folder.';
      return true;
    }catch{
      if(visible()&&matchingUser()&&activeUid===uid)
        get('accountSecurityVerification').textContent='Verification email could not be sent. Try again later.';
      return false;
    }finally{
      verifyBusy=false;
      if(visible()&&matchingUser()&&activeUid===uid){
        const send=get('accountSecuritySendVerification');
        const check=get('accountSecurityCheckVerification');
        const finish=get('accountSecurityFinishId');
        if(send)send.disabled=Boolean(verifySentAt)||currentUser()?.emailVerified===true;
        if(check)check.disabled=false;
        if(finish)finish.disabled=currentUser()?.emailVerified!==true;
      }
    }
  }
  async function checkVerification(){
    if(!visible()||!matchingUser()||verifyBusy)return false;
    const uid=activeUid,api=window.AsteriaFirebase;
    if(typeof api?.refreshAccountEmailVerification!=='function')return false;
    verifyBusy=true;updateVerification(currentUser());
    try{
      const result=await api.refreshAccountEmailVerification();
      if(!visible()||!matchingUser()||activeUid!==uid)return false;
      updateVerification(currentUser());
      return result?.verified===true;
    }catch{
      if(visible()&&matchingUser()&&activeUid===uid)
        get('accountSecurityVerification').textContent='Could not check email verification. Try again.';
      return false;
    }finally{
      verifyBusy=false;
      if(visible()&&matchingUser()&&activeUid===uid)updateVerification(currentUser());
    }
  }
  async function finishAccountId(){
    if(!visible()||!matchingUser()||verifyBusy||
       window.AsteriaFeatureFlags?.accountIdCanary!==true)return false;
    const uid=activeUid,api=window.AsteriaFirebase;
    if(typeof api?.completeNewAccountId!=='function')return false;
    verifyBusy=true;updateVerification(currentUser());
    try{
      const result=await api.completeNewAccountId();
      if(!visible()||!matchingUser()||activeUid!==uid)return false;
      get('accountSecurityVerification').textContent=result?.accountId?
        'Your Account ID has been verified and assigned. Open My Profile to view it.':
        'Account ID could not be confirmed.';
      return Boolean(result?.accountId);
    }catch{
      if(visible()&&matchingUser()&&activeUid===uid)
        get('accountSecurityVerification').textContent='Account ID could not be assigned. Verify your email promptly after registration; older accounts require review.';
      return false;
    }finally{
      verifyBusy=false;
      if(visible()&&matchingUser()&&activeUid===uid)updateVerification(currentUser());
    }
  }
  function bind(){
    const overlay=get('accountSecurityOverlay');
    if(!overlay)return;
    get('accountSecurityClose')?.addEventListener('click',()=>close());
    get('accountSecuritySendReset')?.addEventListener('click',()=>{void sendReset();});
  get('accountSecuritySendVerification')?.addEventListener('click',()=>{void sendVerification();});
  get('accountSecurityCheckVerification')?.addEventListener('click',()=>{void checkVerification();});
  get('accountSecurityFinishId')?.addEventListener('click',()=>{void finishAccountId();});
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
      else if(visible())updateVerification(currentUser());
    };
    window.addEventListener('asteria:auth-changed',accountChanged);
    window.addEventListener('asteria:firebase-ready',accountChanged);
  }
  window.AsteriaAccountSecurity=Object.freeze({open,close,sendReset,sendVerification,checkVerification,finishAccountId,isOpen:visible});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();