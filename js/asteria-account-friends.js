/* Friends Phase 1.3: no requests, graph or campaign membership changes.
 * Only a verified, exact Account ID is shown after server authorization. */
(function(){
  'use strict';
  const get=id=>document.getElementById(id);
  const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
  let activeUid='',requestVersion=0,busy=false,returnFocus=null;
  const api=()=>window.AsteriaFirebase;
  const user=()=>api()?.getUser?.();
  const enabled=()=>window.AsteriaFeatureFlags?.friendAccountLookup===true;
  const isOpen=()=>get('accountFriendsOverlay')?.hidden===false;
  const sameUser=()=>Boolean(activeUid && user()?.uid===activeUid &&
    window.AsteriaAuthBridge?.isLoggedIn?.()===true);
  function setStatus(message){if(get('accountFriendsStatus'))get('accountFriendsStatus').textContent=message;}
  function clearResult(){
    window.AsteriaFriendRequests?.setCandidate?.(null);
    window.AsteriaFriendManagement?.setCandidate?.(null);
    window.AsteriaFriendsWorkspace?.closePreview?.();
    if(get('accountFriendsResult'))get('accountFriendsResult').hidden=true;
    for(const id of ['accountFriendsResultInitial','accountFriendsResultName','accountFriendsResultId'])
      if(get(id))get(id).textContent='';
  }
  function updateControls(){
    const ready=isOpen()&&sameUser()&&enabled()&&api()?.isReady?.()===true&&
      typeof api()?.findFriendByAccountId==='function';
    const input=get('accountFriendsAccountId'),button=get('accountFriendsFind');
    if(input)input.disabled=!ready||busy;
    if(button)button.disabled=!ready||busy;
    return ready;
  }
  function close({restoreFocus=true}={}){
    ++requestVersion;
    const overlay=get('accountFriendsOverlay');
    if(overlay)overlay.hidden=true;
    const input=get('accountFriendsAccountId');
    if(input){input.value='';input.disabled=true;}
    if(get('accountFriendsFind'))get('accountFriendsFind').disabled=true;
    clearResult();
    window.AsteriaFriendRequests?.onClose?.();
    window.AsteriaAcceptedFriends?.onClose?.();
    window.AsteriaFriendManagement?.onClose?.();
    window.AsteriaFriendsWorkspace?.onClose?.();
    setStatus('');
    activeUid='';busy=false;
    if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus();
    returnFocus=null;
  }
  function open(){
    const account=user();
    if(!account?.uid||!window.AsteriaAuthBridge?.isLoggedIn?.())return false;
    const overlay=get('accountFriendsOverlay');
    if(!overlay)return false;
    if(isOpen())close({restoreFocus:false});
    returnFocus=document.activeElement;
    activeUid=account.uid;busy=false;++requestVersion;
    clearResult();
    const input=get('accountFriendsAccountId');
    if(input)input.value='';
    overlay.hidden=false;
    window.AsteriaFriendRequests?.onOpen?.();
    window.AsteriaAcceptedFriends?.onOpen?.();
    window.AsteriaFriendManagement?.onOpen?.();
    window.AsteriaFriendsWorkspace?.onOpen?.();
    const ready=updateControls();
    setStatus(ready?
      'Enter the complete Account ID to find a player.':
      'Player search is not active yet. The secure Firebase lookup must be deployed and enabled first.');
    if(ready)input?.focus();
    else get('accountFriendsClose')?.focus();
    return true;
  }
  function validResponse(result){
    if(!result||result.found!==true||typeof result.username!=='string'||
       typeof result.accountId!=='string'||!HANDLE.test(result.accountId)||
       !result.accountId.startsWith(result.username+'#'))return null;
    return {username:result.username,accountId:result.accountId};
  }
  async function search(event){
    event?.preventDefault?.();
    if(!isOpen()||!sameUser()||busy)return false;
    if(!updateControls()){
      setStatus('Player search is not active yet.');
      return false;
    }
    clearResult();
    const input=get('accountFriendsAccountId');
    const handle=input?.value?.trim()||'';
    if(!HANDLE.test(handle)){
      setStatus('Enter the full Account ID, for example Player#01234.');
      input?.focus();
      return false;
    }
    const uid=activeUid,version=++requestVersion;
    busy=true;updateControls();
    setStatus('Searching for that exact Account ID…');
    const current=()=>isOpen()&&sameUser()&&activeUid===uid&&requestVersion===version&&enabled();
    try{
      const response=await api().findFriendByAccountId(handle);
      if(!current())return false;
      if(response?.found!==true){
        setStatus('No player found with that Account ID.');
        return false;
      }
      const result=validResponse(response);
      if(!result){
        setStatus('The account result could not be verified. Try again later.');
        return false;
      }
      get('accountFriendsResultName').textContent=result.username;
      get('accountFriendsResultId').textContent=result.accountId;
      get('accountFriendsResultInitial').textContent=result.username.charAt(0).toUpperCase();
      get('accountFriendsResult').hidden=false;
      window.AsteriaFriendRequests?.setCandidate?.(result.accountId);
      window.AsteriaFriendManagement?.setCandidate?.(result.accountId);
      setStatus(window.AsteriaFeatureFlags?.friendRequestsEnabled===true?
        'Player found. You can send a friend request if requests are active.':
        'Player found. Friend requests are not available yet.');
      return true;
    }catch(error){
      if(current()){
        const code=error?.code||'';
        setStatus(code==='functions/resource-exhausted'?
          'Too many account searches. Try again later.':
          code==='functions/invalid-argument'?
            'Enter the full Account ID, for example Player#01234.':
            'Account lookup is unavailable. No player information was changed.');
      }
      return false;
    }finally{
      busy=false;
      if(isOpen()&&sameUser())updateControls();
    }
  }
  function handleAuthChange(){
    if(isOpen()&&!sameUser())close({restoreFocus:false});
  }
  function bind(){
    const overlay=get('accountFriendsOverlay');
    if(!overlay)return;
    get('accountFriendsClose')?.addEventListener('click',()=>close());
    get('accountFriendsSearchForm')?.addEventListener('submit',event=>{void search(event);});
    get('accountFriendsAccountId')?.addEventListener('input',()=>{
      ++requestVersion;clearResult();
      if(isOpen()&&sameUser())setStatus(enabled()?
        'Enter the complete Account ID to find a player.':'Player search is not active yet.');
    });
    overlay.addEventListener('click',event=>{
      if(event.target===overlay)close();
    });
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key!=='Tab')return;
      const items=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')]
        .filter(item=>item.getClientRects().length);
      if(!items.length)return;
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    window.addEventListener('asteria:firebase-signed-out',()=>close({restoreFocus:false}));
    window.addEventListener('asteria:auth-changed',handleAuthChange);
    window.addEventListener('asteria:firebase-ready',handleAuthChange);
  }
  window.AsteriaFriends=Object.freeze({open,close,isOpen,search});
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bind):bind();
})();
