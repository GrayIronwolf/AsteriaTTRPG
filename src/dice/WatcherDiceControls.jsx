import React from 'react';
import {
  EYE_TYPES,EYE_PUPILS,EYE_MOTION,BLINK,GLOW,TRANSPARENCY,
  validateDiceAppearance
} from './diceAppearanceCatalogue.mjs';
import {
  WATCHER_IRIS_SWATCHES,WATCHER_SCLERA_SWATCHES,
  WATCHER_RESIN_SWATCHES,WATCHER_SWIRL_PRESETS
} from './watcherDiceDesign.mjs';

const titleCase=s=>s.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
function EyeColour({label,value,swatches,onChange}){
  return <div className="asteria-watcher-color">
    <label>{label}<input aria-label={label+' custom colour'}
      type="color" value={value} onChange={event=>onChange(event.target.value.toUpperCase())}/></label>
    <div className="asteria-watcher-swatches" role="group" aria-label={label+' swatches'}>
      {swatches.map(hex=><button key={hex} type="button"
        aria-label={label+' '+hex} aria-pressed={hex.toUpperCase()===value.toUpperCase()}
        className={hex.toUpperCase()===value.toUpperCase()?'is-selected':''}
        onClick={()=>onChange(hex)} style={{'--watcher-color':hex}}>
        <span aria-hidden="true"/></button>)}
    </div>
  </div>;
}
function Choice({label,value,items,onChange}){
  return <label>{label}<select value={value} aria-label={label}
    onChange={event=>onChange(event.target.value)}>
    {items.map(x=><option key={x} value={x}>{titleCase(x)}</option>)}
  </select></label>;
}
export function WatcherDiceControls({value,onChange}){
  const eye=value.special;
  const update=(data,extra={})=>onChange(validateDiceAppearance({
    ...value,...extra,special:{...eye,...data}
  }));
  return <section className="asteria-watcher-controls" aria-label="Watcher Dice customisation">
    <div className="asteria-watcher-controls-heading">
      <strong>Watcher Dice · Living Eye</strong>
      <small>Customise the suspended 3D eye independently from the gel resin.</small>
    </div>
    <div className="asteria-watcher-fields">
      <Choice label="Eye type" value={eye.eyeType} items={EYE_TYPES}
        onChange={eyeType=>update({eyeType})}/>
      <Choice label="Pupil shape" value={eye.pupil} items={EYE_PUPILS}
        onChange={pupil=>update({pupil})}/>
    </div>
    <EyeColour label="Iris" value={eye.irisColor} swatches={WATCHER_IRIS_SWATCHES}
      onChange={irisColor=>update({irisColor})}/>
    <EyeColour label="Sclera" value={eye.scleraColor} swatches={WATCHER_SCLERA_SWATCHES}
      onChange={scleraColor=>update({scleraColor})}/>
    <EyeColour label="Resin" value={eye.resinColor} swatches={WATCHER_RESIN_SWATCHES}
      onChange={resinColor=>update({resinColor},{primaryColor:resinColor})}/>
    <EyeColour label="Numerals" value={value.numberColor}
      swatches={['#E7F3FB','#F2F3EE','#111925','#D5B36A','#D3DDE4','#AE3241']}
      onChange={numberColor=>update({},{numberColor})}/>
    <div className="asteria-watcher-fields">
      <Choice label="Resin transparency" value={eye.transparency} items={TRANSPARENCY}
        onChange={transparency=>update({transparency})}/>
      <Choice label="Internal swirl" value={eye.swirl||'aurora'} items={WATCHER_SWIRL_PRESETS}
        onChange={swirl=>update({swirl})}/>
      <Choice label="Eye glow" value={eye.glow} items={GLOW}
        onChange={glow=>update({glow})}/>
      <Choice label="Eye movement" value={eye.motion} items={EYE_MOTION}
        onChange={motion=>update({motion})}/>
      <Choice label="Blinking" value={eye.blink} items={BLINK}
        onChange={blink=>update({blink})}/>
    </div>
    <label className="asteria-watcher-check"><input type="checkbox"
      checked={eye.cursorTracking} aria-label="Eye follows pointer"
      onChange={event=>update({cursorTracking:event.target.checked})}/>
      Eye follows pointer</label>
    <small className="asteria-watcher-note">
      Motion and pointer tracking follow reduced-motion and device-quality settings.
      This is a cosmetic 3D eye; official results and face values are unchanged.
    </small>
  </section>;
}
