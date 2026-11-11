/* Phase 3.3: local Friends section tabs and minimal public-account previews.
 * Data only comes from authenticated exact search and scoped list summaries.
 * Never fetch private profiles, avatars or relationship documents.
 */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
  const sections=[
    ['friends','accountFriendsWorkspaceFriends','accountFriendsAccepted'],
    ['requests','accountFriendsWorkspaceRequests','accountFriendsRequests'],
    ['blocked','accountFriendsWorkspaceBlocked','accountFriendsBlocked']
  ];
  let uid='',active='friends',origin=null;
  const account=()=>window.AsteriaFirebase?.getUser?.()?.uid||'';
  const session=()=>Boolean(uid&&account()===uid&&
    window.AsteriaAuthBridge?.isLoggedIn?.()===true&&
    window.AsteriaFriends?.isOpen?.()===true);
  function closePreview({restoreFocus=false}={}){
    const view=el('accountFriendsPublicPreview');
    if(view)view.hidden=true;
    for(const id of ['accountFriendsPublicPreviewInitial',
      'accountFriendsPublicPreviewName','accountFriendsPublicPreviewAccountId',
      'accountFriendsPublicPreviewContext']){
      const field=el(id);
      if(field)field.textContent='';
    }
    if(restoreFocus&&origin?.isConnected&&session())origin.focus();
    origin=null;
  }
  function select(section,{focus=false}={}){
    if(!session()||!sections.some(x=>x[0]===section))return false;
    active=section;
    for(const [name,tabId,panelId] of sections){
      const tab=el(tabId),panel=el(panelId),selected=name===section;
      if(tab){
        tab.setAttribute('aria-selected',String(selected));
        tab.tabIndex=selected?0:-1;
        if(selected&&focus)tab.focus();
      }
      if(panel)panel.hidden=!selected;
    }
    closePreview();
    return true;
  }
  function preview(profile,{context='',source=null}={}){
    if(!session()||!profile||typeof profile.username!=='string'||
       typeof profile.accountId!=='string'||!HANDLE.test(profile.accountId)||
       profile.accountId!==profile.username+'#'+profile.accountId.slice(-5))
      return false;
    const view=el('accountFriendsPublicPreview');
    if(!view)return false;
    origin=source?.isConnected?source:document.activeElement;
    el('accountFriendsPublicPreviewInitial').textContent=
      profile.username.charAt(0).toUpperCase();
    el('accountFriendsPublicPreviewName').textContent=profile.username;
    el('accountFriendsPublicPreviewAccountId').textContent=profile.accountId;
    el('accountFriendsPublicPreviewContext').textContent=context;
    view.hidden=false;
    el('accountFriendsPublicPreviewClose')?.focus();
    return true;
  }
  function searchPreview(){
    const name=el('accountFriendsResultName')?.textContent,
      handle=el('accountFriendsResultId')?.textContent;
    if(el('accountFriendsResult')?.hidden)return false;
    return preview({username:name,accountId:handle},
      {context:'Player found by exact Account ID.',source:el('accountFriendsProfileFromSearch')});
  }
  function onClose(){
    closePreview();
    uid='';
    active='friends';
    for(const [name,tabId,panelId] of sections){
      const tab=el(tabId),panel=el(panelId);
      if(tab){tab.setAttribute('aria-selected',String(name==='friends'));
        tab.tabIndex=name==='friends'?0:-1;}
      if(panel)panel.hidden=name!=='friends';
    }
  }
  function onOpen(){
    onClose();
    uid=account();
    if(!session())return;
    select('friends');
  }
  function authChanged(){
    if(uid&&!session())onClose();
  }
  function bind(){
    for(const [section,tabId] of sections){
      const tab=el(tabId);if(!tab)continue;
      tab.addEventListener('click',()=>select(section));
      tab.addEventListener('keydown',event=>{
        if(!session())return;
        const i=sections.findIndex(x=>x[0]===section);
        const next=event.key==='ArrowRight'?(i+1)%sections.length:
          event.key==='ArrowLeft'?(i+sections.length-1)%sections.length:
          event.key==='Home'?0:event.key==='End'?sections.length-1:-1;
        if(next>=0){event.preventDefault();select(sections[next][0],{focus:true});}
      });
    }
    el('accountFriendsProfileFromSearch')?.addEventListener('click',searchPreview);
    el('accountFriendsPublicPreviewClose')?.addEventListener('click',
      ()=>closePreview({restoreFocus:true}));
    el('accountFriendsPublicPreview')?.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        event.stopPropagation?.();
        event.preventDefault();
        closePreview({restoreFocus:true});
      }
    });
    window.addEventListener('asteria:auth-changed',authChanged);
    window.addEventListener('asteria:firebase-ready',authChanged);
    window.addEventListener('asteria:firebase-signed-out',onClose);
  }
  window.AsteriaFriendsWorkspace=Object.freeze({
    onOpen,onClose,select,preview,closePreview,isActive:()=>session()
  });
  document.readyState==='loading'?
    document.addEventListener('DOMContentLoaded',bind):bind();
})();