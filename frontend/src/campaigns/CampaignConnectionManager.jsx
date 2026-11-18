import React,{useEffect,useRef,useState} from 'react';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {safeSecureLink,DELEGATED_PERMISSIONS} from './campaignConnectionModel.mjs';
import styles from './CampaignConnectionManager.module.css';

export function CampaignConnectionManager({campaign,api,uid}){
 const [queue,setQueue]=useState(null),[roster,setRoster]=useState(null);
 const [invites,setInvites]=useState(null),[cursor,setCursor]=useState(null);
 const [history,setHistory]=useState(null),[oneTime,setOneTime]=useState('');
 const [role,setRole]=useState('player'),[expiry,setExpiry]=useState(168);
 const [uses,setUses]=useState(1),[reason,setReason]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const seq=useRef(0);
 const allowed=campaign?.membershipSchemaVersion===2&&campaign?.ownerUid===uid&&api?.connections?.availability().enabled;
 useEffect(()=>()=>{++seq.current;setOneTime('');},[campaign?.id,uid]);
 async function run(task){
  if(busy)return;const ticket=seq.current;
  setBusy(true);setError('');setMessage('');
  try{await task();}catch(e){if(ticket===seq.current)setError(e.message||'Campaign action was rejected.');}
  finally{if(ticket===seq.current)setBusy(false);}
 }
 const refresh=()=>run(async()=>{
  const [q,r]=await Promise.all([api.connections.joinQueue(campaign.id),api.connections.roster(campaign.id)]);
  setQueue(q);setRoster(r);setMessage('Campaign membership refreshed.');
 });
 const loadInvites=(next=null)=>run(async()=>{
  setInvites(await api.connections.invitations(campaign.id,next));setCursor(next);
 });
 const issue=()=>run(async()=>{
  setOneTime('');
  const result=await api.connections.issueInvite(campaign.id,{
   roleOffered:role,expiresInHours:Number(expiry),maxUses:Number(uses)});
  if(result.token){setOneTime(safeSecureLink(result,window.location.origin+window.location.pathname));
   setMessage('Invitation issued. Copy the one-time link before leaving.');
  }else setMessage('Invitation already issued; the secret cannot be recovered.');
 });
 const review=(row,decision)=>run(async()=>{
  await api.connections.review(campaign.id,row,decision);
  setQueue(await api.connections.joinQueue(campaign.id));setMessage('Request '+decision+'d.');
 });
 const moderate=(row,action)=>run(async()=>{
  await api.connections.moderate(campaign.id,row,action,reason);
  setRoster(await api.connections.roster(campaign.id));setReason('');
 });
 const changeRole=(row,to)=>run(async()=>{
  await api.connections.role(campaign.id,row,to);
  setRoster(await api.connections.roster(campaign.id));
 });
 const delegate=(row,permission,enabled)=>run(async()=>{
  await api.connections.delegate(campaign.id,row,permission,enabled);
  setRoster(await api.connections.roster(campaign.id));
 });
 const alterInvite=(row,action)=>run(async()=>{
  await api.connections.changeInvite(campaign.id,row,action);
  setInvites(await api.connections.invitations(campaign.id,cursor));
 });
 if(!allowed)return <section className={styles.section} data-testid="site-campaign-connections-disabled">
   <h3>Membership and Invitations</h3>
   <BodyText>Secure invitations, role changes, and approvals require an upgraded v2 campaign. Existing legacy campaigns retain their current workflow. No automatic upgrade is performed.</BodyText>
 </section>;
 return <section className={styles.root} data-testid="site-campaign-connections">
  <h2>Campaign Connections</h2>
  <BodyText>Membership and role changes are verified by server functions. Campaign ownership cannot be transferred here.</BodyText>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}
  {message&&<p role="status" className={styles.notice}>{message}</p>}
  <section className={styles.section}>
   <h3>Secure Invitations</h3>
   <div className={styles.actions}>
    <label className={styles.field}>Role <select value={role} onChange={e=>setRole(e.target.value)}>
     <option value="player">Player</option><option value="co-gm">Co-GM</option></select></label>
    <label className={styles.field}>Expires in <select value={expiry} onChange={e=>setExpiry(Number(e.target.value))}>
     <option value={24}>24 hours</option><option value={72}>3 days</option><option value={168}>7 days</option><option value={336}>14 days</option><option value={720}>30 days</option></select></label>
    <label className={styles.field}>Max uses <input type="number" min={1} max={25} value={uses} onChange={e=>setUses(Number(e.target.value))}/></label>
   </div>
   <div className={styles.actions}>
    <CrystalButton disabled={busy} data-testid="site-secure-invite-issue" onClick={issue}>Create Secure Invitation</CrystalButton>
    <CrystalButton disabled={busy} onClick={()=>loadInvites()}>Refresh Invitations</CrystalButton>
   </div>
   {oneTime&&<div className={styles.section}>
    <label className={styles.field}>One-time invitation link <input readOnly value={oneTime}
     onFocus={e=>e.target.select()}/></label>
    <CrystalButton onClick={()=>navigator.clipboard?.writeText(oneTime)}>Copy Link</CrystalButton>
    <CrystalButton onClick={()=>setOneTime('')}>Hide Link</CrystalButton>
    <BodyText muted>This bearer link is shown once. It is not persisted or recoverable.</BodyText>
   </div>}
   {invites?.invitations.map(invite=><article key={invite.inviteId} className={styles.record}>
    <strong>{invite.roleOffered} · {invite.status}</strong>
    <small>Used {invite.usedCount}/{invite.maxUses} · Expires {invite.expiresAt}</small>
    <div className={styles.actions}>
     {['revoke','expire'].map(action=><CrystalButton key={action} disabled={busy||invite.status!=='active'}
       onClick={()=>alterInvite(invite,action)}>{action}</CrystalButton>)}
    </div>
   </article>)}
   {invites?.nextCursor&&<CrystalButton disabled={busy}
    onClick={()=>loadInvites(invites.nextCursor)}>Next Invitations</CrystalButton>}
  </section>
  <section className={styles.section}>
   <h3>GM Join Approval</h3>
   <CrystalButton disabled={busy} data-testid="site-campaign-join-refresh" onClick={refresh}>Refresh Roster and Requests</CrystalButton>
   {queue&&<>
    <p>{queue.activePlayers} / {queue.capacity} active players</p>
    <label className={styles.field}>Approval mode <select disabled={busy||!queue.canSetMode}
     value={queue.approvalMode} onChange={e=>run(async()=>{
      await api.connections.approvalMode(campaign.id,e.target.value);
      setQueue(await api.connections.joinQueue(campaign.id));
     })}>
      <option value="manual">Manual approval</option>
      <option value="automatic" disabled={!queue.autoAvailable}>Automatic (backend gated)</option>
     </select></label>
    {queue.requests.map(row=><article key={row.uid} className={styles.record}>
     <strong>{row.uid}</strong><small>Revision {row.revision}; requested {row.requestedAt}</small>
     <div className={styles.actions}>
      <CrystalButton disabled={busy} onClick={()=>review(row,'approve')}>Approve</CrystalButton>
      <CrystalButton disabled={busy} onClick={()=>review(row,'decline')}>Decline</CrystalButton>
     </div>
    </article>)}
    {!queue.requests.length&&<BodyText muted>No pending join requests.</BodyText>}
   </>}
  </section>
  <section className={styles.section}>
   <h3>Members and Roles</h3>
   {[...(roster?.active||[]),...(roster?.inactive||[])].map(row=><article key={row.uid} className={styles.record}>
    <strong>{row.displayName||row.uid}</strong><small>{row.role} · {row.status}</small>
    {row.roleEditable&&<label className={styles.field}>Role <select disabled={busy}
     value={row.role} onChange={e=>changeRole(row,e.target.value)}>
      <option value="player">Player</option><option value="co-gm">Co-GM</option>
     </select></label>}
    {row.roleEditable&&row.role==='co-gm'&&DELEGATED_PERMISSIONS.map(cap=><label key={cap} className={styles.check}>
     <input type="checkbox" disabled={busy} checked={row.capabilities?.[cap]===true}
      onChange={e=>delegate(row,cap,e.target.checked)}/>{cap.replaceAll('-',' ')}
    </label>)}
    {!!row.controls?.length&&<>
     <label className={styles.field}>Reason for removal or ban
      <input value={reason} maxLength={240} onChange={e=>setReason(e.target.value)}/></label>
     <div className={styles.actions}>{row.controls.map(action=><CrystalButton key={action}
      disabled={busy} onClick={()=>moderate(row,action)}>{action}</CrystalButton>)}</div>
    </>}
   </article>)}
  </section>
  <section className={styles.section}>
   <h3>Membership Activity</h3>
   <CrystalButton disabled={busy} onClick={()=>run(async()=>{
    setHistory(await api.connections.activity(campaign.id));
   })}>Refresh Activity</CrystalButton>
   {history?.events.map((item,i)=><div key={item.uid+i} className={styles.record}>
    <strong>{item.type}: {item.uid}</strong><small>{item.at}</small>
    <p>{item.detail}</p></div>)}
  </section>
 </section>;
}
