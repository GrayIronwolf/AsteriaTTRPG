import React,{useEffect,useState} from 'react';
import {DashboardLayoutEditor} from './DashboardLayoutEditor.jsx';
import {DashboardLayoutWorkspace} from './DashboardLayoutWorkspace.jsx';
import {GMSessionLayoutControls} from './GMSessionLayoutControls.jsx';
import {normalizeDashboardLayout} from '../../../src/state/dashboardLayoutModel.mjs';
import styles from './DashboardLayoutManager.module.css';

const PENDING='This panel will be connected during the later gameplay migration.';
/** Route-level editing scope: all listeners close when account or campaign changes. */
export function DashboardLayoutManager({role,api,uid,campaignId='',characterId='',
  initialLayout=null,owner=true,renderPanel}){
  const isGM=role==='gm';
  const [server,setServer]=useState(isGM?null:normalizeDashboardLayout(initialLayout,'player'));
  const [loading,setLoading]=useState(isGM);
  const [error,setError]=useState('');
  const [editing,setEditing]=useState(false);
  const [notice,setNotice]=useState('');
  const available=Boolean(owner&&api?.availability?.().layoutEnabled);
  useEffect(()=>{
    setEditing(false);setError('');setNotice('');
    if(!isGM){setServer(normalizeDashboardLayout(initialLayout,'player'));setLoading(false);return undefined;}
    if(!available||!uid||!campaignId){setServer(null);setLoading(false);return undefined;}
    setServer(null);setLoading(true);
    let alive=true;
    const close=api.watchLayout(campaignId,next=>{
      if(!alive)return;
      setServer(next);setLoading(false);
    },failure=>{
      if(!alive)return;
      setServer(null);setError(failure?.message||'GM layout could not be verified.');
      setEditing(false);setLoading(false);
    });
    return ()=>{alive=false;close();};
  },[isGM,available,api,uid,campaignId,characterId]);
  useEffect(()=>{
    if(isGM||editing)return;
    setServer(normalizeDashboardLayout(initialLayout,'player'));
  },[isGM,initialLayout,editing]);
  const save=async(next,expected)=>{
    if(!available||!uid)throw Error('Layout editing permission is unavailable.');
    const response=isGM
      ?await api.saveLayout(campaignId,next,expected)
      :campaignId
        ?await api.saveCampaignLayout(campaignId,characterId,next,expected)
        :await api.saveOwnedLayout(characterId,next,expected);
    if(response?.ok===false)throw Error(response.error||'The layout could not be saved.');
    setServer(normalizeDashboardLayout(next,role));setNotice('Dashboard layout saved.');
    return {ok:true};
  };
  if(!owner&&!isGM){
    // A GM may inspect the linked Player's authorised panel content, not the
    // owner's private saved layout, journal or dashboard editor.
    const readonly=normalizeDashboardLayout(null,'player');
    const safeLayout={...readonly,hidden:[...readonly.hidden,'journal']};
    return <section className={styles.manager} data-testid="site-player-layout-readonly">
      <p className={styles.status}>Read-only dashboard. Layout editing belongs to the character owner.</p>
      <DashboardLayoutWorkspace role="player" layout={safeLayout}
        title="Player Main Dashboard (read-only)"
        renderPanel={id=>renderPanel?.(id)||<p className={styles.pending}>{PENDING}</p>}/>
    </section>;
  }
  if(!available)return <p className={styles.status}>Dashboard editor is not enabled.</p>;
  if(loading)return <p role="status">Connecting your saved dashboard layout…</p>;
  if(error)return <p role="alert" data-testid="site-layout-error">{error}</p>;
  if(!server)return <p role="alert">Dashboard layout is unavailable.</p>;
  return <section className={styles.manager} data-testid={'site-'+role+'-layout-manager'}>
    <div className={styles.toolbar}>
      <div><h2>Customisable Dashboard</h2>
        <p>Layouts are saved per {isGM?'campaign and GM account':'character'}.
          Session controls and the resource header remain outside the editable grid.</p></div>
      <button type="button" data-testid="site-layout-open"
        onClick={()=>{setEditing(previous=>!previous);setNotice('');}}>
        {editing?'Close layout editor':'Customise Dashboard Layout'}
      </button>
    </div>
    {isGM?<GMSessionLayoutControls layout={server} disabled={!available||loading}
      onCommit={next=>save(next,server)}/>:null}
    {editing?<DashboardLayoutEditor key={uid+':'+campaignId+':'+characterId}
      role={role} layout={server} onSave={save} onClose={()=>setEditing(false)}/>:null}
    <DashboardLayoutWorkspace role={role} layout={server}
      title={isGM?'GM Main Dashboard':'Player Main Dashboard'}
      renderPanel={id=>renderPanel?.(id)||<p className={styles.pending}>{PENDING}</p>}/>
    {notice?<p role="status">{notice}</p>:null}
  </section>;
}
