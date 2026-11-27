import React,{useState} from 'react';
import {VISION_EFFECTS} from '../../state/battleMapVision.mjs';
export function BattleMapVisionControls({map,patch,placing,onPlace}){
  const [kind,setKind]=useState('light'),[radius,setRadius]=useState(''),[rule,setRule]=useState('');
  const [affects,setAffects]=useState(false),[observer,setObserver]=useState('');
  const v=map.vision||{},senses=v.senses||{},sources=v.sources||[];
  const change=values=>patch({vision:{...v,...values}});
  return <fieldset><legend>Party vision and lighting</legend>
    <label><input type="checkbox" checked={v.automatic===true} onChange={e=>{
      patch({fogEnabled:true,vision:{...v,automatic:e.target.checked}});onPlace(null);
    }}/> Automatic party line of sight</label>
    {v.automatic?<>
      <label>Ambient light<select value={v.ambient||'daylight'} onChange={e=>change({ambient:e.target.value})}>
        <option value="daylight">Daylight</option><option value="dim">Dim</option><option value="dark">Darkness</option></select></label>
      <label>Weather sight limit (m, 0 for unrestricted)<input type="number" min="0" max="10000"
        value={v.weatherLimit||0} onChange={e=>change({weatherLimit:Number(e.target.value)})}/></label>
      <label>Light or environment<select value={kind} onChange={e=>{setKind(e.target.value);onPlace(null);}}>
        {['light',...VISION_EFFECTS].map(key=><option key={key}>{key}</option>)}</select></label>
      <label>Source radius (m)<input type="number" min=".1" max="10000" step="any"
        value={radius} onChange={e=>{setRadius(e.target.value);onPlace(null);}}/></label>
      {kind!=='light'?<>
        <label><input type="checkbox" checked={affects} onChange={e=>{setAffects(e.target.checked);onPlace(null);}}/> Obscures sight under an existing rule</label>
        {affects?<label>Rule or ability<input value={rule} maxLength={160} onChange={e=>{setRule(e.target.value);onPlace(null);}}/></label>:null}
      </>:null}
      <button type="button" aria-pressed={!!placing} disabled={!(Number(radius)>0&&Number(radius)<=10000)||sources.length>=40||kind!=='light'&&affects&&!rule.trim()}
        onClick={()=>onPlace(placing?null:{kind,radius:Number(radius),affectsSight:kind!=='light'&&affects,rule:kind==='light'?'':rule.trim()})}>
        {placing?'Cancel placement':'Place source on map'}</button>
      {sources.map((source,i)=><div key={i}>{source.kind} · {source.radius} m
        <button type="button" onClick={()=>change({sources:sources.filter((_,j)=>j!==i)})}>Remove {source.kind}</button></div>)}
      <label>Observer override<select value={observer} onChange={e=>setObserver(e.target.value)}>
        <option value="">Use character senses</option>
        {(map.tokens||[]).filter(t=>t.kind==='character'&&t.refId).map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      {observer?['normal','dim','dark'].map(key=><label key={key}>{key} sight (m)
        <input type="number" placeholder="Character source" min="0" max="10000" value={senses[observer]?.[key]??''}
          onChange={e=>{const next={...senses[observer]};if(e.target.value==='')delete next[key];else next[key]=Number(e.target.value);
            change({senses:{...senses,[observer]:next}});}}/></label>):null}
      <button type="button" onClick={()=>change({overrides:'',resetId:crypto.randomUUID()})}>Reset party exploration</button>
    </>:null}
  </fieldset>;
}
