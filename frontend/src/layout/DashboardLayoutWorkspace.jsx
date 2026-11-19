import React,{useEffect,useMemo,useState} from 'react';
import {
  DASHBOARD_PANEL_REGISTRY,dashboardLayoutForViewport,dashboardViewportFromWidth,
  gridRowCount,visibleDashboardPanels
} from '../../../src/state/dashboardLayoutModel.mjs';
import styles from './DashboardLayoutWorkspace.module.css';

export function DashboardLayoutWorkspace({
  role='player',layout,renderPanel,title='Dashboard panels'
}){
  const [viewport,setViewport]=useState(()=>
    dashboardViewportFromWidth(typeof window==='undefined'?1200:window.innerWidth));
  useEffect(()=>{
    const refresh=()=>setViewport(dashboardViewportFromWidth(window.innerWidth));
    window.addEventListener('resize',refresh);
    return ()=>window.removeEventListener('resize',refresh);
  },[]);
  const view=useMemo(()=>dashboardLayoutForViewport(layout,role,viewport),[layout,role,viewport]);
  const registry=DASHBOARD_PANEL_REGISTRY[role==='gm'?'gm':'player'];
  const names=new Map(registry.map(item=>[item.id,item.label]));
  const ids=visibleDashboardPanels(view,role);
  const ordered=viewport==='desktop'?ids:ids.slice().sort((a,b)=>
    (view.placements[a]?.y||0)-(view.placements[b]?.y||0)||
    (view.placements[a]?.x||0)-(view.placements[b]?.x||0));
  if(!ordered.length)return <section className={styles.empty} aria-label={title}>
    No dashboard panels are visible. Open the Dashboard Layout Editor to enable panels.
  </section>;
  return <section className={styles.workspace} aria-label={title}
    data-testid={'site-'+role+'-layout-workspace'}>
    <div className={styles.grid} data-dashboard-viewport={viewport}
      style={{'--layout-rows':gridRowCount(view.placements,ids)}}>
      {ordered.map(id=>{
        const pos=view.placements[id];
        if(!pos)return null;
        return <article key={id} className={styles.tile}
          data-panel-id={id} data-panel-size={`${pos.w}x${pos.h}`}
          data-panel-background={view.panelBackgrounds[id]||view.backgroundStyle}
          style={{
            gridColumn:(pos.x+1)+' / span '+pos.w,
            gridRow:(pos.y+1)+' / span '+pos.h
          }}>
          <h3 className={styles.title}>{names.get(id)||'Dashboard Panel'}</h3>
          <div className={styles.content}>{renderPanel(id)}</div>
        </article>;
      })}
    </div>
  </section>;
}
