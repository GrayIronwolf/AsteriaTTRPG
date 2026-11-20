import React,{useEffect,useMemo,useState} from 'react';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {BodyText} from '../components/ui/Typography.jsx';
import {playerNotificationHistory} from './playerInformationModel.mjs';
import styles from '../pages/PlayerDashboardPage.module.css';

export function PlayerInformationWorkspace({api,character,campaignId,characterId,
  ownerUid='',owned=false}){
  const [feed,setFeed]=useState(null),[error,setError]=useState(''),
    [message,setMessage]=useState(''),[busy,setBusy]=useState(false),
    [section,setSection]=useState('news'),[search,setSearch]=useState(''),
    [filter,setFilter]=useState('All'),[older,setOlder]=useState([]),
    [cursor,setCursor]=useState(''),[more,setMore]=useState(true);
  useEffect(()=>{
    setFeed(null);setError('');setMessage('');setOlder([]);
    setCursor('');setMore(true);setBusy(false);setSection('news');
    let active=true;
    const unsubscribe=api.watchInformation(campaignId,characterId,value=>{
      if(active)setFeed(value);
    },reason=>{if(active){setFeed(null);setError(reason?.message||
      'Campaign information is unavailable.');}});
    return ()=>{active=false;unsubscribe();};
  },[api,campaignId,characterId]);
  const notices=useMemo(()=>owned&&feed?.owner?
    playerNotificationHistory(character,[...feed.events,...older],ownerUid):[],
    [character,feed,older,owned,ownerUid]);
  const unread=notices.filter(row=>!row.read).length;
  const shown=notices.filter(row=>(filter==='All'||
    filter==='Unread'&&!row.read||filter==='Read'&&row.read)&&
    [row.title,row.message,row.status].join(' ').toLowerCase()
      .includes(search.trim().toLowerCase()));
  const information=(feed?.published||[]).filter(item=>item.kind===section&&
    [item.title,item.description,item.location,item.scope,item.source]
      .join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const run=async(work,success)=>{
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{const result=await work();setMessage(success);return result;}
    catch(e){setError(e?.message||'Campaign information could not be updated.');}
    finally{setBusy(false);}
  };
  const loadMore=()=>run(async()=>{
    const result=await api.fetchInformationHistory(campaignId,characterId,cursor);
    setOlder(previous=>{
      const known=new Set(previous.map(item=>item.id));
      return [...previous,...result.events.filter(item=>!known.has(item.id))];
    });
    setCursor(result.cursor);setMore(result.more);
    return result;
  },'Older notifications loaded.');
  return <SurfacePanel as="section" className={styles.panel}
    data-testid="site-player-information">
    <h3>News / Events / History</h3>
    <div className={styles.informationTabs} role="group" aria-label="Information sections">
      {[
        ['news','News'],['events','Events'],
        ...(owned?[['history','Notifications'+(unread?' ('+unread+')':'')]]:[])
      ].map(([id,label])=><button type="button" key={id}
        aria-pressed={section===id} onClick={()=>{setSection(id);setSearch('');}}>
        {label}</button>)}
    </div>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
    {!feed&&!error?<BodyText muted>Loading published campaign information…</BodyText>:null}
    {feed?<div className={styles.informationWorkspace}>
      <label>Search information<input type="search" value={search}
        onChange={event=>setSearch(event.target.value)}
        placeholder="Search news, events or history"/></label>
      {section==='history'&&owned&&feed.owner?<>
        <div className={styles.informationTabs} role="group" aria-label="History filter">
          {['All','Unread','Read'].map(label=><button type="button" key={label}
            aria-pressed={filter===label} onClick={()=>setFilter(label)}>{label}</button>)}
        </div>
        <p>Notification History · {unread} unread</p>
        <div className={styles.informationList}>
          {shown.map(row=><article className={styles.informationCard}
            key={row.source+':'+row.id}>
            <header><h4>{row.title}</h4><span>{row.read?'Read':'Unread'}</span></header>
            {row.at?<time dateTime={new Date(row.at).toISOString()}>
              {new Date(row.at).toLocaleString()}</time>:null}
            {row.message?<p>{row.message}</p>:null}
            {row.status?<p>{row.status}</p>:null}
            <button type="button" disabled={busy} onClick={()=>run(
              ()=>api.markInformationRead(campaignId,characterId,row.source,row.id,!row.read),
              'Notification read state updated.')}>
              Mark {row.read?'unread':'read'}</button>
          </article>)}
        </div>
        {!shown.length?<BodyText muted>No matching notifications.</BodyText>:null}
        {more?<button type="button" disabled={busy} onClick={loadMore}>
          Load older notifications</button>:null}
      </>:section==='news'||section==='events'?<>
        <div className={styles.informationList}>
          {information.map(item=><article className={styles.informationCard}
            key={item.kind+':'+item.id}>
            <header><h4>{item.title}</h4>
              {item.status?<span>{item.status}</span>:null}</header>
            {item.scope||item.location||item.source?<p>
              {[item.scope,item.location,item.source].filter(Boolean).join(' · ')}</p>:null}
            {item.description?<p>{item.description}</p>:null}
            {item.start||item.end?<p>
              {item.start?'Starts: '+item.start:''}
              {item.end?' · Ends: '+item.end:''}</p>:null}
          </article>)}
        </div>
        {!information.length?<BodyText muted>No published {section} match this search.</BodyText>:null}
      </>:<BodyText muted>Only the character owner can read notifications.</BodyText>}
    </div>:null}
    {!campaignId?<BodyText muted>Link this character to a campaign to view published updates.</BodyText>:null}
  </SurfacePanel>;
}
