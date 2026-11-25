import React,{useEffect,useState} from 'react';

/** Shared header fold for live GM and character dashboard workspaces.
 * The global navigation remains in the DOM and keyboard-accessible whenever
 * expanded. The state is local to this device and can be toggled at any time.
 */
export function DashboardHeaderFold({scope='dashboard'}){
  const key='asteria:dashboard-header-fold:v1:'+scope;
  const [expanded,setExpanded]=useState(()=>{
    try{return window.localStorage.getItem(key)==='expanded';}
    catch{return false;}
  });
  useEffect(()=>{
    const root=document.documentElement;
    root.dataset.asteriaDashboardHeader=expanded?'expanded':'collapsed';
    return ()=>{delete root.dataset.asteriaDashboardHeader;};
  },[expanded]);
  const toggle=()=>{
    const next=!expanded;
    setExpanded(next);
    try{window.localStorage.setItem(key,next?'expanded':'collapsed');}catch{/* local storage optional */}
  };
  return <div className="asteria-dashboard-header-fold" data-testid="asteria-dashboard-header-fold">
    <button type="button" onClick={toggle}
      aria-expanded={expanded} aria-controls="globalNavigation"
      aria-label={expanded?'Hide Asteria website header':'Show Asteria website header'}>
      <span aria-hidden="true">{expanded?'▴':'▾'}</span>
      <span>{expanded?'Hide Asteria Header':'Show Asteria Header'}</span>
    </button>
  </div>;
}
