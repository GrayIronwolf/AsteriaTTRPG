import React,{useEffect,useRef,useState} from 'react';
import {DashboardLayoutEditor} from './DashboardLayoutEditor.jsx';
import {DashboardLayoutWorkspace} from './DashboardLayoutWorkspace.jsx';
import {GMSessionLayoutControls} from './GMSessionLayoutControls.jsx';
import {DASHBOARD_PANEL_REGISTRY,normalizeDashboardLayout} from '../../../src/state/dashboardLayoutModel.mjs';
import {normalizeFreeformWorkspace} from '../../../src/state/workspaceFreeformModel.mjs';
import {createLayoutHistory,undoLayoutHistory,redoLayoutHistory,updateViewportHistory,
  layoutFingerprint} from './layoutHistoryModel.mjs';
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
  const [directHistory,setDirectHistory]=useState(null);
  const [directError,setDirectError]=useState('');
  const [savingDirect,setSavingDirect]=useState(false);
  const directBaseline=useRef(null);
  const available=Boolean(owner&&api?.availability?.().layoutEnabled);
  useEffect(()=>{
    setEditing(false);setDirectHistory(null);directBaseline.current=null;
    setError('');setNotice('');setDirectError('');
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
      setEditing(false);setDirectHistory(null);setLoading(false);
    });
    return ()=>{alive=false;close();};
  },[isGM,available,api,uid,campaignId,characterId]);
  useEffect(()=>{
    if(isGM||editing)return;
    setServer(normalizeDashboardLayout(initialLayout,'player'));
  },[isGM,initialLayout,editing]);
  const startDirect=()=>{
    if(!available||!server||editing)return;
    const original=normalizeDashboardLayout(server,role);
    directBaseline.current=original;
    const ready={...original,freeform:normalizeFreeformWorkspace({
      ...(original.freeform||{}),enabled:true
    },original.placements,DASHBOARD_PANEL_REGISTRY[role].map(item=>item.id))};
    setDirectError('');setNotice('');
    setDirectHistory(createLayoutHistory(ready,role));
  };
  const editDirect=(viewport,callback)=>{
    if(savingDirect||viewport!=='desktop')return;
    setDirectHistory(previous=>previous?updateViewportHistory(previous,role,'desktop',callback):previous);
    setDirectError('');
  };
  const finishDirect=async()=>{
    if(!directHistory||savingDirect)return;
    const baseline=directBaseline.current;
    if(layoutFingerprint(server,role)!==layoutFingerprint(baseline,role)){
      setDirectError('Dashboard layout changed in another session. Cancel direct editing and reopen to use the latest layout.');
      return;
    }
    setSavingDirect(true);setDirectError('');
    try{
      await save(directHistory.present,baseline);
      setDirectHistory(null);directBaseline.current=null;
    }catch(e){
      setDirectError(e?.message||'Direct layout changes could not be saved.');
    }finally{setSavingDirect(false);}
  };
  const cancelDirect=()=>{
    if(savingDirect)return;
    setDirectHistory(null);directBaseline.current=null;setDirectError('');
  };
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
      <div className={styles.toolbarActions}>
        <button type="button" data-testid="site-direct-layout-open"
          disabled={editing||savingDirect}
          onClick={()=>directHistory?cancelDirect():startDirect()}>
          {directHistory?'Cancel direct editing':'Edit dashboard directly'}
        </button>
        <button type="button" data-testid="site-layout-open" disabled={Boolean(directHistory)}
          onClick={()=>{setEditing(previous=>!previous);setNotice('');}}>
          {editing?'Close layout editor':'Advanced Layout Editor'}
        </button>
      </div>
    </div>
    {isGM?<GMSessionLayoutControls layout={server} disabled={!available||loading||Boolean(directHistory)}
      onCommit={next=>save(next,server)}/>:null}
    {directHistory?<div className={styles.directToolbar} role="group" aria-label="Direct dashboard customisation">
      <strong>Direct editing is on</strong>
      <span>Drag panel handles or resize corners. Gameplay data remains unchanged.</span>
      <button type="button" onClick={()=>setDirectHistory(undoLayoutHistory)}
        disabled={savingDirect||!directHistory.past.length}>Undo</button>
      <button type="button" onClick={()=>setDirectHistory(redoLayoutHistory)}
        disabled={savingDirect||!directHistory.future.length}>Redo</button>
      <label><input type="checkbox" checked={directHistory.present.freeform?.snap!==false}
        disabled={savingDirect} onChange={event=>editDirect('desktop',previous=>({
          ...previous,freeform:{...previous.freeform,snap:event.target.checked}
        }))}/> Snap</label>
      <label><input type="checkbox" checked={directHistory.present.freeform?.allowOverlap===true}
        disabled={savingDirect} onChange={event=>editDirect('desktop',previous=>({
          ...previous,freeform:{...previous.freeform,allowOverlap:event.target.checked}
        }))}/> Allow overlapping</label>
      <button type="button" data-testid="site-direct-layout-cancel"
        disabled={savingDirect} onClick={cancelDirect}>Discard</button>
      <button type="button" data-testid="site-direct-layout-save"
        disabled={savingDirect} onClick={finishDirect}>{savingDirect?'Saving…':'Save Layout'}</button>
      {directError?<p role="alert">{directError}</p>:null}
    </div>:null}
    {editing?<DashboardLayoutEditor key={uid+':'+campaignId+':'+characterId}
      role={role} layout={server} onSave={save} onClose={()=>setEditing(false)}/>:null}
    <DashboardLayoutWorkspace role={role} layout={directHistory?.present||server}
      editing={Boolean(directHistory)} onLayoutChange={editDirect}
      title={isGM?'GM Main Dashboard':'Player Main Dashboard'}
      renderPanel={id=>renderPanel?.(id)||<p className={styles.pending}>{PENDING}</p>}/>
    {notice?<p role="status">{notice}</p>:null}
  </section>;
}
