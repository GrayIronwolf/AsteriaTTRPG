import React,{useState} from 'react';
import {TOWER_FAMILIES,TOWER_VARIATIONS,TOWER_MATERIALS,TOWER_TRIMS,
 TOWER_MOTIFS,TOWER_LIGHTING,TOWER_WEAR,TOWER_SOUNDS,TOWER_QUALITY,
 defaultDiceTowerAppearance,validateDiceTowerAppearance}
 from './diceTowerCatalogue.mjs';
import {TRAY_FAMILIES} from './diceTrayCatalogue.mjs';
/** Test-only local tower editor; never writes account collections or starts rolls. */
export function DiceTowerStudio({value,onChange,disabled=false}){
 const config=validateDiceTowerAppearance(value||defaultDiceTowerAppearance());
 const [advanced,setAdvanced]=useState(false);
 const set=(key,v)=>onChange?.(validateDiceTowerAppearance({...config,[key]:v}));
 const options=(ids)=>ids.map(x=>({id:x,name:x.replace(/-/g,' ')}));
 const field=(label,key,entries)=><label key={key}>{label}
   <select aria-label={label} value={config[key]} disabled={disabled}
     onChange={e=>set(key,e.target.value)}>
    {entries.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
   </select>
  </label>;
 const color=(label,key)=><label key={key}>{label}
   <input type="color" aria-label={label} value={config[key]} disabled={disabled}
    onChange={e=>set(key,e.target.value)}/>
  </label>;
 return <section className="asteria-dice-tower-studio" aria-label="Experimental Tower Studio">
  <header><h3>Dice Tower Studio</h3><small>Experimental preview only. Not saved to your account.</small></header>
  <div role="group" aria-label="Six experimental dice tower families"
   className="asteria-dice-tower-family-grid">
   {TOWER_FAMILIES.map(f=><button type="button" key={f.id}
    aria-pressed={config.designId===f.id} disabled={disabled}
    onClick={()=>onChange?.(defaultDiceTowerAppearance(f.id))}>{f.name}</button>)}
  </div>
  <div className="asteria-dice-tower-editor-grid">
   {field('Tower variation','variation',options(TOWER_VARIATIONS))}
   {field('Tower quality','quality',options(TOWER_QUALITY))}
   {field('Paired dice tray','pairedTray',TRAY_FAMILIES.map(f=>({id:f.id,name:f.name})))}
   {color('Tower base colour','baseColor')}
   {color('Tower accent colour','accentColor')}
   {color('Tower glow colour','glowColor')}
  </div>
  <button type="button" aria-expanded={advanced} disabled={disabled}
   onClick={()=>setAdvanced(x=>!x)}>
    {advanced?'Hide advanced tower options':'Advanced tower options'}
  </button>
  {advanced?<div className="asteria-dice-tower-editor-grid">
    {field('Tower base material','baseMaterial',options(TOWER_MATERIALS))}
    {field('Tower accent material','accentMaterial',options(TOWER_MATERIALS))}
    {field('Tower trim','trim',options(TOWER_TRIMS))}
    {field('Tower motif','motif',options(TOWER_MOTIFS))}
    {field('Tower lighting','lighting',options(TOWER_LIGHTING))}
    {field('Tower wear','wear',options(TOWER_WEAR))}
    {field('Tower impact sound','sound',options(TOWER_SOUNDS))}
   </div>:null}
  <p className="asteria-advanced-dice-help">The six tower families and three variations
    use the same live 3D renderer and Cannon physics world. No preview control rolls dice.</p>
 </section>;
}
