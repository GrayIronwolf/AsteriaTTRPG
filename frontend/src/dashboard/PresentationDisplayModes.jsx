import React,{useEffect,useState} from 'react';
import {
  DISPLAY_MODE_IDS,DISPLAY_MODE_PRESETS,DISPLAY_SCALE_MIN,DISPLAY_SCALE_MAX,
  defaultDisplayPreferences,validateDisplayPreferences,applyDisplayPreference,
  displayPreferencesKey
} from '../../../src/state/presentationDisplayModeModel.mjs';
import styles from './PresentationDisplayModes.module.css';

const initial=(uid,campaignId,scope,fallback)=>{
  const key=displayPreferencesKey(uid,campaignId,scope);
  if(!key||typeof window==='undefined')return defaultDisplayPreferences(fallback);
  try{
    const raw=window.localStorage.getItem(key);
    return raw?validateDisplayPreferences(JSON.parse(raw),fallback):
      defaultDisplayPreferences(fallback);
  }catch{return defaultDisplayPreferences(fallback);}
};

/** Preferences are local, per verified account/campaign/scope, never Firebase data. */
export function usePresentationDisplayPreferences(uid,campaignId,scope,fallback){
  const [prefs,setPrefs]=useState(()=>initial(uid,campaignId,scope,fallback));
  const [message,setMessage]=useState('');
  useEffect(()=>{
    setPrefs(initial(uid,campaignId,scope,fallback));
    setMessage('');
  },[uid,campaignId,scope,fallback]);
  const update=(field,value)=>{
    const next=applyDisplayPreference(prefs,field,value);
    setPrefs(next);
    const key=displayPreferencesKey(uid,campaignId,scope);
    if(!key){setMessage('Display preference is temporary until account verification.');return;}
    try{
      window.localStorage.setItem(key,JSON.stringify(next));
      setMessage('Display preferences saved on this device.');
    }catch{setMessage('Local saving unavailable. Preferences apply to this display only.');}
  };
  return {prefs,update,message};
}

export function PresentationDisplayModeControls({prefs,onChange,compact=false}){
  return <div className={styles.controls} data-testid="site-presentation-display-mode-controls"
    aria-label="Local display preferences">
    <label>Display mode
      <select value={prefs.preset} aria-label="Display mode"
        onChange={event=>onChange('preset',event.target.value)}>
        {DISPLAY_MODE_IDS.map(id=><option key={id} value={id}>
          {DISPLAY_MODE_PRESETS[id].label}</option>)}
      </select>
    </label>
    <label>Display size
      <select value={prefs.scale} aria-label="Display size"
        onChange={event=>onChange('scale',Number(event.target.value))}>
        {Array.from({length:1+(DISPLAY_SCALE_MAX-DISPLAY_SCALE_MIN)/5},
          (_,i)=>DISPLAY_SCALE_MIN+i*5).map(size=>
          <option key={size} value={size}>{size}%</option>)}
      </select>
    </label>
    {!compact?<label className={styles.checkbox}>
      <input type="checkbox" checked={prefs.showOverlay}
        onChange={event=>onChange('showOverlay',event.target.checked)}/>
      Show display status overlay
    </label>:null}
    <label className={styles.checkbox}>
      <input type="checkbox" checked={prefs.cleanFullscreen}
        onChange={event=>onChange('cleanFullscreen',event.target.checked)}/>
      Hide controls in fullscreen
    </label>
  </div>;
}
