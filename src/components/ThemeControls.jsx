import React, { useEffect, useState } from 'react';
import { Panel } from './WorkspaceUI.jsx';
export function ThemeControls() {
  const system=window.AsteriaThemeSystem,[settings,setSettings]=useState(()=>system?.getSettings?.());
  useEffect(()=>{const listener=event=>setSettings(event.detail);window.addEventListener('asteria:theme-change',listener);return()=>window.removeEventListener('asteria:theme-change',listener);},[]);
  if(!settings)return null;
  return <Panel title="UI Colours"><div className="react-theme-colours">{Object.entries(system.areas).map(([key,label])=><label key={key}>{label}<input type="color" aria-label={label} value={settings.areas[key]} onChange={e=>system.applyTheme({...settings,areas:{...settings.areas,[key]:e.target.value}},true)}/></label>)}</div><p className="react-help">Colour changes save automatically on this browser.</p></Panel>;
}
