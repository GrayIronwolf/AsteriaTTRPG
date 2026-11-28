import React,{useEffect,useRef,useState} from 'react';

/** Shared header fold for live GM and character dashboard workspaces.
 * The global navigation remains in the DOM and keyboard-accessible whenever
 * expanded. The state is local to this device and can be toggled at any time.
 */
export function DashboardHeaderFold(){
  // The dashboard always starts with its global header collapsed. Prior
  // sessions must not leave it covering the workspace on the next visit.
  const [expanded,setExpanded]=useState(false);
  const collapseTimer=useRef(null);
  useEffect(()=>{
    const root=document.documentElement;
    root.dataset.asteriaDashboardHeader=expanded?'expanded':'collapsed';
    return ()=>{delete root.dataset.asteriaDashboardHeader;};
  },[expanded]);
  useEffect(()=>{
    clearTimeout(collapseTimer.current);
    if(expanded)collapseTimer.current=setTimeout(()=>setExpanded(false),8000);
    return ()=>clearTimeout(collapseTimer.current);
  },[expanded]);
  useEffect(()=>{
    const collapse=()=>setExpanded(false);
    window.addEventListener('hashchange',collapse);
    return ()=>window.removeEventListener('hashchange',collapse);
  },[]);
  const toggle=()=>setExpanded(value=>!value);
  return <div className="asteria-dashboard-header-fold" data-testid="asteria-dashboard-header-fold">
    <button type="button" onClick={toggle}
      aria-expanded={expanded} aria-controls="globalNavigation"
      aria-label={expanded?'Hide Asteria website header':'Show Asteria website header'}>
      <span aria-hidden="true">{expanded?'▴':'▾'}</span>
      <span>{expanded?'Hide Asteria Header':'Show Asteria Header'}</span>
    </button>
  </div>;
}
