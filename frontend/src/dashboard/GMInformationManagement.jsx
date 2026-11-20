import React,{useEffect,useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {informationScopes} from '../../../src/state/campaignInformation.mjs';
import {blankGMInformation,validateGMAnnouncement} from './gmStoryManagementModel.mjs';
import styles from './GMQuestManagement.module.css';

export function GMInformationManagement({api,campaignId,campaign,workspace={},party=[]}){
  const [kind,setKind]=useState('news');
  const [draft,setDraft]=useState(()=>blankGMInformation('news',campaign,''));
  const [search,setSearch]=useState(''),[busy,setBusy]=useState(false),
    [error,setError]=useState(''),[message,setMessage]=useState('');
  const [title,setTitle]=useState(''),[body,setBody]=useState('');
  const [recipients,setRecipients]=useState([]);
  const scopes=useMemo(()=>informationScopes(campaign),[campaign]);
  const change=(key,value)=>setDraft(prev=>({...prev,[key]:value}));
  const clear=()=>setDraft(blankGMInformation(kind,campaign,''));
  useEffect(()=>{setDraft(blankGMInformation(kind,campaign,''));setError('');},
    [kind,campaignId]);
  const records=Array.isArray(workspace.world?.[kind])?workspace.world[kind]:[];
  const filtered=records.filter(row=>[row.title,row.description,row.scope,row.location,row.source]
    .join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const run=async(action,success,onSuccess)=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{const result=await action();onSuccess?.(result);setMessage(success);}
    catch(e){setError(e?.message||'Campaign information action failed.');}
    finally{setBusy(false);}
  };
  const update=()=>run(()=>api.saveGMInformation(campaignId,kind,{
    ...draft,id:draft.id||'info-'+crypto.randomUUID()}),
    draft.published?'Entry published to players.':'Private draft saved.',clear);
  const send=async()=>{
    let payload;
    try{payload=validateGMAnnouncement({title,message:body,recipients});}
    catch(e){setError(e.message);return;}
    await run(async()=>{
      const delivered=[],failed=[];
      for(const id of payload.recipients){
        try{await api.sendGMNotification(campaignId,id,payload);delivered.push(id);}
        catch(e){failed.push({id,message:e.message||'Delivery rejected'});}
      }
      if(failed.length){
        const summary=failed.map(row=>
          (party.find(character=>character.id===row.id)?.name||row.id)+': '+row.message).join('; ');
        throw Error(delivered.length+' delivered, '+failed.length+' failed. '+summary);
      }
      return {delivered:delivered.length};
    },'Announcement delivered to '+payload.recipients.length+' character(s).',
    ()=>{setTitle('');setBody('');setRecipients([]);});
  };
  return <section className={styles.shell} data-testid="site-gm-information-management">
    <SurfacePanel className={styles.panel} as="section">
      <header className={styles.head}><div><h2>Campaign News &amp; Events</h2>
        <BodyText muted>Draft privately or publish to connected Player Dashboards.</BodyText>
      </div></header>
      {error?<p role="alert" className={styles.notice}>{error}</p>:null}
      {message?<p role="status" className={styles.notice}>{message}</p>:null}
      <div className={styles.actions}>{[['news','News'],['events','Events']].map(([id,label])=>
        <button type="button" key={id} aria-pressed={kind===id}
          onClick={()=>setKind(id)}>{label}</button>)}</div>
      <div className={styles.fields}>
        <label>Title<input maxLength={160} value={draft.title}
          onChange={e=>change('title',e.target.value)}/></label>
        <label>Scope<select value={draft.scope} onChange={e=>{
          const scope=e.target.value;
          setDraft(prev=>({...prev,scope,location:scopes.find(s=>s.scope===scope)?.location||''}));
        }}>{scopes.map(s=><option key={s.scope} value={s.scope}>{s.scope}</option>)}</select></label>
        <label>Location<input maxLength={160} value={draft.location||''}
          onChange={e=>change('location',e.target.value)}/></label>
      </div>
      <label>Description<textarea rows={6} maxLength={12000} value={draft.description}
        onChange={e=>change('description',e.target.value)}/></label>
      {kind==='news'?<label>Source<input maxLength={160} value={draft.source||''}
        placeholder="Newspaper, town crier, or rumour"
        onChange={e=>change('source',e.target.value)}/></label>:<>
        <div className={styles.fields}>
          <label>Status<select value={draft.status||'Upcoming'} onChange={e=>
            change('status',e.target.value)}>
            {['Upcoming','Ongoing','Completed','Cancelled'].map(x=><option key={x}>{x}</option>)}
          </select></label>
          <label>In-world Start<input maxLength={200} value={draft.start||''}
            onChange={e=>change('start',e.target.value)}/></label>
          <label>In-world End<input maxLength={200} value={draft.end||''}
            onChange={e=>change('end',e.target.value)}/></label>
        </div>
      </>}
      <label className={styles.check}><input type="checkbox" checked={draft.published===true}
        onChange={e=>change('published',e.target.checked)}/>
        Published to players in this campaign</label>
      <div className={styles.actions}>
        <button type="button" disabled={busy||!draft.title.trim()}
          onClick={update}>{draft.published?'Save & Publish':'Save Draft'}</button>
        <button type="button" disabled={busy} onClick={clear}>New Entry</button>
      </div>
      <label>Search News &amp; Events<input type="search" value={search}
        onChange={e=>setSearch(e.target.value)}/></label>
      <div className={styles.ledger}>{filtered.map(row=><article className={styles.record} key={row.id}>
        <header className={styles.head}><h3>{row.title||row.name}</h3>
          <small>{row.published?'Published':'Private Draft'}{kind==='events'?' · '+row.status:''}</small>
        </header>
        <p>{row.description||row.note||''}</p>
        <small>{[row.scope,row.location,row.source].filter(Boolean).join(' · ')}</small>
        {row.start||row.end?<small>{[row.start,row.end].filter(Boolean).join(' – ')}</small>:null}
        <div className={styles.actions}><button type="button" disabled={busy}
          onClick={()=>{setDraft({...blankGMInformation(kind,campaign,''),...row});setMessage('Editing '+row.title);}}>
          Edit</button></div>
      </article>)}</div>
      {!filtered.length?<BodyText muted>No entries match the current search.</BodyText>:null}
    </SurfacePanel>
    <SurfacePanel className={styles.panel} as="section">
      <header className={styles.head}><div><h2>Send Player Announcement</h2>
        <BodyText muted>Send a private notification to selected linked characters using the existing server action.</BodyText>
      </div></header>
      <div className={styles.actions}>
        <button type="button" disabled={busy} onClick={()=>setRecipients(party.map(row=>row.id))}>
          Select All Players</button>
        <button type="button" disabled={busy} onClick={()=>setRecipients([])}>Clear</button>
        <span>{recipients.length} selected</span>
      </div>
      <div className={styles.recipients}>{party.map(row=><label key={row.id}
        className={styles.check}><input type="checkbox" checked={recipients.includes(row.id)}
          onChange={e=>setRecipients(previous=>e.target.checked?
            [...new Set([...previous,row.id])]:previous.filter(id=>id!==row.id))}/>{row.name}</label>)}</div>
      <label>Title<input maxLength={160} value={title}
        onChange={e=>setTitle(e.target.value)}/></label>
      <label>Message<textarea rows={7} maxLength={4000} value={body}
        onChange={e=>setBody(e.target.value)}/></label>
      <div className={styles.actions}><button type="button"
        disabled={busy||!recipients.length||!title.trim()||!body.trim()} onClick={send}>
        Send Notification</button></div>
    </SurfacePanel>
  </section>;
}
