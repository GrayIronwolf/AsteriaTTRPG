/* Asteria standalone Account, Friends and Notifications pages.
 * Reuses existing authenticated callables and Friends UI; no private account
 * collections are queried directly, and no presence status is invented. */
(function(root){
  'use strict';
  const get=id=>root.document?.getElementById(id);
  const pages=Object.freeze({
    friends:'asteriaFriendsPage',
    notifications:'asteriaNotificationsPage',
    account:'asteriaAccountPage'
  });
  let active='',ownerUid='',filter='all',observer=null;
  const signedUid=()=>{
    const uid=root.AsteriaFirebase?.getUser?.()?.uid;
    return uid&&root.AsteriaAuthBridge?.isLoggedIn?.()===true?uid:'';
  };
  function moveFriends(){
    const mount=get('asteriaFriendsPageMount');
    const overlay=get('accountFriendsOverlay');
    if(!mount||!overlay)return false;
    if(overlay.parentElement!==mount)mount.appendChild(overlay);
    const content=overlay.querySelector('.asteria-friends-dialog');
    if(content){
      content.setAttribute('role','region');
      content.removeAttribute('aria-modal');
    }
    return true;
  }
  function updateFilter(){
    const feeds=get('asteriaNotificationsFeeds');
    if(!feeds)return;
    feeds.dataset.filter=filter;
    root.document.querySelectorAll('[data-asteria-notice-filter]').forEach(button=>{
      button.setAttribute('aria-pressed',String(button.dataset.asteriaNoticeFilter===filter));
    });
    const rows=[...feeds.querySelectorAll('.workspace-notice-row')];
    const matching=rows.filter(row=>filter==='all'||
      (filter==='unread'?row.classList.contains('is-unread'):
        !row.classList.contains('is-unread')));
    const status=get('asteriaNotificationsFilteredStatus');
    if(status)status.textContent=rows.length?
      'Showing '+matching.length+' '+(filter==='all'?'loaded':'loaded '+filter)+
        ' notification'+(matching.length===1?'':'s')+'.'+
        (matching.length===0?' Use Next to view older notifications.':''):
      'Notifications will appear here after the private inbox loads.';
  }
  function drawNotifications({refresh=false}={}){
    const social=get('asteriaNotificationsFriendFeed');
    const campaigns=get('asteriaNotificationsCampaignFeed');
    const status=get('asteriaNotificationsServiceStatus');
    if(!social||!campaigns||!status)return false;
    if(ownerUid!==signedUid())return false;
    let available=0;
    if(root.AsteriaFeatureFlags?.friendNotificationsEnabled===true){
      if(!social.querySelector('.workspace-friend-notifications')){
        social.replaceChildren();
        if(root.AsteriaFriendNotificationsUI?.render?.(social)===true)available++;
      }else{
        available++;
        if(refresh)social.querySelector('button')?.click();
      }
    }else social.replaceChildren();
    if(root.AsteriaFeatureFlags?.campaignNotifications===true){
      if(!campaigns.querySelector('.workspace-campaign-notifications')){
        campaigns.replaceChildren();
        root.AsteriaCampaignNotificationsUI?.render?.(campaigns);
        if(campaigns.querySelector('.workspace-campaign-notifications'))available++;
      }else{
        available++;
        if(refresh)campaigns.querySelector('button')?.click();
      }
    }else campaigns.replaceChildren();
    status.textContent=available?'':(root.AsteriaFeatureFlags?.friendNotificationsEnabled||
      root.AsteriaFeatureFlags?.campaignNotifications)?
      'Notifications are unavailable. Check your connection and try again.':
      'Private notifications are not active for this account.';
    updateFilter();
    return available>0;
  }
  function reset(){
    if(active==='friends')root.AsteriaFriends?.close?.({restoreFocus:false});
    active='';ownerUid='';filter='all';
    get('asteriaNotificationsFriendFeed')?.replaceChildren();
    get('asteriaNotificationsCampaignFeed')?.replaceChildren();
    if(get('asteriaNotificationsFilteredStatus'))
      get('asteriaNotificationsFilteredStatus').textContent='';
    if(get('asteriaAccountPageStatus'))get('asteriaAccountPageStatus').textContent='';
  }
  function open(name){
    if(!Object.hasOwn(pages,name))return false;
    const uid=signedUid();
    if(!uid){
      reset();
      root.setView?.('loginPage');
      return false;
    }
    if(!get(pages[name])||typeof root.setView!=='function')return false;
    if(active==='friends'&&name!=='friends')
      root.AsteriaFriends?.close?.({restoreFocus:false});
    if(ownerUid&&ownerUid!==uid)reset();
    ownerUid=uid;
    if(name==='friends'&&!moveFriends())return false;
    active=name;
    root.closeSettings?.();
    root.AsteriaAccountMenu?.close?.();
    root.setView(pages[name]);
    if(name==='friends'){
      if(root.AsteriaFriends?.isOpen?.()!==true)
        root.AsteriaFriends?.open?.();
    }else if(name==='notifications')drawNotifications({refresh:true});
    else if(get('asteriaAccountPageStatus'))
      get('asteriaAccountPageStatus').textContent='Signed in. Choose an account option.';
    get(pages[name])?.querySelector('h1')?.focus?.({preventScroll:true});
    root.scrollTo?.({top:0,left:0,behavior:'auto'});
    return true;
  }
  function pageChanged(){
    if(!active)return;
    if(!get(pages[active])?.classList.contains('show')){
      if(active==='friends')root.AsteriaFriends?.close?.({restoreFocus:false});
      active='';
    }
  }
  function openAppearance(){
    const panel=get('settingsPanel'),title=get('settingsTitle');
    if(panel)panel.classList.add('appearance-mode');
    if(title)title.textContent='Appearance';
    root.openSettings?.();
    get('asteriaBackgroundSelect')?.focus?.();
  }
  function action(event){
    const to=event.target.closest?.('[data-asteria-account-page]');
    if(to){
      event.preventDefault();
      open(to.dataset.asteriaAccountPage);
      return;
    }
    const btn=event.target.closest?.('[data-asteria-account-action]');
    if(!btn)return;
    event.preventDefault();
    if(!signedUid())return;
    switch(btn.dataset.asteriaAccountAction){
      case 'profile':root.AsteriaAccountProfile?.open?.();break;
      case 'appearance':openAppearance();break;
      case 'security':root.AsteriaAccountSecurity?.open?.();break;
      case 'logout':root.logout?.();break;
    }
  }
  function changeFilter(event){
    const control=event.target.closest?.('[data-asteria-notice-filter]');
    if(!control||!signedUid())return;
    filter=control.dataset.asteriaNoticeFilter;
    if(!['all','read','unread'].includes(filter))filter='all';
    updateFilter();
  }
  function bind(){
    moveFriends();
    root.document.addEventListener('click',action);
    get('asteriaNotificationsPage')?.addEventListener('click',changeFilter);
    get('asteriaHeaderMail')?.addEventListener('click',()=>{open('notifications');});
    const main=get('mainContent');
    if(main&&root.MutationObserver){
      observer=new root.MutationObserver(records=>{
        if(records.some(record=>record.type==='attributes'&&record.attributeName==='class'))
          pageChanged();
      });
      observer.observe(main,{subtree:true,attributes:true,attributeFilter:['class']});
    }
    root.addEventListener?.('asteria:firebase-signed-out',reset);
    root.addEventListener?.('asteria:auth-changed',()=>{
      if(ownerUid&&ownerUid!==signedUid())reset();
    });
    root.addEventListener?.('asteria:notifications-updated',()=>{
      if(active==='notifications'&&ownerUid===signedUid())
        drawNotifications({refresh:true});
    });
    const feed=get('asteriaNotificationsFeeds');
    if(feed&&root.MutationObserver){
      new root.MutationObserver(records=>{
        if(active==='notifications'&&records.some(x=>x.type==='childList'))
          updateFilter();
      }).observe(feed,{subtree:true,childList:true});
    }
  }
  root.AsteriaAccountPages=Object.freeze({open,reset,isOpen:kind=>active===kind,refreshNotifications:()=>drawNotifications({refresh:true})});
  root.document?.readyState==='loading'?
    root.document.addEventListener('DOMContentLoaded',bind):bind();
})(typeof window!=='undefined'?window:{});
