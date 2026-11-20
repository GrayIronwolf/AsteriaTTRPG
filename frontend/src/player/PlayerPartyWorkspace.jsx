import React,{useEffect,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {PARTY_ORGANIZATION_TYPES} from './playerPartyModel.mjs';
import styles from '../pages/PlayerDashboardPage.module.css';

/** Restored Party workspace, routed through the one authenticated Firebase app. */
export function PlayerPartyWorkspace({api,campaignId,characterId,owned=false}){
  const [data,setData]=useState(null),[error,setError]=useState(''),
    [message,setMessage]=useState(''),[busy,setBusy]=useState(false),
    [section,setSection]=useState('overview'),[chatText,setChatText]=useState(''),
    [notes,setNotes]=useState(''),[notesBaseline,setNotesBaseline]=useState(''),
    [notesDirty,setNotesDirty]=useState(false),
    [organizationName,setOrganizationName]=useState(''),
    [organizationType,setOrganizationType]=useState('Adventure Party');
  useEffect(()=>{
    setData(null);setError('');setMessage('');setBusy(false);
    setSection('overview');setChatText('');setNotes('');setNotesBaseline('');
    setNotesDirty(false);
    let active=true;
    const unsubscribe=api.watchParty(campaignId,characterId,value=>{
      if(active)setData(value);
    },reason=>{if(active){setData(null);setError(reason?.message||'Party access is unavailable.');}});
    return ()=>{active=false;unsubscribe();};
  },[api,campaignId,characterId]);
  useEffect(()=>{
    if(!data||notesDirty)return;
    const saved=data.sharedNotes||'';
    setNotes(saved);setNotesBaseline(saved);
  },[data?.sharedNotes,notesDirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const editable=owned&&data?.owner&&data?.editable===true;
  const run=async(work,success)=>{
    if(busy||!editable)return {ok:false};
    setBusy(true);setError('');setMessage('');
    try{const result=await work();
      if(result?.ok!==true)throw Error(result?.error||'Party action rejected.');
      setMessage(success);return result;
    }catch(e){setError(e?.message||'Party action failed.');return {ok:false};}
    finally{setBusy(false);}
  };
  const send=async event=>{
    event.preventDefault();
    if(!chatText.trim())return;
    const result=await run(()=>api.sendPartyMessage(campaignId,characterId,chatText),'Message sent.');
    if(result.ok)setChatText('');
  };
  const saveNotes=async event=>{
    event.preventDefault();
    const result=await run(()=>api.updatePartyNotes(campaignId,characterId,notes,notesBaseline),
      'Shared notes saved.');
    if(result.ok){setNotesBaseline(notes);setNotesDirty(false);}
  };
  const create=async event=>{
    event.preventDefault();
    const result=await run(()=>api.createPartyOrganization(campaignId,characterId,{
      name:organizationName,type:organizationType}),'Organization created.');
    if(result.ok){setOrganizationName('');if(result.organization?.id)setSection(result.organization.id);}
  };
  const organizations=data?.organizations||[];
  const current=organizations.find(item=>item.id===section);
  const members=data?.members||[];
  const present=new Set(data?.presence||[]);
  const memberCards=items=><div className={styles.partyMembers}>
    {items.map(member=><article key={member.id} className={styles.partyMember}>
      {member.image?<img src={member.image} alt="" loading="lazy"/>:
        <span aria-hidden="true">{member.name.charAt(0)||'?'}</span>}
      <div><strong>{member.name}</strong>
        <p>{member.klass||'Adventurer'} · Level {member.level}</p>
        {member.hp?<p>HP {member.hp[0]} / {member.hp[1]}</p>:null}
        <small>{present.has(member.id)?'In session':'Away'}</small>
      </div>
    </article>)}
  </div>;
  return <SurfacePanel as="section" className={styles.panel} data-testid="site-player-party">
    <h3>Party &amp; Organizations</h3>
    <nav aria-label="Party sections" className={styles.partyTabs}>
      <button type="button" aria-pressed={section==='overview'}
        onClick={()=>setSection('overview')}>Party Overview</button>
      <button type="button" aria-pressed={section==='create'}
        onClick={()=>setSection('create')}>Form Organization</button>
      {organizations.map(item=><button type="button" key={item.id}
        aria-pressed={section===item.id} onClick={()=>setSection(item.id)}>
        {item.name}</button>)}
    </nav>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
    {!data&&!error?<BodyText muted>Verifying party membership and live session…</BodyText>:null}
    {data&&section==='overview'?<div className={styles.partyWorkspace}>
      <div className={styles.partySection}>
        <h4>Party Members</h4>
        {members.length?memberCards(members):<BodyText muted>No characters have joined this campaign.</BodyText>}
      </div>
      <form onSubmit={saveNotes} className={styles.partySection}>
        <h4>Shared Notes</h4>
        <label>Party notes<textarea rows={8} value={notes} maxLength={20000}
          disabled={!editable||busy}
          onChange={event=>{setNotes(event.target.value);setNotesDirty(true);}}/></label>
        {notesDirty&&notesBaseline!==data.sharedNotes?
          <p role="alert">Shared notes changed in another session. Reload before saving.</p>:null}
        <div className={styles.partyActions}>
          <button type="submit" disabled={!editable||busy||!notesDirty||
            notesBaseline!==data.sharedNotes}>Save Shared Notes</button>
          <button type="button" disabled={!editable||busy||!notesDirty}
            onClick={()=>{setNotes(data.sharedNotes);setNotesBaseline(data.sharedNotes);
              setNotesDirty(false);}}>Reset</button>
        </div>
      </form>
      <div className={styles.partySection}>
        <h4>Live Party Chat</h4>
        <div className={styles.partyChat} aria-label="Party messages">
          {data.chat.map(row=><article key={row.id}>
            <header><strong>{row.characterName}</strong>
              {row.at?<time dateTime={new Date(row.at).toISOString()}>
                {new Date(row.at).toLocaleTimeString()}</time>:null}
            </header><p>{row.text}</p>
          </article>)}
          {!data.chat.length?<BodyText muted>No party messages yet.</BodyText>:null}
        </div>
        <form onSubmit={send} className={styles.partyActions}>
          <label>Message the party<input type="text" value={chatText} maxLength={2000}
            disabled={!editable||busy} placeholder="Message the party…"
            onChange={event=>setChatText(event.target.value)}/></label>
          <button type="submit" disabled={!editable||busy||!chatText.trim()}>Send</button>
        </form>
      </div>
    </div>:null}
    {data&&section==='create'?<form onSubmit={create} className={styles.partySection}>
      <h4>Form a Party or Organization</h4>
      <p>Create an adventure party, business, guild or other campaign organization.</p>
      <label>Organization Type<select value={organizationType} disabled={!editable||busy}
        onChange={event=>setOrganizationType(event.target.value)}>
        {PARTY_ORGANIZATION_TYPES.map(type=><option key={type} value={type}>{type}</option>)}
      </select></label>
      <label>Organization Name<input value={organizationName} maxLength={120}
        disabled={!editable||busy} onChange={event=>setOrganizationName(event.target.value)}/></label>
      <button type="submit" disabled={!editable||busy||!organizationName.trim()}>
        Create Organization</button>
    </form>:null}
    {data&&current?<div className={styles.partySection}>
      <h4>{current.name}</h4><p>{current.type} · {current.memberCharacterIds.length} member(s)</p>
      {memberCards(members.filter(member=>current.memberCharacterIds.includes(member.id)))}
      <h4>Organization Notes</h4><p>{current.notes||'No organization notes recorded.'}</p>
    </div>:null}
    {data&&!editable?<BodyText muted>Party changes require your linked character and an active campaign session.</BodyText>:null}
  </SurfacePanel>;
}
