/* Phase 4.2 — recipient-private social notices in the existing Account workspace.
 * Only the authenticated callable provides data. No browser Firestore queries,
 * account mirrors, persisted notification state, or public profile lookups.
 */
(function(root){
  'use strict';
  const activeViews=new Set();
  let sessionRevision=0;
  function clearSessionViews(){
    sessionRevision++;
    for(const clear of activeViews)clear();
    activeViews.clear();
  }
  for(const event of ['asteria:auth-changed','asteria:firebase-signed-out'])
    root.addEventListener?.(event,clearSessionViews);
  const DESTINATIONS=Object.freeze({
    'incoming-request':'requests',
    'request-accepted':'friends',
    'request-declined':'requests',
    'request-cancelled':'requests',
    'friend-removed':'friends',
    'player-blocked':'blocked',
    'player-unblocked':'blocked'
  });

  function render(grid){
    if(root.AsteriaFeatureFlags?.friendNotificationsEnabled!==true||
       !grid||!root.document)return false;
    const api=root.AsteriaFirebase,uid=api?.getUser?.()?.uid;
    if(!uid||!api?.isReady?.()||
       root.AsteriaAuthBridge?.isLoggedIn?.()!==true||
       typeof api.listFriendNotifications!=='function'||
       typeof api.markFriendNotificationRead!=='function')return false;

    const revision=sessionRevision;
    const host=root.document.createElement('section');
    host.className='workspace-link-panel workspace-friend-notifications';
    host.setAttribute('aria-label','Friend notifications');
    const current=()=>sessionRevision===revision&&host.isConnected&&api.isReady?.()===true&&
      root.AsteriaAuthBridge?.isLoggedIn?.()===true&&
      api.getUser?.()?.uid===uid&&
      root.AsteriaFeatureFlags?.friendNotificationsEnabled===true;

    const heading=root.document.createElement('h3');
    heading.textContent='Friend Notifications';
    const intro=root.document.createElement('p');
    intro.className='workspace-friend-notice-intro';
    intro.textContent='Private friend requests, friendship updates and account actions.';
    const summary=root.document.createElement('div');
    summary.className='workspace-notification-summary';
    const count=root.document.createElement('small');
    count.setAttribute('aria-live','polite');
    const pageLabel=root.document.createElement('span');
    pageLabel.className='workspace-notice-page';
    pageLabel.setAttribute('aria-label','Current friend notification page');
    pageLabel.textContent='Page 1';
    summary.append(count,pageLabel);

    const actions=root.document.createElement('div');
    actions.className='workspace-join-review-actions';
    const button=(label)=>{
      const el=root.document.createElement('button');
      el.type='button';el.textContent=label;
      return el;
    };
    const refresh=button('Refresh Friend Notifications');
    const previous=button('Previous');
    const next=button('Next');
    const list=root.document.createElement('div');
    list.className='workspace-invite-list';
    list.setAttribute('role','list');
    list.setAttribute('aria-label','Your private friend notifications');
    const status=root.document.createElement('p');
    status.className='workspace-friend-notice-status';
    status.setAttribute('role','status');
    status.setAttribute('aria-live','polite');
    actions.append(refresh,previous,next);
    host.append(heading,intro,summary,actions,list,status);
    grid.prepend(host);

    let page=0,forward=null,busy=false;
    let requestSerial=0;
    const cursors=[null];
    activeViews.add(()=>{
      requestSerial++;
      page=0;forward=null;busy=false;cursors.length=1;
      list.replaceChildren();
      count.textContent='';pageLabel.textContent='';
      status.textContent='';host.hidden=true;
    });
    function setBusy(value){
      busy=value;
      list.setAttribute('aria-busy',String(value));
      refresh.disabled=value;
      previous.disabled=value||page===0;
      next.disabled=value||!forward;
    }
    function openFriends(section){
      if(!current())return;
      if(root.AsteriaFriends?.open?.()===true)
        root.AsteriaFriendsWorkspace?.select?.(section);
      else status.textContent='Friends are unavailable. Try again from Account.';
    }
    function buildRow(notice){
      const row=root.document.createElement('article');
      row.className='workspace-join-review-row workspace-notice-row'+
        (notice.readAt===null?' is-unread':'');
      row.setAttribute('role','listitem');
      const top=root.document.createElement('div');
      top.className='workspace-notice-heading';
      const title=root.document.createElement('strong');
      title.textContent=notice.title;
      const state=root.document.createElement('span');
      state.className='workspace-notice-state';
      state.textContent=notice.readAt===null?'Unread':'Read';
      top.append(title,state);
      const body=root.document.createElement('p');
      body.textContent=notice.body;
      const date=root.document.createElement('time');
      const created=new Date(notice.createdAt);
      if(Number.isFinite(created.getTime())){
        date.dateTime=created.toISOString();
        date.textContent=new Intl.DateTimeFormat(undefined,{
          dateStyle:'medium',timeStyle:'short'
        }).format(created);
      }else date.textContent='Date unavailable';
      const controls=root.document.createElement('div');
      controls.className='workspace-friend-notice-actions';
      const go=button('Open Friends');
      go.addEventListener('click',()=>openFriends(DESTINATIONS[notice.kind]||'friends'));
      controls.append(go);
      if(notice.readAt===null){
        const mark=button('Mark as Read');
        mark.addEventListener('click',async()=>{
          if(busy||!current())return;
          setBusy(true);
          status.textContent='Updating friend notification...';
          let succeeded=false;
          try{
            await api.markFriendNotificationRead(notice.notificationId);
            if(!current())return;
            succeeded=true;
            status.textContent='Friend notification marked as read.';
          }catch(error){
            if(current())status.textContent=error?.code==='functions/resource-exhausted'?
              'Too many notification actions. Try again later.':
              'Could not mark this friend notification as read.';
          }finally{
            if(current()){
              setBusy(false);
              if(succeeded){
                root.AsteriaAccountHeader?.refreshNotifications?.();
                void load();
              }
            }
          }
        });
        controls.append(mark);
      }
      row.append(top,body,date,controls);
      return row;
    }
    async function load(){
      if(busy||!current())return;
      setBusy(true);
      const request=++requestSerial;
      status.textContent='Loading friend notifications...';
      try{
        const response=await api.listFriendNotifications(cursors[page]);
        if(!current()||request!==requestSerial)return;
        forward=response.nextCursor;
        const items=response.notifications;
        list.replaceChildren();
        count.textContent=response.unreadShown+' unread on this page';
        pageLabel.textContent='Page '+(page+1)+(forward?' · More available':'');
        if(!items.length){
          const empty=root.document.createElement('p');
          empty.textContent='No friend notifications on this page.';
          list.append(empty);
        }
        for(const notice of items)list.append(buildRow(notice));
        status.textContent=items.length+' friend notification(s) displayed.';
      }catch(error){
        if(current()&&request===requestSerial){
          list.replaceChildren();
          count.textContent='Friend notifications unavailable';
          forward=null;
          status.textContent=error?.code==='functions/resource-exhausted'?
            'Too many notification refreshes. Try again later.':
            'Could not load friend notifications. Refresh to try again.';
        }
      }finally{
        if(current()&&request===requestSerial)setBusy(false);
      }
    }
    refresh.addEventListener('click',()=>{
      if(busy||!current())return;
      page=0;forward=null;cursors.length=1;void load();
    });
    previous.addEventListener('click',()=>{
      if(busy||!current()||page===0)return;
      page--;void load();
    });
    next.addEventListener('click',()=>{
      if(busy||!current()||!forward)return;
      page++;
      cursors[page]=forward;
      cursors.length=page+1;
      forward=null;
      void load();
    });
    setBusy(false);
    void load();
    return true;
  }
  root.AsteriaFriendNotificationsUI=Object.freeze({render});
})(typeof window!=='undefined'?window:{});
