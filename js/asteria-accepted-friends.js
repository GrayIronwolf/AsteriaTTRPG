/* Phase 3.1: accepted Friends List, authenticated and private by default.
 * Never read friendship or identity Firestore documents in the browser.
 */
(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const state={uid:'',sequence:0,busy:false,nextCursor:null,rows:[]};
  const api=()=>window.AsteriaFirebase;
  const enabled=()=>window.AsteriaFeatureFlags?.friendRequestsEnabled===true;
  const session=()=>Boolean(state.uid&&api()?.getUser?.()?.uid===state.uid&&
    window.AsteriaAuthBridge?.isLoggedIn?.()===true&&
    window.AsteriaFriends?.isOpen?.()===true);
  const ready=()=>enabled()&&session()&&api()?.isReady?.()===true&&
    typeof api()?.listAcceptedFriends==='function';
  function status(message){
    if(byId('accountFriendsAcceptedStatus'))
      byId('accountFriendsAcceptedStatus').textContent=message;
  }
  function clear(){
    byId('accountFriendsAcceptedList')?.replaceChildren();
  }
  function controls(){
    const allowed=ready()&&!state.busy;
    const refresh=byId('accountFriendsAcceptedRefresh');
    if(refresh)refresh.disabled=!allowed;
    const more=byId('accountFriendsAcceptedMore');
    if(more){
      more.hidden=state.nextCursor===null||!enabled();
      more.disabled=!allowed||state.nextCursor===null;
    }
  }
  function render(){
    clear();
    const host=byId('accountFriendsAcceptedList');
    if(!host)return;
    if(!state.rows.length){
      const empty=document.createElement('p');
      empty.className='asteria-accepted-friends-empty';
      empty.textContent='No accepted friends yet. Find a player and send a friend request.';
      host.appendChild(empty);
      return;
    }
    for(const friend of state.rows){
      const card=document.createElement('article');
      card.className='asteria-accepted-friend-card';
      const initial=document.createElement('span');
      initial.className='asteria-friends-initial';
      initial.setAttribute('aria-hidden','true');
      initial.textContent=friend.username.slice(0,1).toUpperCase();
      const details=document.createElement('div');
      details.className='asteria-accepted-friend-details';
      const name=document.createElement('strong');
      name.textContent=friend.username;
      const handle=document.createElement('span');
      handle.textContent=friend.accountId;
      const since=document.createElement('small');
      since.textContent='Friends since '+new Date(friend.friendsSinceMs).toLocaleDateString();
      details.append(name,handle,since);
      card.append(initial,details);
      const view=document.createElement('button');
      view.type='button';
      view.className='asteria-friend-preview-link';
      view.textContent='View Public Profile';
      view.addEventListener('click',()=>window.AsteriaFriendsWorkspace?.preview?.(
        {username:friend.username,accountId:friend.accountId},
        {context:'Accepted friend.',source:view}));
      card.appendChild(view);
      host.appendChild(card);
      window.AsteriaFriendManagement?.decorateFriendCard?.(card,friend);
    }
  }
  function valid(uid,sequence){
    return state.uid===uid&&state.sequence===sequence&&ready();
  }
  async function refresh(append=false){
    if(!ready()||state.busy)return false;
    const cursor=append?state.nextCursor:0;
    if(cursor===null)return false;
    const uid=state.uid,sequence=++state.sequence;
    state.busy=true;
    controls();
    status(append?'Loading additional friends…':'Loading accepted friends…');
    try{
      const response=await api().listAcceptedFriends(cursor);
      if(!valid(uid,sequence))return false;
      state.rows=(append?state.rows:[]).concat(response.items);
      state.nextCursor=response.nextCursor;
      render();
      status(state.rows.length?
        'Showing '+state.rows.length+' accepted friend'+(state.rows.length===1?'':'s')+'.':
        'No accepted friends yet.');
      return true;
    }catch(error){
      if(valid(uid,sequence)){
        if(!append){
          state.rows=[];state.nextCursor=null;clear();
        }
        status(error?.code==='functions/resource-exhausted'?
          'Friends List refresh limit reached. Try again later.':
          'Friends List is unavailable. No changes were made.');
      }
      return false;
    }finally{
      if(valid(uid,sequence)){state.busy=false;controls();}
    }
  }
  function onClose(){
    state.sequence++;state.busy=false;state.uid='';
    state.nextCursor=null;state.rows=[];
    clear();status('');controls();
  }
  function onOpen(){
    onClose();
    state.uid=api()?.getUser?.()?.uid||'';
    if(!ready()){
      status('Friends List is not active yet.');
      controls();return;
    }
    controls();void refresh(false);
  }
  function authChanged(){
    if(state.uid&&!session())onClose();
  }
  function bind(){
    byId('accountFriendsAcceptedRefresh')?.addEventListener('click',()=>{
      if(ready()&&!state.busy)void refresh(false);
    });
    byId('accountFriendsAcceptedMore')?.addEventListener('click',()=>{
      if(ready()&&!state.busy)void refresh(true);
    });
    window.addEventListener('asteria:firebase-signed-out',onClose);
    window.addEventListener('asteria:auth-changed',authChanged);
    window.addEventListener('asteria:firebase-ready',authChanged);
  }
  window.AsteriaAcceptedFriends=Object.freeze({
    onOpen,onClose,refresh:()=>refresh(false),isAvailable:ready
  });
  document.readyState==='loading'?
    document.addEventListener('DOMContentLoaded',bind):bind();
})();
