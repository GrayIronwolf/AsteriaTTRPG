import React from 'react';
import {GRAPHICS,EFFECT_LEVELS,ELEMENTS,REDUCED_MOTION,SOUND_PACKS,
 validateDicePresentation} from './dicePresentationModel.mjs';
import {TRAY_SOUND_LEVELS} from './diceTrayCatalogue.mjs';
const caption=id=>id==='auto'?'Automatic':id==='system'?'Follow device settings':
 id==='off'?'Off':id==='on'?'On':id.replace(/-/g,' ').replace(/^./,c=>c.toUpperCase());
export function DiceEffectsControls({value,onChange,profile}){
 const p=validateDicePresentation(value);
 const change=(key,x)=>onChange?.(validateDicePresentation({...p,[key]:x}));
 const select=(label,key,items)=><label key={key}>{label}
  <select aria-label={label} value={p[key]} onChange={e=>change(key,e.target.value)}>
   {items.map(v=><option key={v} value={v}>{caption(v)}</option>)}
  </select>
 </label>;
 return <section className="asteria-dice-fx-controls"
  aria-label="Dice effects and performance controls">
  <div className="asteria-dice-fx-settings-grid">
   {select('Graphics quality','graphics',GRAPHICS)}
   {select('Critical roll effects','criticalEffects',EFFECT_LEVELS)}
   {select('Elemental effects','element',ELEMENTS)}
   {select('Element effect intensity','effects',EFFECT_LEVELS)}
   {select('Sound pack','soundPack',SOUND_PACKS)}
   {select('Impact volume','volume',TRAY_SOUND_LEVELS)}
   {select('Reduced motion','reducedMotion',REDUCED_MOTION)}
   <label className="asteria-dice-fx-mute">
    <input type="checkbox" aria-label="Mute dice sounds" checked={p.muted}
     onChange={e=>change('muted',e.target.checked)}/> Mute dice sounds
   </label>
  </div>
  <p className="asteria-advanced-dice-help">
   Active graphics: <strong>{caption(profile.tier)}</strong>
   {profile.requested==='auto'?' (adapted to this device)':''}.
   {profile.reducedMotion?' Reduced motion: showing confirmed totals without tumbling.':''}
   {' '}Sounds start only after a permitted user interaction.
   Preferences are saved on this device, not in gameplay records.
  </p>
 </section>;
}
