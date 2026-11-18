import React,{useEffect,useRef,useState} from 'react';
import {PageLayout} from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import {Heading,BodyText,Eyebrow} from '../components/ui/Typography.jsx';
import {useAuth} from '../auth/AuthProvider.jsx';
import {useAppServices} from '../app/AppServices.jsx';
import {useNotifications} from '../notifications/NotificationsProvider.jsx';
import {notificationDestination} from '../notifications/notificationContracts.mjs';
import styles from './NotificationsPage.module.css';

const EMPTY={notifications:[],unreadShown:0,nextCursor:null};
export function NotificationsPage(){
 const {session}=useAuth(),services=useAppServices(),inbox=useNotifications();
 const service=services.get('notifications');
 const uid=session.status==='authenticated'&&session.profileAvailable?session.user?.uid:null;
 const [channel,setChannel]=useState('social'),[cursorStack,setCursorStack]=useState([null]);
 const [index,setIndex]=useState(0),[page,setPage]=useState(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const serial=useRef(0),uidRef=useRef(uid);uidRef.current=uid;
 const available=Object.entries(inbox.channels).filter(([,active])=>active).map(([name])=>name);
 const selected=available.includes(channel)?channel:available[0]||'social';
 useEffect(()=>{
   ++serial.current;setPage(null);setCursorStack([null]);setIndex(0);
   setChannel('social');setBusy(false);setError('');setMessage('');
 },[uid,service]);
 useEffect(()=>{
   ++serial.current;
   setIndex(0);setCursorStack([null]);setPage(null);setError('');setMessage('');
 },[selected]);
 const shared=inbox.state[selected]?.page;
 // Current first page is owned by a single header/inbox provider. The page
 // locally holds only later server-issued cursor pages, never persisted state.
 const shown=index===0?(shared||page||EMPTY):(page||EMPTY);
 async function load(nextIndex=index,nextStack=cursorStack) {
   if(!service||!uid||busy||!available.includes(selected))return;
   const token=++serial.current,owner=uid,chosen=selected;
   setBusy(true);setError('');
   try {
     const result=await service.list(chosen,nextStack[nextIndex]);
     if(uidRef.current!==owner||token!==serial.current)return;
     setPage(result);setIndex(nextIndex);setCursorStack(nextStack);
   } catch {
     if(uidRef.current===owner&&token===serial.current)
       setError('This notification page could not be loaded. Refresh to retry.');
   } finally {
     if(uidRef.current===owner&&token===serial.current)setBusy(false);
   }
 }
 async function markRead(id) {
   if(busy)return;
   setBusy(true);setError('');setMessage('');
   const token=serial.current,owner=uid;
   try {
     await inbox.acknowledge(selected,id);
     if(uidRef.current!==owner||token!==serial.current)return;
     if(index>0)setPage(existing=>existing?{
       ...existing,notifications:existing.notifications.map(item=>
         item.notificationId===id?{...item,readAt:new Date().toISOString()}:item),
       unreadShown:Math.max(0,existing.unreadShown-1)
     }:existing);
     setMessage('Notification marked as read.');
   }catch{
     if(uidRef.current===owner&&token===serial.current)
       setError('Notification could not be marked as read. Try again.');
   }finally{if(uidRef.current===owner&&token===serial.current)setBusy(false);}
 }
 function next(){
   if(!shown.nextCursor||busy)return;
   const stack=[...cursorStack.slice(0,index+1),shown.nextCursor];
   void load(index+1,stack);
 }
 function previous(){if(index>0&&!busy)void load(index-1,cursorStack);}
 if(!uid||!service)return <PageLayout as="section" width="reading" labelledBy="notice-page-title">
   <Heading id="notice-page-title">Notifications</Heading>
   <BodyText>Sign in with a verified account profile to access private notifications.</BodyText>
   <CrystalButton href="#/account/login">Login</CrystalButton>
 </PageLayout>;
 return <PageLayout as="section" width="wide" className={styles.page}
   labelledBy="notice-page-title" data-testid="site-notifications-page">
   <Eyebrow>Asteria Account</Eyebrow>
   <Heading id="notice-page-title">Notifications</Heading>
   <BodyText muted>Private account updates from the existing Firebase notification service.
     Counts represent unread messages on the latest available page, not your entire history.</BodyText>
   <div className={styles.channels} role="group" aria-label="Notification inboxes">
     {available.map(name=><button type="button" key={name}
       className={styles.tab} aria-current={selected===name?'page':undefined}
       data-testid={'site-notifications-tab-'+name} onClick={()=>setChannel(name)}>
       {name==='social'?'Friend Notifications':'Campaign Notifications'}
     </button>)}
   </div>
   {error&&<p role="alert" className={styles.notice}>{error}</p>}
   {message&&<p role="status" className={styles.notice}>{message}</p>}
   <SurfacePanel as="section" className={styles.panel}>
     <div className={styles.heading}>
       <h2>{selected==='social'?'Friend Notifications':'Campaign Notifications'}</h2>
       <CrystalButton disabled={busy||inbox.state.loading} size="compact"
         onClick={()=>{if(index===0)void inbox.refresh();else void load();}}>Refresh</CrystalButton>
     </div>
     {inbox.state[selected]?.error&&index===0&&
       <p role="alert">{inbox.state[selected].error}</p>}
     <BodyText muted>{shown.unreadShown} unread on page {index+1}
       {shown.nextCursor?' · More available':''}</BodyText>
     <div className={styles.list} role="list" aria-label="Your private notifications"
       aria-busy={busy||inbox.state.loading}>
       {shown.notifications.length===0&&<BodyText muted>No notifications on this page.</BodyText>}
       {shown.notifications.map(item=><article role="listitem" key={item.notificationId}
         className={styles.item} data-testid="site-notification-row">
         <div className={styles.top}>
           <strong>{item.title}</strong><span>{item.readAt?'Read':'Unread'}</span>
         </div>
         <p>{item.body}</p>
         <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
         <div className={styles.actions}>
           {!item.readAt&&<CrystalButton disabled={busy} size="compact"
             onClick={()=>markRead(item.notificationId)}>Mark as Read</CrystalButton>}
           {notificationDestination(selected,item.kind)&&
             <CrystalButton href={notificationDestination(selected,item.kind)}
               size="compact" variant="secondary">Open {selected==='social'?'Friends':'Campaign Forge'}</CrystalButton>}
         </div>
       </article>)}
     </div>
     {selected==='campaign'&&<BodyText muted>Campaign invitation acceptance remains in the existing
       permission-controlled system. This React page cannot redeem invitation tokens or approve membership.</BodyText>}
     <div className={styles.actions}>
       <CrystalButton disabled={busy||index===0} onClick={previous}>Previous</CrystalButton>
       <CrystalButton disabled={busy||!shown.nextCursor} onClick={next}>Next</CrystalButton>
     </div>
   </SurfacePanel>
 </PageLayout>;
}
