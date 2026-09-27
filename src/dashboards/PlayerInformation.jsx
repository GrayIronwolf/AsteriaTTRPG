import React, { useState } from 'react';
import { Panel, Tabs, EmptyState, StatusPill, SearchField } from '../components/WorkspaceUI.jsx';
import { QuestTab } from './CharacterWorkspaceTabs.jsx';
import { InformationCard } from './CampaignInformationWorkspace.jsx';
import { notificationHistory } from '../state/notificationModel.mjs';
import { firebaseService } from '../firebase/asteriaFirebaseService.js';
import { useAsyncAction } from '../components/useAsyncAction.js';
export function PlayerInformation({campaignId,character,partyWorkspace,events,editable,isOwner,initialTab='news'}) {
  const [tab,setTab]=useState(initialTab),[query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[older,setOlder]=useState([]),[cursor,setCursor]=useState(''),[more,setMore]=useState(true);
  const action=useAsyncAction(),history=notificationHistory(character,[...events,...older]),unread=history.filter(row=>!row.read).length;
  const information=Object.values(partyWorkspace.information || {}).filter(e=>e.published===true);
  const shown=history.filter(row=>(filter==='All' || filter==='Unread'&&!row.read || filter==='Read'&&row.read) && `${row.title} ${row.message}`.toLowerCase().includes(query.toLowerCase()));
  // The live list also contains old pending deliveries. Page from the owner query's
  // cursor, never from that merged list, so intervening history cannot be skipped.
  const load=async()=>{const result=await action.run(()=>firebaseService.fetchEventHistory(campaignId,character.id,cursor));if(result?.events){setOlder(previous=>[...previous,...result.events]);setCursor(result.cursor);setMore(result.more);}};
  return <div className="react-information-workspace"><Panel title="Campaign Information"><Tabs tabs={[{id:'news',label:'News'},{id:'events',label:'Events'},{id:'notifications',label:`Notifications${unread?` (${unread})`:''}`},{id:'quests',label:'Quests'}]} active={tab} onChange={setTab} ariaLabel="Campaign information"/></Panel>
    {['news','events'].includes(tab)?<Panel title={tab==='news'?'News':'Events'}>{information.filter(e=>e.kind===tab).map(entry=><InformationCard key={entry.id} entry={entry}/>)}{!information.some(e=>e.kind===tab)?<EmptyState title={`No published ${tab}`}/>:null}</Panel>:null}
    {tab==='quests'?<QuestTab campaignId={campaignId} character={character} partyWorkspace={partyWorkspace} editable={editable}/>:null}
    {tab==='notifications'?<Panel title="Notification History"><SearchField value={query} onChange={setQuery} placeholder="Search notification history…"/><div className="react-filter-tabs">{['All','Unread','Read'].map(value=><button key={value} aria-pressed={filter===value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{value}</button>)}</div>{shown.map(row=><article className="react-information-card" key={`${row.source}:${row.id}`}><header><h3>{row.title}</h3><StatusPill>{row.read?'Read':'Unread'}</StatusPill></header>{row.at?<time dateTime={new Date(row.at).toISOString()}>{new Date(row.at).toLocaleString()}</time>:null}<p>{row.message}</p>{row.status?<p>{row.status}</p>:null}<button disabled={!isOwner||action.busy} onClick={()=>action.run(()=>firebaseService.markNotificationRead(campaignId,character.id,row.source,row.id,!row.read))}>Mark {row.read?'unread':'read'}</button></article>)}{!shown.length?<EmptyState title="No matching notifications"/>:null}{more?<button disabled={action.busy||!isOwner} onClick={load}>Load older notifications</button>:null}<p role="status">{action.message}</p></Panel>:null}
  </div>;
}
