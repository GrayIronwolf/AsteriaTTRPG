/* Phase 3.2: scoped friend removal and independent block management.
 * One explicit confirmation per mutation. Never expose raw Firebase IDs.
 */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
  const state={uid:'',sequence:0,busy:false,rows:[],nextCursor:null,
    candidate:null,confirmation:null,returnFocus:null};
  const api=()=>window.AsteriaFirebase;
  const active=()=>window.AsteriaFeatureFlags?.friendRequestsEnabled===true;
  const session=()=>Boolean(state.uid&&api()?.getUser?.()?.uid===state.uid&&
    window.AsteriaAuthBridge?.isLoggedIn?.()===true&&
    window.AsteriaFriends?.isOpen?.()===true);
  const ready=()=>active()&&session()&&api()?.isReady?.()===true&&
    typeof api()?.listBlockedFriends==='function'&&
    typeof api()?.manageFriendRelationship==='function';
  const status=message=>{if(el('accountFriendsBlockedStatus'))
    el('accountFriendsBlockedStatus').textContent=message;};
  function hideConfirmation(){
    const element=el('accountFriendsManageConfirm');
    if(element)element.hidden=true;
    state.confirmation=null;
    if(state.returnFocus?.isConnected&&session())state.returnFocus.focus();
    state.returnFocus=null;
  }
  function controls(){
    const enabled=ready()&&!state.busy&&!state.confirmation;
    const refresh=el('accountFriendsBlockedRefresh');
    if(refresh)refresh.disabled=!enabled;
    const more=el('accountFriendsBlockedMore');
    if(more){more.hidden=state.nextCursor===null||!active();
      more.disabled=!enabled||state.nextCursor===null;}
    const block=el('accountFriendsBlock');
    if(block){block.hidden=!state.candidate||!active();
      block.disabled=!enabled||!state.candidate;}
    for(const button of el('accountFriendsBlockedList')?.querySelectorAll('button')||[])
      button.disabled=!enabled;
    for(const button of el('accountFriendsAcceptedList')?.querySelectorAll('button')||[])
      button.disabled=!enabled;
  }
  function draw(){
    const host=el('accountFriendsBlockedList');if(!host)return;
    host.replaceChildren();
    if(!state.rows.length){
      const empty=document.createElement('p');
      empty.textContent='You have not blocked any active players.';
      host.appendChild(empty);return;
    }
    for(const entry of state.rows){
      const card=document.createElement('article');
      card.className='asteria-blocked-friend-card';
      const name=document.createElement('strong');
      name.textContent=entry.username;
      const handle=document.createElement('span');
      handle.textContent=entry.accountId;
      const button=document.createElement('button');
      button.type='button';button.textContent='Unblock';
      button.addEventListener('click',()=>request('unblock',entry));
      card.append(name,handle,button);
      host.appendChild(card);
    }
    controls();
  }
  function valid(uid,version){
    return state.uid===uid&&state.sequence===version&&ready();
  }
  async function refresh(append=false){
    if(!ready()||state.busy||state.confirmation)return false;
    const cursor=append?state.nextCursor:0;
    if(cursor===null)return false;
    const uid=state.uid,version=++state.sequence;
    state.busy=true;controls();status('Loading blocked players…');
    try{
      const response=await api().listBlockedFriends(cursor);
      if(!valid(uid,version))return false;
      state.rows=(append?state.rows:[]).concat(response.items);
      state.nextCursor=response.nextCursor;draw();
      status('Showing '+state.rows.length+' blocked player'+(state.rows.length===1?'':'s')+'.');
      return true;
    }catch(error){
      if(valid(uid,version)){
        if(!append){state.rows=[];state.nextCursor=null;draw();}
        status(error?.code==='functions/resource-exhausted'?
          'Refresh limit reached. Try again later.':
          'Blocked players could not be loaded.');
      }
      return false;
    }finally{
      if(valid(uid,version)){state.busy=false;controls();}
    }
  }
  function request(action,item){
    if(!ready()||state.busy||state.confirmation||
       !['remove','block','unblock'].includes(action)||
       !item||!HANDLE.test(item.accountId))return false;
    if(action!=='block'&&(!Number.isSafeInteger(item.version)||item.version<1))
      return false;
    const uid=state.uid,version=++state.sequence;
    state.returnFocus=document.activeElement;
    state.confirmation={action,accountId:item.accountId,version:item.version,
      uid,sequence:version};
    const title=el('accountFriendsManageTitle');
    const message=el('accountFriendsManageMessage');
    if(title)title.textContent={
      remove:'Remove Friend',block:'Block Player',unblock:'Unblock Player'
    }[action];
    if(message)message.textContent={
      remove:'Remove '+item.accountId+' from your Friends List? You will both lose this friendship and must wait before reconnecting.',
      block:'Block '+item.accountId+'? Existing friendship or requests will end. This player cannot send you a friend request until your block is removed.',
      unblock:'Unblock '+item.accountId+'? This will not automatically restore a previous friendship.'
    }[action];
    if(el('accountFriendsManageConfirm')){
      el('accountFriendsManageConfirm').hidden=false;
      el('accountFriendsManageApprove')?.focus();
    }
    controls();return true;
  }
  async function approve(){
    const confirm=state.confirmation;
    if(!confirm||!ready()||state.busy||!valid(confirm.uid,confirm.sequence))return false;
    state.confirmation=null;state.busy=true;
    if(el('accountFriendsManageConfirm'))el('accountFriendsManageConfirm').hidden=true;
    controls();status('Updating friendship…');
    try{
      const result=await api().manageFriendRelationship(
        confirm.action,confirm.accountId,confirm.version);
      if(!valid(confirm.uid,confirm.sequence))return false;
      if(!result?.ok)throw new Error('Invalid friendship response.');
      state.busy=false;
      // Refresh the accepted and blocked views. No automatic campaign changes.
      void window.AsteriaAcceptedFriends?.refresh?.();
      await refresh(false);
      if(valid(confirm.uid,confirm.sequence))
        status({remove:'Friend removed.',block:'Player blocked.',
          unblock:'Player unblocked.'}[confirm.action]);
      return true;
    }catch(error){
      if(valid(confirm.uid,confirm.sequence)){
        status(error?.code==='functions/aborted'?
          'This friendship changed. Refresh and try again.':
          'Friendship could not be updated. No confirmation was received.');
      }
      return false;
    }finally{
      if(valid(confirm.uid,confirm.sequence)){
        state.busy=false;controls();
      }
      if(state.returnFocus?.isConnected&&session())state.returnFocus.focus();
      state.returnFocus=null;
    }
  }
  function decorateFriendCard(card,friend){
    if(!ready()||!friend||!HANDLE.test(friend.accountId)||
       !Number.isSafeInteger(friend.version)||friend.version<1)return;
    const actions=document.createElement('div');
    actions.className='asteria-friend-manage-actions';
    for(const [action,label] of [['remove','Remove Friend'],['block','Block']]){
      const button=document.createElement('button');
      button.type='button';button.textContent=label;
      button.addEventListener('click',()=>request(action,friend));
      actions.appendChild(button);
    }
    card.appendChild(actions);controls();
  }
  function setCandidate(accountId){
    state.candidate=typeof accountId==='string'&&HANDLE.test(accountId)?
      {accountId}:null;
    controls();
  }
  function onClose(){
    state.sequence++;state.uid='';state.busy=false;state.rows=[];
    state.nextCursor=null;state.candidate=null;
    hideConfirmation();
    el('accountFriendsBlockedList')?.replaceChildren();
    status('');controls();
  }
  function onOpen(){
    onClose();
    state.uid=api()?.getUser?.()?.uid||'';
    if(!ready()){status('Blocked players are unavailable.');return;}
    void refresh(false);
  }
  function authChanged(){if(state.uid&&!session())onClose();}
  function bind(){
    el('accountFriendsBlockedRefresh')?.addEventListener('click',()=>{void refresh(false);});
    el('accountFriendsBlockedMore')?.addEventListener('click',()=>{void refresh(true);});
    el('accountFriendsBlock')?.addEventListener('click',()=>{
      if(state.candidate)request('block',state.candidate);
    });
    el('accountFriendsManageCancel')?.addEventListener('click',()=>{
      hideConfirmation();controls();
    });
    el('accountFriendsManageApprove')?.addEventListener('click',()=>{void approve();});
    el('accountFriendsManageConfirm')?.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();hideConfirmation();controls();}
    });
    window.addEventListener('asteria:firebase-signed-out',onClose);
    window.addEventListener('asteria:auth-changed',authChanged);
    window.addEventListener('asteria:firebase-ready',authChanged);
  }
  window.AsteriaFriendManagement=Object.freeze({
    onOpen,onClose,setCandidate,decorateFriendCard,refresh:()=>refresh(false)
  });
  document.readyState==='loading'?
    document.addEventListener('DOMContentLoaded',bind):bind();
})();
