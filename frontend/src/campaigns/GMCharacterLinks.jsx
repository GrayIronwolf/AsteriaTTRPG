import React,{useEffect,useRef,useState} from 'react';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import styles from './CampaignConnectionManager.module.css';

/** Owner review only. The server re-verifies the actor, member, source
 * ownership, expected revision, active encounter, and party capacity.
 */
export function GMCharacterLinks({campaign,api,uid}){
 const [requests,setRequests]=useState(null),[links,setLinks]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0);
 const enabled=Boolean(campaign?.membershipSchemaVersion===2&&
  campaign.ownerUid===uid&&api?.availability?.().forgeEnabled);
 useEffect(()=>()=>{++generation.current;},[uid,campaign?.id]);
 async function run(task){
  if(busy)return;
  const stamp=generation.current;setBusy(true);setError('');setMessage('');
  try{await task(stamp);}
  catch(error){if(generation.current===stamp)setError(error.message||'Character management was rejected.');}
  finally{if(generation.current===stamp)setBusy(false);}
 }
 const refresh=()=>run(async stamp=>{
  const [pending,live]=await Promise.all([
   api.pendingCharacterLinks(campaign.id),api.campaignCharacterLifecycle(campaign.id)
  ]);
  if(generation.current===stamp){setRequests(pending);setLinks(live);}
 });
 const review=(row,decision)=>run(async stamp=>{
  await api.reviewCharacterLink(campaign.id,row,decision);
  const [pending,live]=await Promise.all([
   api.pendingCharacterLinks(campaign.id),api.campaignCharacterLifecycle(campaign.id)
  ]);
  if(generation.current===stamp){
   setRequests(pending);setLinks(live);setMessage('Character request '+(decision==='approve'?'approved.':'declined.'));
  }
 });
 const lifecycle=(row,action)=>run(async stamp=>{
  await api.changeCampaignCharacterLifecycle(campaign.id,row,action);
  const live=await api.campaignCharacterLifecycle(campaign.id);
  if(generation.current===stamp){
   setLinks(live);setMessage('Character '+action+' operation completed by the backend.');
  }
 });
 if(!enabled)return null;
 return <section className={styles.section} data-testid="site-gm-character-links">
  <h3>Character Requests & Party Lifecycle</h3>
  <BodyText>Approving imports the verified owner's character. Deactivation and unlinking preserve gameplay through the backend archive. Active combatants cannot be detached.</BodyText>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}
  {message&&<p role="status" className={styles.notice}>{message}</p>}
  <CrystalButton disabled={busy} data-testid="site-gm-character-refresh"
   onClick={refresh}>Refresh Character Links</CrystalButton>
  <h4>Pending GM Approvals</h4>
  {requests?.requests.map(row=><article className={styles.record} key={row.linkId}>
   <strong>Character: {row.sourceCharacterId}</strong>
   <small>Owner: {row.ownerUid} · Revision {row.revision}</small>
   <div className={styles.actions}>
    <CrystalButton disabled={busy} data-testid="site-gm-character-approve"
     onClick={()=>review(row,'approve')}>Approve Character</CrystalButton>
    <CrystalButton disabled={busy} onClick={()=>review(row,'decline')}>Decline Character</CrystalButton>
   </div>
  </article>)}
  {requests&&!requests.requests.length&&<BodyText muted>No pending character requests.</BodyText>}
  <h4>Campaign Party Links</h4>
  {links?.links.map(row=><article className={styles.record} key={row.linkId}>
   <strong>{row.sourceCharacterId}</strong>
   <small>{row.status} · Owner {row.ownerUid} · Revision {row.revision}</small>
   <div className={styles.actions}>
    {row.status==='approved'&&<CrystalButton disabled={busy}
     onClick={()=>lifecycle(row,'deactivate')}>Deactivate</CrystalButton>}
    {row.status==='inactive'&&<CrystalButton disabled={busy}
     onClick={()=>lifecycle(row,'restore')}>Restore</CrystalButton>}
    <CrystalButton disabled={busy} onClick={()=>lifecycle(row,'unlink')}>Unlink Character</CrystalButton>
   </div>
  </article>)}
  {links&&!links.links.length&&<BodyText muted>No approved or inactive character links.</BodyText>}
 </section>;
}
