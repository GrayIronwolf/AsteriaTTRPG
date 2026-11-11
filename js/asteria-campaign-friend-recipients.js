/* Friends Phase 5.1 — owner-only campaign invitation recipient preview.
 * Read-only; no token, email, membership or invitation write is possible.
 * The server must re-check all eligibility again during Phase 5.2 issuance.
 */
(function(root){
  'use strict';
  let revision=0;
  const views=new Set();
  const HANDLE=/^[A-Za-z0-9._-]{3,24}#[0-9]{5}$/;
  function clear(){
    revision++;
    for(const dismiss of views)dismiss();
    views.clear();
  }
  root.addEventListener?.('asteria:auth-changed',clear);
  root.addEventListener?.('asteria:firebase-signed-out',clear);

  function render(grid,campaign){
    const api=root.AsteriaFirebase;
    const uid=api?.getUser?.()?.uid;
    if(!grid||!root.document||!uid||!api?.isReady?.()||
       root.AsteriaAuthBridge?.isLoggedIn?.()!==true||
       root.AsteriaFeatureFlags?.campaignFriendRecipients!==true||
       campaign?.membershipSchemaVersion!==2||
       campaign.ownerUid!==uid||
       typeof api.selectCampaignFriendRecipients!=='function')return false;
    const campaignId=campaign.id;
    if(typeof campaignId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(campaignId))return false;
    const article=grid.querySelector?.('.workspace-viewer');
    if(!article)return false;

    const el=(tag,cls='',text='')=>{
      const node=root.document.createElement(tag);
      if(cls)node.className=cls;
      if(text)node.textContent=text;
      return node;
    };
    const host=el('section','workspace-link-panel workspace-friend-campaign-recipients');
    host.setAttribute('aria-label','Select campaign invitation recipient');
    const heading=el('h3','','Select Invitation Recipient');
    const explanation=el('p','muted',
      'Choose an accepted friend or enter their complete Account ID. This step only previews eligibility; it does not create or send an invitation, grant campaign access, or disclose email.');
    const row=el('div','workspace-campaign-recipient-form');
    const label=el('label','','Exact Account ID');
    const input=el('input');
    input.id='workspaceCampaignFriendAccountId';
    input.type='text';
    input.autocomplete='off';
    input.maxLength=40;
    input.placeholder='Player#01234';
    label.appendChild(input);
    const resolve=el('button','primary','Check Account ID');
    resolve.type='button';
    row.append(label,resolve);
    const tools=el('div','workspace-join-review-actions');
    const reload=el('button','','Show Accepted Friends');
    const more=el('button','','More Friends');
    reload.type='button';more.type='button';
    more.disabled=true;
    tools.append(reload,more);
    const list=el('div','workspace-invite-list');
    list.setAttribute('role','list');
    list.setAttribute('aria-label','Eligible accepted friends');
    const selected=el('p','workspace-campaign-recipient-selected');
    selected.setAttribute('aria-live','polite');
    selected.textContent='No recipient selected.';
    const status=el('p','workspace-friend-campaign-status');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    host.append(heading,explanation,row,tools,list,selected,status);
    const before=article.querySelector?.('.workspace-secure-invite-manager');
    if(before)article.insertBefore(host,before);
    else article.appendChild(host);

    const session=revision;
    let busy=false,cursor=0,nextCursor=null,serial=0;
    const valid=()=>session===revision&&host.isConnected&&
      api.getUser?.()?.uid===uid&&api.isReady?.()===true&&
      root.AsteriaAuthBridge?.isLoggedIn?.()===true&&
      root.AsteriaFeatureFlags?.campaignFriendRecipients===true;
    const buttons=()=>[reload,more,resolve,input];
    function setBusy(value){
      busy=value;
      for(const button of buttons())button.disabled=value;
      if(!value)more.disabled=nextCursor===null;
      list.setAttribute('aria-busy',String(value));
    }
    function choose(candidate){
      if(!valid()||!candidate)return;
      // Preview only. There is no token issuance or persisted recipient.
      selected.textContent='Selected: '+candidate.username+
        ' ('+candidate.accountId+'). Invitation issuance is not activated.';
    }
    function addCandidate(friend){
      const item=el('div','workspace-campaign-recipient-item');
      item.setAttribute('role','listitem');
      const name=el('span','',friend.username+' — '+friend.accountId);
      const button=el('button','','Select');
      button.type='button';
      button.setAttribute('aria-label','Select '+friend.accountId);
      button.addEventListener('click',()=>choose(friend));
      item.append(name,button);
      list.appendChild(item);
    }
    async function load(append=false){
      if(busy||!valid())return;
      const start=append?nextCursor:0;
      if(start===null)return;
      const call=++serial;
      setBusy(true);
      status.textContent='Checking eligible accepted friends...';
      try{
        const response=await api.selectCampaignFriendRecipients(campaignId,{
          action:'list',cursor:start
        });
        if(!valid()||call!==serial)return;
        if(!append)list.replaceChildren();
        cursor=start;nextCursor=response.nextCursor;
        if(!response.items.length&&!append)list.appendChild(
          el('p','','No eligible accepted friends on this page.'));
        for(const friend of response.items)addCandidate(friend);
        status.textContent='Recipient previews are read-only. '+response.items.length+
          ' eligible friend(s) on this page.';
      }catch{
        if(valid()&&call===serial){
          nextCursor=null;
          status.textContent='Eligible friends are unavailable. No invitation was created.';
        }
      }finally{if(valid()&&call===serial)setBusy(false);}
    }
    async function resolveHandle(){
      if(busy||!valid())return;
      const accountId=input.value.trim();
      if(!HANDLE.test(accountId)){
        status.textContent='Enter a complete Account ID, for example Player#01234.';
        return;
      }
      const call=++serial;
      setBusy(true);
      status.textContent='Checking recipient eligibility...';
      try{
        const result=await api.selectCampaignFriendRecipients(campaignId,{
          action:'resolve',accountId
        });
        if(!valid()||call!==serial)return;
        if(result.available!==true){
          status.textContent='This recipient is unavailable for an invitation.';
          return;
        }
        choose(result.recipient);
        status.textContent='Eligible recipient selected for a future secure invitation.';
      }catch{
        if(valid()&&call===serial)
          status.textContent='This recipient is unavailable for an invitation.';
      }finally{if(valid()&&call===serial)setBusy(false);}
    }
    resolve.addEventListener('click',()=>{void resolveHandle();});
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();void resolveHandle();}
    });
    reload.addEventListener('click',()=>{void load(false);});
    more.addEventListener('click',()=>{void load(true);});
    views.add(()=>{
      serial++;host.hidden=true;list.replaceChildren();selected.textContent='';
      input.value='';status.textContent='';nextCursor=null;cursor=0;
    });
    status.textContent='Recipient selection is read-only. No invitation will be created.';
    return true;
  }
  root.AsteriaCampaignFriendRecipients=Object.freeze({render});
})(typeof window!=='undefined'?window:{});
