import React,{useEffect,useRef,useState} from 'react';
import {useAppServices} from '../app/AppServices.jsx';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {PageLayout} from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {Eyebrow,Heading,BodyText} from '../components/ui/Typography.jsx';
import {campaignArtworkFileError} from '../../../src/state/campaignArtwork.mjs';
import {newCampaignDraft,editCampaignDraft,ACCESS_FIELDS,PLAYER_SETTINGS} from '../campaigns/campaignForgeModel.mjs';
import styles from './CampaignForgePage.module.css';
import {CampaignConnectionManager} from '../campaigns/CampaignConnectionManager.jsx';

const LABELS={dashboard:'Dashboard',inventory:'Inventory',spells:'Spells',
 journal:'Journal',quests:'Quests',notes:'Shared Notes',
 allowPlayerCreateCharacter:'Allow players to forge characters',
 allowPlayerLinkCharacter:'Allow players to request character links'};
export function CampaignForgePage(){
 const {session}=useAuth(),services=useAppServices();
 const api=services.get('campaigns');
 const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
 const [campaigns,setCampaigns]=useState([]),[editing,setEditing]=useState(null);
 const [draft,setDraft]=useState(newCampaignDraft),[mode,setMode]=useState('list');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [excluded,setExcluded]=useState(0),[artwork,setArtwork]=useState(null);
 const seq=useRef(0),owner=useRef(uid);owner.current=uid;
 useEffect(()=>{
  const token=++seq.current;let active=true;
  setCampaigns([]);setEditing(null);setDraft(newCampaignDraft());
  setMode('list');setLoading(true);setBusy(false);setError('');setMessage('');setExcluded(0);setArtwork(null);
  if(!uid||!api){setLoading(false);return undefined;}
  api.list().then(data=>{
   if(!active||seq.current!==token||owner.current!==uid)return;
   setCampaigns(data.items);setExcluded(data.excluded);
  }).catch(()=>{
   if(active&&seq.current===token)setError('Could not verify your saved campaigns. Please retry.');
  }).finally(()=>{if(active&&seq.current===token)setLoading(false);});
  return ()=>{active=false;++seq.current;};
 },[uid,api]);
 const refresh=async()=>{
  if(!uid||!api)return;
  const token=seq.current;setLoading(true);setError('');
  try{const response=await api.list();
   if(seq.current===token&&owner.current===uid){
    setCampaigns(response.items);setExcluded(response.excluded);
   }
  }catch{if(seq.current===token)setError('Could not verify saved campaigns.');}
  finally{if(seq.current===token)setLoading(false);}
 };
 const back=()=>{setMode('list');setDraft(newCampaignDraft());setEditing(null);setArtwork(null);setError('');};
 const start=()=>{setMode('new');setDraft(newCampaignDraft());setEditing(null);setArtwork(null);setError('');setMessage('');};
 const edit=async id=>{
  if(busy)return;
  const token=seq.current;setBusy(true);setError('');setMessage('');
  try{
   const data=await api.load(id);
   if(seq.current!==token||owner.current!==uid)return;
   setDraft(editCampaignDraft(data));setEditing(data);setMode('edit');setArtwork(null);
  }catch{if(seq.current===token)setError('This campaign could not be verified for editing.');}
  finally{if(seq.current===token)setBusy(false);}
 };
 const save=async event=>{
  event.preventDefault();
  if(busy)return;
  const token=seq.current,account=uid;
  setBusy(true);setError('');setMessage('');
  try{
   let result;
   if(mode==='new'){
    result=await api.create(draft);
   }else{
    await api.save(editing.id,draft,editing.updatedAt||null);
    result=await api.load(editing.id);
   }
   if(seq.current!==token||owner.current!==account)return;
   if(artwork){
    try{await api.uploadArtwork(result.id,artwork);}
    catch(err){setMessage('Campaign saved, but artwork upload failed: '+(err?.message||'Try again from Edit Campaign.'));}
   }
   if(seq.current!==token||owner.current!==account)return;
   if(!artwork)setMessage(mode==='new'?'Campaign created in Firebase.':'Campaign settings saved.');
   setMode('list');setArtwork(null);setEditing(null);await refresh();
  }catch(err){
   if(seq.current===token){
    const note=err?.message||'Campaign could not be saved.';
    setError(note+(mode==='new'?' If a campaign number was allocated, use Refresh to recover that campaign; do not submit a duplicate.':''));
   }
  }finally{if(seq.current===token)setBusy(false);}
 };
 const remove=async()=>{
  if(!editing||busy||!editing.image)return;
  const token=seq.current;setBusy(true);setError('');
  try{
   await api.removeArtwork(editing.id);
   if(token!==seq.current||owner.current!==uid)return;
   const record=await api.load(editing.id);
   if(token!==seq.current)return;
   setEditing(record);setMessage('Campaign artwork removed.');await refresh();
  }catch(err){if(token===seq.current)setError(err.message||'Could not remove campaign artwork.');}
  finally{if(token===seq.current)setBusy(false);}
 };
 const field=(key,label)=> <label className={styles.field} key={key}>{label}
  {key==='description'?<textarea value={draft.description} rows={5} maxLength={4000}
   onChange={e=>setDraft(old=>({...old,description:e.target.value}))}/>:
  <input type={key==='partySize'?'number':'text'} required maxLength={key==='name'?120:undefined}
   min={key==='partySize'?1:undefined} max={key==='partySize'?12:undefined}
   value={draft[key]} onChange={e=>setDraft(old=>({...old,[key]:key==='partySize'?
    (e.target.value===''?'':Number(e.target.value)):e.target.value}))}/>}
 </label>;
 if(!uid||!api)return <PageLayout as="section" width="reading" labelledBy="campaign-forge-title"
  data-testid="site-campaign-forge-page">
  <Heading id="campaign-forge-title">Campaign Forge</Heading>
  <BodyText>{session.status==='authenticated'?
   'Verify your account profile before accessing private campaigns.':
   'Sign in to create or manage a campaign.'}</BodyText>
  <CrystalButton href="#/account/login">Login</CrystalButton>
 </PageLayout>;
 return <PageLayout as="section" width="wide" className={styles.page}
  labelledBy="campaign-forge-title" data-testid="site-campaign-forge-page">
  <Eyebrow>Game Master Workspace</Eyebrow>
  <Heading id="campaign-forge-title">Campaign Forge</Heading>
  {error&&<p role="alert" className={styles.notice} data-testid="site-campaign-error">{error}</p>}
  {message&&<p role="status" className={styles.notice} data-testid="site-campaign-message">{message}</p>}
  {loading&&<BodyText>Checking your saved campaigns…</BodyText>}
  {!loading&&mode==='list'&&<SurfacePanel className={styles.panel}>
   <div className={styles.heading}>
    <h2>My Campaigns</h2>
    <div className={styles.actions}>
     <CrystalButton onClick={refresh} disabled={busy}>Refresh</CrystalButton>
     <CrystalButton variant="primary" data-testid="site-campaign-create" onClick={start}>Forge Campaign</CrystalButton>
    </div>
   </div>
   {excluded>0&&<BodyText muted>{excluded} unverified campaign(s) were excluded.</BodyText>}
   {campaigns.length===0?<BodyText>No owned campaigns were found.</BodyText>:
    <div className={styles.cards}>{campaigns.map(row=><article className={styles.card} key={row.id}>
     {row.image&&<img className={styles.cover} src={row.image} alt="" loading="lazy"/>}
     <h3>{row.name}</h3>
     <p>{row.description||'No description yet.'}</p>
     <small>UCN: {row.ucn||'Unavailable'} · Party capacity: {row.partySize}</small>
     <small>Membership: {row.membershipSchemaVersion===2?'Canonical v2':'Legacy v1'}</small>
     <CrystalButton onClick={()=>edit(row.id)} disabled={busy}>Manage Campaign</CrystalButton>
     {services.has('gameplay')&&<CrystalButton href={'#/react/gm/'+encodeURIComponent(row.id)}
       data-testid="site-campaign-gm-dashboard">Open GM Dashboard</CrystalButton>}
    </article>)}</div>}
   <BodyText muted>New secure campaign invitation workflows are available only for
    server-upgraded v2 campaigns. Existing legacy memberships remain unchanged.</BodyText>
   {api.connections?.availability().enabled&&<CrystalButton href="#/campaign-invitation">
    Find or Join Campaign</CrystalButton>}
  </SurfacePanel>}
  {!loading&&mode!=='list'&&<SurfacePanel as="section" className={styles.panel}>
   <div className={styles.heading}>
    <h2>{mode==='new'?'Forge New Campaign':'Manage Campaign'}</h2>
    <CrystalButton onClick={back} disabled={busy}>Back to Campaigns</CrystalButton>
   </div>
   <form className={styles.form} onSubmit={save} data-testid="site-campaign-form">
    <div className={styles.fields}>
     {field('name','Campaign Name')}
     {field('partySize','Party Size (1–12)')}
    </div>
    {field('description','Campaign Description')}
    {mode==='edit'&&<dl className={styles.identity}>
     <dt>Campaign ID</dt><dd>{editing?.id}</dd>
     <dt>Permanent UCN</dt><dd>{editing?.ucn}</dd>
     <dt>Membership Schema</dt><dd>{editing?.membershipSchemaVersion===2?'v2':'Legacy v1'}</dd>
    </dl>}
    <section className={styles.section}>
     <h3>Player Access</h3>
     <p>Campaigns stay private and require an invitation. Changing how people join is handled in Phase 5.3.</p>
     <div className={styles.fields}>{PLAYER_SETTINGS.map(key=><label key={key} className={styles.check}>
      <input type="checkbox" checked={draft.settings[key]}
       onChange={e=>setDraft(old=>({...old,settings:{...old.settings,[key]:e.target.checked}}))}/>
      {LABELS[key]}
     </label>)}</div>
    </section>
    <section className={styles.section}>
     <h3>Campaign Features</h3>
     <div className={styles.fields}>{ACCESS_FIELDS.map(key=><label key={key} className={styles.check}>
      <input type="checkbox" checked={draft.access[key]}
       onChange={e=>setDraft(old=>({...old,access:{...old.access,[key]:e.target.checked}}))}/>
      {LABELS[key]}
     </label>)}</div>
    </section>
    <section className={styles.section}>
     <h3>Campaign Artwork</h3>
     {mode==='edit'&&editing?.image&&<img className={styles.artPreview}
      src={editing.image} alt="Current campaign artwork"/>}
     <label className={styles.field}>Upload or Replace Artwork
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
       onChange={e=>{
        const file=e.target.files?.[0]||null;
        if(file){const issue=campaignArtworkFileError(file);
         if(issue){setError(issue);e.target.value='';setArtwork(null);return;}}
        setError('');setArtwork(file);
       }}/>
     </label>
     <BodyText muted>PNG, JPG, WEBP or GIF, up to 8 MB. Uploaded to existing private campaign Firebase Storage.</BodyText>
     {mode==='edit'&&editing?.image&&<CrystalButton disabled={busy} onClick={remove}>Remove Artwork</CrystalButton>}
    </section>
    <div className={styles.actions}>
     <CrystalButton type="submit" variant="primary" disabled={busy}
      data-testid="site-campaign-save">{busy?'Saving…':mode==='new'?'Create Campaign':'Save Settings'}</CrystalButton>
     <CrystalButton onClick={back} disabled={busy}>Cancel</CrystalButton>
    </div>
   </form>
   {mode==='edit'&&<CampaignConnectionManager campaign={editing} api={api} uid={uid}/>}
  </SurfacePanel>}
 </PageLayout>;
}
