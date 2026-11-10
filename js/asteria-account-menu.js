/* Asteria Account Navigation — Phase 3.3.
 * Profile, updates and security actions grouped in the existing responsive menu.
 */
(function(){
  const byId=id=>document.getElementById(id);
  let opened=false;

  function isSignedIn(){
    return window.AsteriaAuthBridge?.isLoggedIn?.()===true;
  }
  function menuActions(){
    return [...(byId('accountQuickMenu')?.querySelectorAll('[role="menuitem"]')||[])];
  }
  function setOpen(value,{focus=false,last=false}={}){
    const button=byId('loginToggle'),menu=byId('accountQuickMenu');
    if(!button||!menu)return false;
    opened=Boolean(value&&isSignedIn());
    menu.hidden=!opened;
    button.setAttribute('aria-expanded',String(opened));
    if(opened&&focus){
      const actions=menuActions();
      (last?actions.at(-1):actions[0])?.focus();
    }
    return opened;
  }
  function close(returnFocus=false){
    const wasOpen=opened;
    setOpen(false);
    if(wasOpen&&returnFocus)byId('loginToggle')?.focus();
  }
  function toggle(){
    const next=!opened&&isSignedIn();
    const state=byId('accountMenuNotificationsState');
    if(state)state.textContent=window.AsteriaFeatureFlags?.campaignNotifications===true?
      'Available':'Not active';
    const mobileSlot=byId('mobileAccountSlot'),wrapper=byId('accountMenuWrap');
    // Account stays on the right of the header, including on compact screens.
    // A tap never activates sign-out, and it does not move this control
    // into the mobile navigation drawer.
    if(next&&!mobileSlot?.contains(wrapper))window.closeSettings?.();
    return setOpen(next);
  }
  function syncSession(){
    if(!isSignedIn())close();
  }
  function handleAction(event){
    const target=event.target;
    const profile=target.closest?.('#accountMenuProfile');
    const settings=target.closest?.('#accountMenuSettings');
    const appearance=target.closest?.('#accountMenuAppearance');
    const notifications=target.closest?.('#accountMenuNotifications');
    const security=target.closest?.('#accountMenuSecurity');
    const logout=target.closest?.('#accountMenuLogout');
    if(!profile&&!settings&&!appearance&&!notifications&&!security&&!logout)return;
    event.preventDefault();
    close();
    window.closeSettings?.();
    if(profile)window.AsteriaAccountProfile?.open?.();
    else if(settings)window.AsteriaWorkspace?.openDashboard?.('settings');
    else if(appearance)window.openSettings?.();
    else if(notifications){
      if(!window.AsteriaWorkspace?.openNotifications?.())
        window.toast?.('Notifications are not ready. Try again shortly.');
    }
    else if(security)window.AsteriaAccountSecurity?.open?.();
    else window.logout?.();
  }
  function bind(){
    const button=byId('loginToggle'),menu=byId('accountQuickMenu'),wrap=byId('accountMenuWrap');
    if(!button||!menu||!wrap)return;
    button.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        setOpen(true,{focus:true,last:event.key==='ArrowUp'});
      }
    });
    menu.addEventListener('click',handleAction);
    menu.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();close(true);return;
      }
      const actions=menuActions();
      if(!actions.length)return;
      const index=actions.indexOf(document.activeElement);
      const key=event.key;
      if(!['ArrowDown','ArrowUp','Home','End'].includes(key))return;
      event.preventDefault();
      const next=key==='Home'?0:key==='End'?actions.length-1:
        (index+(key==='ArrowDown'?1:-1)+actions.length)%actions.length;
      actions[next]?.focus();
    });
    document.addEventListener('click',event=>{
      if(opened&&!wrap.contains(event.target))close();
    });
    document.addEventListener('focusin',event=>{
      if(opened&&!wrap.contains(event.target))close();
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&opened){
        event.preventDefault();close(true);
      }
    });
    window.addEventListener('asteria:firebase-signed-out',()=>close());
    window.addEventListener('hashchange',()=>close());
    window.addEventListener('resize',()=>close());
    window.AsteriaAuthBridge?.updateTopButtons?.();
  }

  window.AsteriaAccountMenu=Object.freeze({toggle,close,syncSession,isOpen:()=>opened});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
