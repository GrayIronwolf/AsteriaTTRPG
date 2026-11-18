import React,{useEffect,useRef,useState} from 'react';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {safeOwnedChoices,activeCampaignMember} from './forgeIntegrationModel.mjs';
import styles from './CampaignConnectionManager.module.css';

/** A player's saved character stays private until an owner-authorized
 * backend approval imports it into the campaign. No browser-side clone.
 */
export function PlayerCharacterLink({campaign,joinStatus,api,characters,uid}){
 const [choices,setChoices]=useState([]);
 const [chosen,setChosen]=useState(''),[status,setStatus]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0);
 const enabled=Boolean(uid&&api?.availability?.().forgeEnabled&&characters&&
   campaign?.joinMode==='request'&&activeCampaignMember(joinStatus));
 useEffect(()=>{
  const key=++generation.current;
  setChoices([]);setChosen('');setStatus(null);setError('');setMessage('');
  if(!enabled)return undefined;
  characters.list().then(result=>{
   if(generation.current!==key)return;
   setChoices(safeOwnedChoices(result.items,uid));
  }).catch(()=>{if(generation.current===key)setError('Unable to verify your owned characters.');});
  return ()=>{++generation.current;};
 },[campaign?.id,uid,enabled,characters]);
 const run=async(task)=>{
  if(busy||!chosen)return;
  const key=generation.current;setBusy(true);setError('');setMessage('');
  try{await task(key);}
  catch(error){if(generation.current===key)setError(error.message||'Character linking was denied.');}
  finally{if(generation.current===key)setBusy(false);}
 };
 const verify=()=>run(async key=>{
  const response=await api.characterLinkStatus(campaign.id,chosen);
  if(key===generation.current)setStatus(response);
 });
 const request=()=>run(async key=>{
  // Re-read the record before a mutation: membership and rules may have
  // changed since the UCN approval and character selection.
  const current=await api.characterLinkStatus(campaign.id,chosen);
  if(!['none','declined'].includes(current.status))
   throw Error('This character already has a link request. Refresh the status.');
  const result=await api.requestCharacterLink(campaign.id,chosen);
  if(key===generation.current){setStatus(result);setMessage(
   result.status==='pending'?'Character link requested. Your GM must approve it.':'Character link status updated.'
  );}
 });
 const withdraw=(action)=>run(async key=>{
  if(!status||status.sourceCharacterId!==chosen)
   throw Error('Refresh the character link status before changing it.');
  await api.cancelOwnCharacterLink(campaign.id,status,action);
  const current=await api.characterLinkStatus(campaign.id,chosen);
  if(key===generation.current){
   setStatus(current);
   setMessage(action==='cancel'?'Pending character request withdrawn.':
    'Character unlinked; gameplay history is retained by the campaign backend.');
  }
 });
 if(!enabled)return null;
 return <section className={styles.section} data-testid="site-player-character-link">
  <h3>Link an Owned Character</h3>
  <BodyText>The GM must approve your saved character before it can join the party. Existing character records are never replaced by this request.</BodyText>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}
  {message&&<p role="status" className={styles.notice}>{message}</p>}
  <label className={styles.field}>Your saved characters
   <select value={chosen} disabled={busy} data-testid="site-character-link-select"
    onChange={event=>{++generation.current;setChosen(event.target.value);setStatus(null);setError('');}}>
    <option value="">Select a verified character</option>
    {choices.map(item=><option key={item.id} value={item.id}>
     {item.name}{item.linked?' (linked elsewhere or previously)':''}
    </option>)}
   </select>
  </label>
  {!choices.length&&<BodyText muted>No verified saved characters. Create one in Character Forge first.</BodyText>}
  <div className={styles.actions}>
   <CrystalButton disabled={busy||!chosen} data-testid="site-character-link-status"
    onClick={verify}>Check Link Status</CrystalButton>
   {status&&<CrystalButton disabled={busy||!['none','declined'].includes(status.status)}
    data-testid="site-character-link-request" onClick={request}>Request Character Link</CrystalButton>}
   {status?.status==='pending'&&<CrystalButton disabled={busy}
    onClick={()=>withdraw('cancel')}>Withdraw Pending Request</CrystalButton>}
   {['approved','inactive'].includes(status?.status)&&
    <CrystalButton disabled={busy} onClick={()=>withdraw('unlink')}>Unlink My Character</CrystalButton>}
  </div>
  {status?.status==='approved'&&status.campaignCharacterId&&
   <CrystalButton href={'#/react/character/'+encodeURIComponent(campaign.id)+'/'+
     encodeURIComponent(status.campaignCharacterId)} data-testid="site-player-linked-dashboard">
     Open Player Dashboard
   </CrystalButton>}
  {status&&<BodyText>Character status: {status.status}. {status.status==='pending'?
   'Awaiting a GM decision.':status.status==='approved'?
   'Approved by the GM.':status.status==='inactive'?
   'Inactive until the GM restores it.':''}</BodyText>}
  <CrystalButton href="#/character-forge">Open Character Forge</CrystalButton>
 </section>;
}
