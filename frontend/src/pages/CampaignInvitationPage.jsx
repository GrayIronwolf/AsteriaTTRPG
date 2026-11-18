import React,{useEffect,useRef,useState} from 'react';
import {useAppServices} from '../app/AppServices.jsx';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {PageLayout} from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {Eyebrow,Heading,BodyText} from '../components/ui/Typography.jsx';
import {
  getPendingSecureInvite,clearPendingSecureInvite,
  normalizeUCN,invitationRouteCode
} from '../campaigns/campaignConnectionModel.mjs';
import styles from './CampaignConnections.module.css';
import {PlayerCharacterLink} from '../campaigns/PlayerCharacterLink.jsx';

export function CampaignInvitationPage({route}){
 const {session}=useAuth(),services=useAppServices();
 const api=services.get('campaigns');
 const characters=services.get('characters');
 const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
 const [ucn,setUCN]=useState(()=>invitationRouteCode(route)||'');
 const [preview,setPreview]=useState(null),[status,setStatus]=useState(null);
 const [pending,setPending]=useState(()=>getPendingSecureInvite());
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const ref=useRef(0);
 useEffect(()=>{
  ++ref.current;setPreview(null);setStatus(null);setError('');setMessage('');
  setPending(getPendingSecureInvite());
  setUCN(invitationRouteCode(route)||'');
 },[uid,route?.hash]);
 const run=async(task)=>{
  if(busy)return;
  const ticket=ref.current,account=uid;
  setBusy(true);setError('');setMessage('');
  try{await task(ticket,account);}
  catch(e){if(ref.current===ticket)setError(e.message||'The campaign invitation is unavailable.');}
  finally{if(ref.current===ticket)setBusy(false);}
 };
 const same=(ticket,account)=>ref.current===ticket&&uid===account;
 const checkSecure=()=>run(async(ticket,account)=>{
  const raw=getPendingSecureInvite();
  if(!raw)throw new Error('The secure invitation is no longer available. Open the original link again.');
  const result=await api.connections.previewSecure(raw);
  if(same(ticket,account))setPreview(result);
 });
 const accept=()=>run(async(ticket,account)=>{
  const raw=getPendingSecureInvite();
  if(!raw)throw new Error('The secure invitation is no longer available. Open the original link again.');
  // A verified signed-in account is required; server checks token,
  // recipient, expiry, claim count and active campaign.
  const result=await api.connections.acceptSecure(raw);
  if(same(ticket,account)){
   clearPendingSecureInvite();setPending(null);
   setStatus(result);setPreview(null);
   setMessage('Invitation claimed. Campaign GM approval is required before joining.');
  }
 });
 const lookup=()=>run(async(ticket,account)=>{
  const code=normalizeUCN(ucn);
  if(!code)throw new Error('Enter a 12-digit Unique Campaign Number.');
  const found=await api.connections.lookupUCN(code);
  if(!same(ticket,account))return;
  setPreview(found);
  if(found.joinMode==='request')setStatus(await api.connections.requestStatus(found.id,found.ucn));
 });
 const submit=()=>run(async(ticket,account)=>{
  if(preview?.joinMode!=='request')throw new Error('Only upgraded campaigns accept join requests.');
  const result=await api.connections.submitJoin(preview.id,preview.ucn);
  if(same(ticket,account)){
   setStatus(result);setMessage(result.status==='pending'?
    'Join request submitted. A GM must approve it.':
    'Your campaign request status was updated.');
  }
 });
 if(!uid||!api)return <PageLayout as="section" width="reading" labelledBy="invitation-title">
  <Heading id="invitation-title">Campaign Invitation</Heading>
  <BodyText>{session.status==='authenticated'?
    'Your account must be verified before joining a campaign.':
    'Sign in to review a campaign invitation. Secure links are not automatically redeemed.'}</BodyText>
  <CrystalButton href="#/account/login">Login</CrystalButton>
 </PageLayout>;
 const secure=Boolean(pending);
 return <PageLayout as="section" width="reading" className={styles.page}
  labelledBy="invitation-title" data-testid="site-invitation-page">
  <Eyebrow>Private Campaign Access</Eyebrow>
  <Heading id="invitation-title">Campaign Invitation</Heading>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}
  {message&&<p role="status" className={styles.notice}>{message}</p>}
  <SurfacePanel className={styles.panel}>
   {secure?<>
    <h2>Secure Invitation</h2>
    <BodyText>Confirm the campaign and offered role before accepting. Accepting submits a join request, not automatic membership.</BodyText>
    <CrystalButton disabled={busy} data-testid="site-invitation-preview" onClick={checkSecure}>Review Invitation</CrystalButton>
    {preview?.requiresGMApproval&&<>
     <dl className={styles.meta}><dt>Campaign</dt><dd>{preview.name}</dd>
      <dt>Role offered</dt><dd>{preview.role}</dd>
      <dt>Expires</dt><dd>{preview.expiresAt}</dd></dl>
     <CrystalButton variant="primary" disabled={busy||preview.status!=='available'}
      data-testid="site-invitation-accept" onClick={accept}>Request to Join</CrystalButton>
    </>}
   </>:<>
    <h2>Find Campaign</h2>
    <label className={styles.field}>Unique Campaign Number (UCN)
     <input value={ucn} onChange={e=>{setUCN(e.target.value);setPreview(null);setStatus(null);}}
      inputMode="numeric" maxLength={18} placeholder="12-digit campaign number"
      data-testid="site-invitation-ucn"/>
    </label>
    <CrystalButton disabled={busy} onClick={lookup} data-testid="site-invitation-lookup">Find Campaign</CrystalButton>
    {preview?.joinMode&&<div className={styles.section}>
     <h3>{preview.name}</h3>
     {preview.joinMode==='request'?<>
      <BodyText>GM approval is required. Your saved characters remain private until linked through the separate character-link system.</BodyText>
      <BodyText>Request status: {status?.status||'Not checked'}</BodyText>
      <CrystalButton variant="primary" disabled={busy||!['none','declined','cancelled','expired'].includes(status?.status)}
       data-testid="site-invitation-request" onClick={submit}>Submit Join Request</CrystalButton>
     </>:<BodyText>{preview.joinMode==='legacy'?
      'This is a legacy campaign. Its original joining workflow remains on the existing website; React cannot silently grant access.':
      'Campaign joining is currently unavailable.'}</BodyText>}
    </div>}
    {preview?.joinMode==='request'&&
      <PlayerCharacterLink key={uid+':'+preview.id} uid={uid}
       campaign={preview} joinStatus={status?.status}
       api={api.connections} characters={characters}/>}
   </>}
   {status?.status==='pending'&&<BodyText>Awaiting GM review. You will not gain membership until approved.</BodyText>}
   <CrystalButton href="#/campaign-forge">Return to Campaign Forge</CrystalButton>
  </SurfacePanel>
 </PageLayout>;
}
