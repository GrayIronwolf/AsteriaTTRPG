// Phase 7.3 — account-scoped in-app notifications.
// This isolated, feature-gated view preserves the existing dashboard artwork.
// All data is served by the authenticated Firebase Callable, never Firestore
// browser reads, localStorage, account mirrors or browser notifications.
(function(root){
  'use strict';
  function render(grid){
    if(root.AsteriaFeatureFlags?.campaignNotifications!==true||
      !grid||!root.document)return;
    const api=root.AsteriaFirebase;
    if(!api?.isReady?.()||!api?.getUser?.()?.uid||
      !api.listCampaignNotifications||!api.markCampaignNotificationRead)return;
    const uid=api.getUser().uid;
    const current=()=>host.isConnected&&api.isReady?.()&&
      api.getUser?.()?.uid===uid&&
      root.AsteriaFeatureFlags?.campaignNotifications===true;
    const host=root.document.createElement('section');
    host.className='workspace-link-panel workspace-campaign-notifications';
    host.setAttribute('aria-label','Campaign notifications');
    const heading=root.document.createElement('h3');
    heading.textContent='Campaign Notifications';
    const summary=root.document.createElement('div');
    summary.className='workspace-notification-summary';
    const count=root.document.createElement('small');
    count.setAttribute('aria-live','polite');
    const pageLabel=root.document.createElement('span');
    pageLabel.className='workspace-notice-page';
    pageLabel.setAttribute('aria-label','Current notification page');
    pageLabel.textContent='Page 1';
    summary.append(count,pageLabel);
    const actions=root.document.createElement('div');
    actions.className='workspace-join-review-actions';
    const refresh=root.document.createElement('button');
    refresh.type='button';
    refresh.textContent='Refresh Notifications';
    const previous=root.document.createElement('button');
    previous.type='button';previous.textContent='Previous';previous.disabled=true;
    const next=root.document.createElement('button');
    next.type='button';next.textContent='Next';next.disabled=true;
    const list=root.document.createElement('div');
    list.className='workspace-invite-list';
    list.setAttribute('role','list');
    list.setAttribute('aria-label','Your private campaign notifications');
    const status=root.document.createElement('p');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    actions.append(refresh,previous,next);
    host.append(heading,summary,actions,list,status);
    grid.prepend(host);
    const cursors=[null];
    let page=0,forward=null,busy=false;
    const setBusy=value=>{
      busy=value;
      list.setAttribute('aria-busy',String(value));
      refresh.disabled=value;
      previous.disabled=value||page===0;
      next.disabled=value||!forward;
    };
    async function load(){
      if(busy||!current())return;
      setBusy(true);status.textContent='Loading notifications...';
      try{
        const response=await api.listCampaignNotifications(cursors[page]);
        if(!current())return;
        forward=response.nextCursor||null;
        list.replaceChildren();
        const items=Array.isArray(response.notifications)?response.notifications:[];
        count.textContent=(Number(response.unreadShown)||0)+' unread on this page';
        pageLabel.textContent='Page '+(page+1)+(forward?' · More available':'');
        if(!items.length){
          const empty=root.document.createElement('p');
          empty.textContent='No campaign notifications on this page.';
          list.appendChild(empty);
        }
        for(const notice of items){
          const row=root.document.createElement('article');
          row.className='workspace-join-review-row workspace-notice-row'+
            (notice.readAt?'':' is-unread');
          row.setAttribute('role','listitem');
          const noticeHeading=root.document.createElement('div');
          noticeHeading.className='workspace-notice-heading';
          const name=root.document.createElement('strong');
          name.textContent=String(notice.title||'Campaign update');
          const state=root.document.createElement('span');
          state.className='workspace-notice-state';
          state.textContent=notice.readAt?'Read':'Unread';
          noticeHeading.append(name,state);
          const body=root.document.createElement('p');
          body.textContent=String(notice.body||'');
          const meta=root.document.createElement('time');
          const created=new Date(notice.createdAt||'');
          if(Number.isFinite(created.getTime())){
            meta.dateTime=created.toISOString();
            meta.textContent=new Intl.DateTimeFormat(undefined,{
              dateStyle:'medium',timeStyle:'short'
            }).format(created);
          }else{
            meta.textContent='Date unavailable';
          }
          row.append(noticeHeading,body,meta);
          if(notice.kind==='friend-invitation'&&
             /^[A-Za-z0-9_-]{1,160}$/.test(notice.campaignId||'')&&
             /^[a-f0-9]{64}$/.test(notice.inviteId||'')&&
             root.AsteriaFeatureFlags?.campaignFriendInvitations===true&&
             root.AsteriaFeatureFlags?.secureInvitationAcceptance===true&&
             typeof api.previewCampaignNotificationInvitation==='function'&&
             typeof api.acceptCampaignNotificationInvitation==='function'){
            const accept=root.document.createElement('button');
            accept.type='button';
            accept.textContent='Review Campaign Invitation';
            accept.addEventListener('click',async()=>{
              if(busy||!current())return;
              setBusy(true);status.textContent='Verifying campaign invitation...';
              try{
                const preview=await api.previewCampaignNotificationInvitation(
                  notice.campaignId,notice.inviteId);
                if(!current())return;
                if(!preview?.requiresGMApproval||
                   !['available','pending'].includes(preview.status))
                  throw Error('This invitation is unavailable.');
                if(!root.confirm?.('Request to join '+
                   String(preview.campaignName||'this campaign')+
                   '? The GM must approve your request before you can join.')){
                  status.textContent='Invitation remains available in notifications.';
                  return;
                }
                const result=await api.acceptCampaignNotificationInvitation(
                  notice.campaignId,notice.inviteId);
                if(current()){
                  status.textContent=result?.status==='pending'?
                    'Join request sent. The GM must approve you.':
                    'Invitation checked: '+String(result?.status||'pending GM review')+'.';
                  if(typeof root.dispatchEvent==='function'&&
                     typeof root.CustomEvent==='function')
                    root.dispatchEvent(new root.CustomEvent('asteria:notifications-updated'));
                }
              }catch(error){
                if(current())status.textContent=error?.message||
                  'Unable to accept this invitation. Please try again.';
              }finally{
                setBusy(false);
                if(current())void load();
              }
            });
            row.appendChild(accept);
          }
          if(!notice.readAt){
            const button=root.document.createElement('button');
            button.type='button';
            button.textContent='Mark as Read';
            button.addEventListener('click',async()=>{
              if(busy||!current())return;
              setBusy(true);status.textContent='Marking as read...';
              try{
                await api.markCampaignNotificationRead(notice.notificationId);
                if(current()){
                  status.textContent='Notification marked as read.';
                  root.AsteriaAccountHeader?.refreshNotifications?.();
                }
              }catch(error){
                if(current())status.textContent=error?.message||
                  'Could not update notification.';
              }finally{
                setBusy(false);
                if(current())void load();
              }
            });
            row.appendChild(button);
          }
          list.appendChild(row);
        }
        status.textContent=items.length+' notification(s) displayed.';
      }catch(error){
        if(current()){
          list.replaceChildren();
          count.textContent='Notifications unavailable';
          forward=null;
          status.textContent=error?.message||'Could not load notifications.';
        }
      }finally{
        setBusy(false);
      }
    }
    refresh.addEventListener('click',()=>{void load();});
    previous.addEventListener('click',()=>{
      if(busy||page===0)return;
      page--;void load();
    });
    next.addEventListener('click',()=>{
      if(busy||!forward)return;
      page++;
      cursors[page]=forward;
      cursors.length=page+1;
      void load();
    });
    void load();
  }
  root.AsteriaCampaignNotificationsUI=Object.freeze({render});
})(typeof window!=='undefined'?window:{});
