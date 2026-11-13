/* Phase 1.2: Account opens its full page instead of a dropdown. */
(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const signedIn=()=>window.AsteriaAuthBridge?.isLoggedIn?.()===true;
  function close(){
    const button=byId('loginToggle');
    button?.removeAttribute?.('aria-haspopup');
    button?.removeAttribute?.('aria-controls');
    button?.removeAttribute?.('aria-expanded');
  }
  function open(name){
    if(!signedIn())return false;
    return window.AsteriaAccountPages?.open?.(name)===true;
  }
  function toggle(){return open('account');}
  function showNavigation(){
    byId('settingsPanel')?.classList.remove('appearance-mode');
    const heading=byId('settingsTitle');
    if(heading)heading.textContent='Main navigation';
  }
  function bind(){
    byId('settingsToggle')?.addEventListener('click',showNavigation,true);
    window.addEventListener('asteria:firebase-signed-out',close);
    window.AsteriaAuthBridge?.updateTopButtons?.();
  }
  window.AsteriaAccountMenu=Object.freeze({
    toggle,close,syncSession:()=>{if(!signedIn())close();},
    isOpen:()=>false,openFriends:()=>open('friends'),
    openNotifications:()=>open('notifications')
  });
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
