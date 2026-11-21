import React,{useEffect,useState} from 'react';
import {useCampaignStream} from './CampaignMapWorkspace.jsx';
import {
  AUDIENCE_REVEAL_TYPES,audienceRevealUid,gmAudienceRevealRows,
  validateAudienceRevealAction
} from '../../../src/state/presentationAudienceRevealModel.mjs';
import styles from './GMAudienceRevealManager.module.css';

/** GM-only explicit reveal. Text never enters a shared scene or media library. */
export function GMAudienceRevealManager({api,campaignId,control}){
  const revealStream=useCampaignStream(api,'watchGMAudienceReveals',[campaignId]);
  const hybrid=useCampaignStream(api,'watchGMHybridSession',[campaignId]);
  const [audience,setAudience]=useState('member');
  const [uid,setUid]=useState('');
  const [title,setTitle]=useState('');
  const [body,setBody]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{
    setAudience('member');setUid('');setTitle('');setBody('');
    setMessage('');setError('');
  },[campaignId]);
  const scene=control?.data;
  const validScene=!control.loading&&!control.error&&
    scene?.scene!=='blank'&&Number.isSafeInteger(scene?.revision)&&
    scene.revision>=1;
  const restrictedAvailable=hybrid.data?.session?.status==='open';
  const accepted=(hybrid.data?.grants||[]).filter(grant=>
    grant.status==='active'&&
    grant.epoch===hybrid.data?.session?.epoch);
  const rows=gmAudienceRevealRows(revealStream.data||[],scene);
  const send=async action=>{
    if(busy||control.loading||control.error||revealStream.loading||
      revealStream.error)return;
    setBusy(true);setError('');setMessage('');
    try{
      const validated=validateAudienceRevealAction(action);
      const response=await api.manageAudienceReveal(campaignId,validated);
      if(response.ok!==true)throw Error(response.error||'Reveal was not updated.');
      setMessage(action.type==='show'
        ?'Reveal published only to this recipient for the current scene.'
        :'Reveal cleared for the selected recipient.');
    }catch(problem){setError(problem?.message||'Reveal could not be updated.');}
    finally{setBusy(false);}
  };
  const preview={
    type:'show',audience,targetUid:uid,sceneRevision:scene?.revision,
    title,body
  };
  let ready=false;
  try{validateAudienceRevealAction(preview);ready=true;}catch{/* incomplete */}
  const disabled=busy||!validScene||!!revealStream.error||revealStream.loading;
  return <section className={styles.panel} data-testid="site-gm-audience-reveals">
    <h3>Audience-Specific Reveals</h3>
    <p>Show a private text message to one authenticated account at a time.
      This does not share the message with other players, remote guests or
      the public presentation. Media files and GM notes are not supported.</p>
    <p role="status">Current published scene:
      {' '}{scene?.scene||'unknown'} · Revision {scene?.revision||0}</p>
    {control.error?<p role="alert">{control.error}</p>:null}
    {revealStream.error?<p role="alert">{revealStream.error}</p>:null}
    {hybrid.error?<p role="alert">{hybrid.error}</p>:null}
    <div className={styles.fields}>
      <label>Audience
        <select value={audience} disabled={disabled}
          onChange={event=>{setAudience(event.target.value);setUid('');}}>
          {AUDIENCE_REVEAL_TYPES.map(id=><option value={id} key={id}>
            {id==='member'?'Campaign player':'Restricted invited viewer'}
          </option>)}
        </select>
      </label>
      <label>Recipient's exact account UID
        <input value={uid} maxLength={128} disabled={disabled}
          placeholder="Verified Firebase account UID"
          onChange={event=>setUid(event.target.value.trim())}/>
      </label>
      {audience==='restricted'?<label>Accepted restricted viewers
        <select value="" disabled={disabled||hybrid.loading||!!hybrid.error}
          onChange={event=>setUid(event.target.value)}>
          <option value="">Select a signed-in invitee UID</option>
          {accepted.map(grant=><option value={grant.uid} key={grant.uid}>
            {grant.uid}</option>)}
        </select>
      </label>:null}
      <label>Reveal title
        <input value={title} maxLength={120} disabled={disabled}
          onChange={event=>setTitle(event.target.value)}/>
      </label>
      <label>Reveal text
        <textarea value={body} maxLength={380} rows={3} disabled={disabled}
          onChange={event=>setBody(event.target.value)}/>
      </label>
    </div>
    {!validScene?<p role="status">Publish a non-blackout scene before revealing
      individual content.</p>:null}
    {audience==='restricted'&&!restrictedAvailable?<p role="status">Open a
      restricted viewer session and obtain acceptance before sending this
      audience a reveal.</p>:null}
    <div className={styles.actions}>
      <button type="button" disabled={disabled||!ready||
        (audience==='restricted'&&!restrictedAvailable)}
        onClick={()=>void send(preview)}>Reveal to Recipient</button>
      <button type="button" disabled={busy||!audienceRevealUid(uid)}
        onClick={()=>void send({type:'clear',audience,targetUid:uid})}>
        Clear Selected Recipient</button>
    </div>
    <h4>Current Scene Reveals</h4>
    {revealStream.loading?<p role="status">Checking private reveal list…</p>:null}
    {rows.length?<ul className={styles.rows}>
      {rows.map(row=><li key={row.audience+':'+row.targetUid}>
        <span>{row.audience==='member'?'Player':'Restricted viewer'}:
          {' '}{row.targetUid} · {row.title}</span>
        <button type="button" disabled={busy} onClick={()=>void send({
          type:'clear',audience:row.audience,targetUid:row.targetUid
        })}>Clear</button>
      </li>)}
    </ul>:<p>No current-scene audience reveals.</p>}
    {message?<p role="status">{message}</p>:null}
    {error?<p role="alert">{error}</p>:null}
    <p>Reveal text is replaced on the next scene revision and is inaccessible
      after blackout, revoked membership or expired invitation. Clear it
      explicitly whenever you no longer want the current scene to show it.</p>
  </section>;
}
