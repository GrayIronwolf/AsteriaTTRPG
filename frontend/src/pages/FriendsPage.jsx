import React, {useCallback,useEffect,useRef,useState} from 'react';
import { PageLayout, PageHeader } from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import { Heading, BodyText } from '../components/ui/Typography.jsx';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import {useAppServices} from '../app/AppServices.jsx';
import {assertHandle,confirmationText} from '../friends/friendContracts.mjs';
import styles from './FriendsPage.module.css';

const TABS=[['accepted','My Friends'],['incoming','Incoming Requests'],
  ['outgoing','Outgoing Requests'],['blocked','Blocked Players'],['chats','Chats']];
const EMPTY={items:[],nextCursor:null};
function publicError(error) {
  const code=error?.code||'';
  if(code==='functions/resource-exhausted')return 'Too many requests. Try again later.';
  if(code==='functions/aborted')return 'This relationship changed. Refresh before trying again.';
  if(code==='functions/failed-precondition')return 'This action is unavailable. Refresh and check the current status.';
  return 'Friends service is unavailable. No changes were confirmed.';
}
function FriendIdentity({item}) {
  return <div className={styles.identity}>
    <span className={styles.initial} aria-hidden="true">{item.username.slice(0,1).toUpperCase()}</span>
    <span><strong>{item.username}</strong><small>{item.accountId}</small></span>
  </div>;
}
export function FriendsPage() {
  const {session}=useAuth();
  const services=useAppServices();
  const service=services.get('friends');
  const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
  const [tab,setTab]=useState('accepted');
  const [pages,setPages]=useState({});
  const [handle,setHandle]=useState('');
  const [found,setFound]=useState(null);
  const [pending,setPending]=useState(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [ready,setReady]=useState(false);
  const epoch=useRef(0);
  const owner=useRef(uid);
  owner.current=uid;
  const active=useCallback((token,account)=>epoch.current===token&&owner.current===account,[]);
  const operation=useCallback(async (task,success)=>{
    if(!service||!uid)return null;
    const account=uid,token=epoch.current;
    setBusy(true);setError('');setMessage('');
    try{
      const result=await task();
      if(!active(token,account))return null;
      if(success)setMessage(success);
      return result;
    }catch(err){if(active(token,account))setError(publicError(err));return null;}
    finally{if(active(token,account))setBusy(false);}
  },[active,service,uid]);

  const load=useCallback(async (kind,append=false)=>{
    if(!service||!uid||kind==='chats')return;
    const account=uid,token=epoch.current;
    const previous=pages[kind]||EMPTY;
    const cursor=append?previous.nextCursor:0;
    if(cursor===null)return;
    setBusy(true);setError('');
    try{
      const response=await service.list(kind,cursor);
      if(!active(token,account))return;
      setPages(old=>({...old,[kind]:{
        items:append?[...(old[kind]?.items||[]),...response.items]:response.items,
        nextCursor:response.nextCursor
      }}));
      setReady(true);
    }catch(err){if(active(token,account))setError(publicError(err));}
    finally{if(active(token,account))setBusy(false);}
  },[active,service,uid,pages]);
  useEffect(()=>{
    ++epoch.current;
    setPages({});setTab('accepted');setHandle('');setFound(null);
    setPending(null);setBusy(false);setMessage('');setError('');setReady(false);
    if(!uid||!service)return;
    const token=epoch.current;
    service.list('accepted',0).then(result=>{
      if(active(token,uid)){setPages({accepted:result});setReady(true);}
    }).catch(err=>{if(active(token,uid))setError(publicError(err));});
    return ()=>{++epoch.current;};
  },[uid,service,active]);
  async function findPlayer(event){
    event.preventDefault();
    let input;
    try{input=assertHandle(handle.trim());}
    catch(err){setError(err.message);setFound(null);return;}
    setFound(null);
    const result=await operation(()=>service.find(input));
    if(result?.found===true)setFound(result);
    else if(result?.found===false)setMessage('No player found with that Account ID.');
  }
  function switchTab(next){
    if(busy)return;
    setPending(null);setTab(next);setError('');setMessage('');
    if(next!=='chats'&&!pages[next])void load(next);
  }
  async function confirmAction(){
    if(!pending||busy)return;
    const current=pending;
    setPending(null);
    const result=await operation(
      ()=>service.change(current.action,current.accountId,current.version),
      current.action==='send'?'Friend request sent.':
      current.action==='accept'?'Friend request accepted.':
      current.action==='decline'?'Friend request declined.':
      current.action==='cancel'?'Friend request cancelled.':
      current.action==='remove'?'Friend removed.':
      current.action==='block'?'Player blocked.':'Player unblocked.'
    );
    if(result){
      setFound(null);
      setPages({});
      // Refetch canonical lists after each mutation, never optimistic writes.
      await load(tab);
    }
  }
  function propose(action,item){
    setPending({action,accountId:item.accountId,
      ...(action==='send'||action==='block'&&!item.version?{}:{version:item.version})});
    setMessage('');setError('');
  }
  const page=pages[tab]||EMPTY;
  if(!uid||!service)return <PageLayout width="reading" labelledBy="friends-title" data-testid="site-friends-page">
    <Heading id="friends-title">Friends</Heading>
    <BodyText>Sign in with a verified account profile to use Friends.</BodyText>
    <CrystalButton href="#/account/login">Login</CrystalButton>
  </PageLayout>;
  return <PageLayout as="section" width="wide" className={styles.page}
    labelledBy="friends-title" data-testid="site-friends-page">
    <PageHeader eyebrow="Asteria Social" id="friends-title" title="Friends" />
    <BodyText muted>Exact Account ID search, private friend requests, and friendship management.
      Player discovery and relationship records remain protected by Firebase callables.</BodyText>
    <div className={styles.layout} data-page-shell="true">
      <nav className={styles.tabs} data-page-rail="true" data-page-nav="true" aria-label="Friends sections">
        {TABS.map(([id,label])=><button type="button" key={id}
          className={styles.tab} data-page-nav-item="true" aria-current={tab===id?'page':undefined}
          data-testid={'site-friends-tab-'+id} onClick={()=>switchTab(id)}>{label}</button>)}
      </nav>
      <div className={styles.content} data-page-content="true">
        {error&&<p role="alert" className={styles.notice} data-testid="site-friends-error">{error}</p>}
        {message&&<p role="status" className={styles.notice} data-testid="site-friends-message">{message}</p>}
        {pending&&<SurfacePanel as="section" className={styles.confirm} data-testid="site-friends-confirm">
          <h2>Confirm {pending.action}</h2>
          <p>{confirmationText(pending.action,pending.accountId)}</p>
          <div className={styles.actions}>
            <CrystalButton disabled={busy} onClick={confirmAction}>Confirm</CrystalButton>
            <CrystalButton disabled={busy} onClick={()=>setPending(null)}>Cancel</CrystalButton>
          </div>
        </SurfacePanel>}
        {tab==='accepted'&&<SurfacePanel as="section" className={styles.panel}>
          <h2>Find Players</h2>
          <form className={styles.find} onSubmit={findPlayer} data-testid="site-friends-search">
            <label htmlFor="site-friends-id">Exact Account ID</label>
            <div className={styles.searchRow}>
              <input id="site-friends-id" value={handle} maxLength={30}
                placeholder="Player#01234" autoComplete="off"
                onChange={event=>{setHandle(event.target.value);setFound(null);}}/>
              <CrystalButton type="submit" disabled={busy}>Find Player</CrystalButton>
            </div>
          </form>
          {found&&<article className={styles.person} data-testid="site-friends-result">
            <FriendIdentity item={found}/>
            <div className={styles.actions}>
              <CrystalButton disabled={busy} onClick={()=>propose('send',found)}>Send Friend Request</CrystalButton>
              <CrystalButton disabled={busy} onClick={()=>propose('block',found)}>Block Player</CrystalButton>
            </div>
          </article>}
        </SurfacePanel>}
        {tab==='chats'?<SurfacePanel as="section" className={styles.panel}
          data-testid="site-friends-chats">
          <h2>Chats</h2>
          <BodyText>Live party chat is available from an active character’s Party dashboard.
            Private friend-to-friend messaging is not enabled.</BodyText>
          <BodyText muted>The Party dashboard has not yet been migrated into this React preview.</BodyText>
        </SurfacePanel>:<SurfacePanel as="section" className={styles.panel}
          data-testid={'site-friends-list-'+tab}>
          <div className={styles.heading}>
            <h2>{TABS.find(([id])=>id===tab)?.[1]}</h2>
            <CrystalButton disabled={busy} onClick={()=>load(tab)}>Refresh</CrystalButton>
          </div>
          {!ready&&<BodyText muted>Loading your Friends workspace…</BodyText>}
          {ready&&page.items.length===0&&<BodyText muted>No {tab==='accepted'?'accepted friends':
            tab==='blocked'?'blocked players':tab+' requests'} on this page.</BodyText>}
          <div className={styles.list}>
            {page.items.map((item,index)=><article className={styles.person} key={item.accountId+'-'+index}>
              <FriendIdentity item={item}/>
              <div className={styles.actions}>
                {tab==='incoming'&&<>
                  <CrystalButton disabled={busy} onClick={()=>propose('accept',item)}>Accept</CrystalButton>
                  <CrystalButton disabled={busy} onClick={()=>propose('decline',item)}>Decline</CrystalButton>
                </>}
                {tab==='outgoing'&&<CrystalButton disabled={busy}
                  onClick={()=>propose('cancel',item)}>Cancel Request</CrystalButton>}
                {tab==='accepted'&&<>
                  <CrystalButton disabled={busy} onClick={()=>propose('remove',item)}>Remove Friend</CrystalButton>
                  <CrystalButton disabled={busy} onClick={()=>propose('block',item)}>Block Player</CrystalButton>
                </>}
                {tab==='blocked'&&<CrystalButton disabled={busy}
                  onClick={()=>propose('unblock',item)}>Unblock</CrystalButton>}
              </div>
            </article>)}
          </div>
          {page.nextCursor!==null&&<CrystalButton disabled={busy}
            onClick={()=>load(tab,true)}>Load More</CrystalButton>}
        </SurfacePanel>}
      </div>
    </div>
  </PageLayout>;
}
