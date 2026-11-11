/* Phase 2.3 — Friends requests workspace. Private relationship records are
 * never read from Firestore by the browser. Account-scoped callable only.
 */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
  const state={uid:'',sequence:0,busy:false,candidate:null,direction:'incoming',
    cursor:0,nextCursor:null,rows:[]};
  const api=()=>window.AsteriaFirebase;
  const active=()=>window.AsteriaFeatureFlags?.friendRequestsEnabled===true;
  const session=()=>Boolean(state.uid&&api()?.getUser?.()?.uid===state.uid&&
    window.AsteriaAuthBridge?.isLoggedIn?.()===true&&
    window.AsteriaFriends?.isOpen?.()===true);
  const ready=()=>active()&&session()&&api()?.isReady?.()===true&&
    typeof api()?.listFriendRequests==='function'&&
    typeof api()?.manageFriendRequest==='function';
  const status=message=>{if(el('accountFriendsRequestsStatus'))
    el('accountFriendsRequestsStatus').textContent=message;};
  const clean=()=>{const container=el('accountFriendsRequestList');
    if(container)container.replaceChildren();};
  function controls(){
    const enabled=ready()&&!state.busy;
    const send=el('accountFriendsSend');
    if(send){send.hidden=!state.candidate||!active();
      send.disabled=!enabled||!state.candidate;}
    for(const id of ['accountFriendsIncomingTab','accountFriendsOutgoingTab',
      'accountFriendsRequestsRefresh'])
      if(el(id))el(id).disabled=!enabled;
    const more=el('accountFriendsRequestsMore');
    if(more){more.hidden=state.nextCursor===null||!active();
      more.disabled=!enabled||state.nextCursor===null;}
    for(const button of (el('accountFriendsRequestList')?.querySelectorAll('button')||[]))
      button.disabled=!enabled;
    for(const [id,direction] of [
      ['accountFriendsIncomingTab','incoming'],['accountFriendsOutgoingTab','outgoing']
    ]){
      const tab=el(id);
      if(tab)tab.setAttribute('aria-selected',String(state.direction===direction));
    }
    el('accountFriendsRequestList')?.setAttribute('aria-labelledby',
      state.direction==='incoming'?'accountFriendsIncomingTab':'accountFriendsOutgoingTab');
  }
  function reset(){
    state.sequence++;state.busy=false;state.candidate=null;state.cursor=0;
    state.nextCursor=null;state.rows=[];state.direction='incoming';
    clean();controls();
  }
  function onClose(){
    reset();
    state.uid='';
    status('');
    controls();
  }
  function onOpen(){
    reset();
    state.uid=api()?.getUser?.()?.uid||'';
    if(!ready()){
      status('Friend requests are not active yet. Your existing player search is unaffected.');
      controls();return;
    }
    status('Loading incoming friend requests…');
    controls();
    void load(false);
  }
  function setCandidate(accountId){
    state.candidate=typeof accountId==='string'&&HANDLE.test(accountId)?
      accountId:null;
    controls();
  }
  function render(){
    clean();
    const container=el('accountFriendsRequestList');
    if(!container)return;
    if(state.rows.length===0){
      const empty=document.createElement('p');
      empty.className='asteria-friend-request-empty';
      empty.textContent=state.direction==='incoming'?
        'No incoming friend requests on this page.':'No outgoing friend requests on this page.';
      container.appendChild(empty);
      return;
    }
    for(const row of state.rows){
      const card=document.createElement('article');
      card.className='asteria-friend-request-entry';
      const identity=document.createElement('div');
      identity.className='asteria-friend-request-person';
      const initial=document.createElement('span');
      initial.className='asteria-friends-initial';
      initial.setAttribute('aria-hidden','true');
      initial.textContent=row.username.charAt(0).toUpperCase();
      const names=document.createElement('div');
      names.className='asteria-friend-request-person-names';
      const name=document.createElement('strong');
      name.textContent=row.username;
      const handle=document.createElement('span');
      handle.textContent=row.accountId;
      names.append(name,handle);
      identity.append(initial,names);
      const meta=document.createElement('p');
      meta.className='asteria-friend-request-date';
      const date=new Date(row.requestedAtMs);
      meta.textContent='Requested '+(Number.isNaN(date.getTime())?'recently':
        date.toLocaleDateString());
      const actions=document.createElement('div');
      actions.className='asteria-friend-request-actions';
      const choices=state.direction==='incoming'?
        [['accept','Accept'],['decline','Decline']]:
        [['cancel','Cancel Request']];
      for(const [action,label] of choices){
        const button=document.createElement('button');
        button.type='button';
        button.textContent=label;
        button.dataset.requestAction=action;
        button.disabled=state.busy||!ready();
        button.addEventListener('click',()=>{void change(action,row);});
        actions.appendChild(button);
      }
      card.append(identity,meta,actions);
      container.appendChild(card);
    }
  }
  async function load(append=false){
    if(!ready()||state.busy)return false;
    const uid=state.uid,direction=state.direction;
    const cursor=append?state.nextCursor:0;
    if(cursor===null)return false;
    const version=++state.sequence;
    state.busy=true;
    controls();
    status(append?'Loading more friend requests…':'Loading friend requests…');
    const valid=()=>readySession(uid,version)&&state.direction===direction;
    try{
      const result=await api().listFriendRequests(direction,cursor);
      if(!valid())return false;
      const existing=append?state.rows:[];
      state.rows=existing.concat(result.items);
      state.cursor=cursor;
      state.nextCursor=result.nextCursor;
      render();
      status(state.rows.length?
        'Showing '+state.rows.length+' '+direction+' friend request'+
          (state.rows.length===1?'':'s')+'.':
        'No '+direction+' requests on this page.');
      return true;
    }catch(error){
      if(valid()){
        if(!append){state.rows=[];state.nextCursor=null;clean();}
        status(error?.code==='functions/resource-exhausted'?
          'Too many requests. Try again later.':
          'Friend request inbox is unavailable. No changes were made.');
      }
      return false;
    }finally{
      if(valid()){state.busy=false;controls();}
    }
  }
  function readySession(uid,version){
    return state.uid===uid&&state.sequence===version&&session()&&active();
  }
  async function change(action,row=null){
    if(!ready()||state.busy)return false;
    const accountId=action==='send'?state.candidate:row?.accountId;
    const revision=action==='send'?undefined:row?.version;
    if(typeof accountId!=='string'||!HANDLE.test(accountId))return false;
    if(action!=='send'&&(!Number.isSafeInteger(revision)||revision<1))return false;
    const uid=state.uid,version=++state.sequence;
    state.busy=true;controls();status('Updating friend request…');
    const valid=()=>readySession(uid,version);
    try{
      const result=await api().manageFriendRequest(action,accountId,revision);
      if(!valid())return false;
      if(!result?.ok)throw new Error('Invalid friend request result.');
      if(action==='send'){state.candidate=null;controls();}
      status(action==='send'?'Friend request sent.':
        action==='accept'?'Friend request accepted.':
        action==='decline'?'Friend request declined.':
        'Friend request cancelled.');
      state.busy=false;controls();
      await load(false);
      return true;
    }catch(error){
      if(valid()){
        status(error?.code==='functions/resource-exhausted'?
          'Friend request limit reached. Try again later.':
          error?.code==='functions/aborted'?
          'This request changed. Refresh and try again.':
          'Friend request could not be completed. No confirmation was received.');
      }
      return false;
    }finally{
      if(valid()){state.busy=false;controls();}
    }
  }
  function select(direction){
    if(!ready()||state.busy||!['incoming','outgoing'].includes(direction))return;
    state.direction=direction;
    state.nextCursor=null;
    state.rows=[];state.cursor=0;
    clean();controls();void load(false);
  }
  function authChanged(){
    if(state.uid&&(!session()||api()?.getUser?.()?.uid!==state.uid)){
      onClose();
    }
  }
  function bind(){
    el('accountFriendsSend')?.addEventListener('click',()=>{void change('send');});
    el('accountFriendsIncomingTab')?.addEventListener('click',()=>select('incoming'));
    el('accountFriendsOutgoingTab')?.addEventListener('click',()=>select('outgoing'));
    el('accountFriendsRequestsRefresh')?.addEventListener('click',()=>{
      if(ready()&&!state.busy)void load(false);
    });
    el('accountFriendsRequestsMore')?.addEventListener('click',()=>{
      if(ready()&&!state.busy)void load(true);
    });
    window.addEventListener('asteria:firebase-signed-out',onClose);
    window.addEventListener('asteria:auth-changed',authChanged);
    window.addEventListener('asteria:firebase-ready',authChanged);
  }
  window.AsteriaFriendRequests=Object.freeze({onOpen,onClose,setCandidate,
    refresh:()=>load(false),isAvailable:ready});
  document.readyState==='loading'?
    document.addEventListener('DOMContentLoaded',bind):bind();
})();
