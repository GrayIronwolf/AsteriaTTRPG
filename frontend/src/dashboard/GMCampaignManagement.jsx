import React,{useEffect,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {campaignDetailsDraft} from './gmQuestManagementModel.mjs';
import styles from './GMQuestManagement.module.css';

export function GMCampaignManagement({api,campaignId,campaign,workspace={},party=[],session={}}){
  const [draft,setDraft]=useState(()=>campaignDetailsDraft(campaign,workspace));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [artPreview,setArtPreview]=useState(campaign?.image||'');
  useEffect(()=>{
    setDraft(campaignDetailsDraft(campaign,workspace));
  },[campaignId,campaign?.name,campaign?.description,campaign?.location,campaign?.playerLimit,
    workspace.campaign?.synopsis,workspace.campaign?.location,workspace.campaign?.playerLimit]);
  useEffect(()=>setArtPreview(campaign?.image||''),[campaignId,campaign?.image]);
  const update=(key,value)=>setDraft(prev=>({...prev,[key]:value}));
  const run=async(operation,success)=>{
    if(busy)return;
    setBusy(true);setMessage('');setError('');
    try{await operation();setMessage(success);}
    catch(err){setError(err?.message||'Campaign update failed.');}
    finally{setBusy(false);}
  };
  const upload=event=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    run(async()=>{
      const result=await api.uploadArtwork(campaignId,file);
      setArtPreview(result.image);
    },'Campaign artwork saved and shared with players.');
  };
  const remove=()=>run(async()=>{
    await api.removeArtwork(campaignId);
    setArtPreview('');
  },'Campaign artwork removed.');
  return <section className={styles.shell} data-testid="site-gm-campaign-management">
    <SurfacePanel className={styles.panel} as="section">
      <header className={styles.head}><div><h2>Campaign Manager</h2>
        <BodyText muted>Identity, invitation, location, party capacity and shared artwork.</BodyText>
      </div></header>
      {error?<p role="alert" className={styles.notice}>{error}</p>:null}
      {message?<p role="status" className={styles.notice}>{message}</p>:null}
      <p>Unique Campaign Number: <strong data-testid="site-gm-campaign-code">
        {campaign.ucn||'Not generated'}</strong></p>
      <BodyText muted>Share this number with players joining through Campaign Forge.</BodyText>
      <div className={styles.fields}>
        <label>Campaign Name<input maxLength={160} value={draft.name}
          onChange={e=>update('name',e.target.value)}/></label>
        <label>Current Location<input maxLength={300} value={draft.location}
          onChange={e=>update('location',e.target.value)}/></label>
        <label>Player Limit<input inputMode="numeric" value={draft.playerLimit}
          onChange={e=>update('playerLimit',e.target.value)}/></label>
      </div>
      <label>Campaign Synopsis<textarea rows={5} maxLength={20000} value={draft.description}
        onChange={e=>update('description',e.target.value)}/></label>
      <div className={styles.artwork}>
        {artPreview?<img src={artPreview} alt="Campaign artwork preview"/>:
          <p>No campaign artwork uploaded.</p>}
        <div className={styles.artworkActions}>
          <label>Upload / Replace Campaign Image
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={busy} onChange={upload}/></label>
          {artPreview?<button type="button" disabled={busy} onClick={remove}>
            Remove Campaign Image</button>:null}
          <small>PNG, JPG, WEBP or GIF, up to 8 MB. Visible to linked players.</small>
        </div>
      </div>
      <div className={styles.actions}><button type="button" disabled={busy||!draft.name.trim()}
        onClick={()=>run(()=>api.updateCampaignDetails(campaignId,draft),
          'Campaign settings saved to Firebase.')}>Save Campaign Settings</button></div>
    </SurfacePanel>
    <SurfacePanel className={styles.panel} as="section">
      <header className={styles.head}><div><h2>Linked Accounts &amp; Characters</h2>
        <BodyText muted>Campaign membership and the current session.</BodyText></div></header>
      <div className={styles.fields}>
        <p>Session: <strong>{session.status||'idle'}</strong></p>
        <p>Players: <strong>{campaign.playerCount??0}</strong></p>
        <p>GMs: <strong>{campaign.gmCount??1}</strong></p>
        <p>Linked Characters: <strong>{party.length}</strong></p>
      </div>
      <p>Campaign role: {campaign.role} · Membership schema:
        {' v'+String(campaign.membershipSchemaVersion||1)}</p>
      <div className={styles.ledger}>{party.map(member=><article className={styles.record}
        key={member.id}>
        <strong>{member.name}</strong><small>{member.className||'Character'} · Level {member.level}</small>
        <span>HP {member.hp?.join(' / ')||'—'} · SP {member.sp?.join(' / ')||'—'}
          {' · MP '+(member.mp?.join(' / ')||'—')}</span>
      </article>)}</div>
      {!party.length?<BodyText muted>Characters appear here once linked to this campaign.</BodyText>:null}
    </SurfacePanel>
  </section>;
}
