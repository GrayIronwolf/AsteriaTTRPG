import React from 'react';
import {TRAY_FAMILIES,TRAY_SIZE_IDS,TRAY_WALL_HEIGHT_IDS,TRAY_FRAME_MATERIALS,
  TRAY_INTERIOR_MATERIALS,TRAY_RIM_PROFILES,TRAY_ENGRAVINGS,TRAY_EMBLEMS,
  TRAY_LIGHTING,TRAY_WEAR,TRAY_SOUNDS,TRAY_SOUND_LEVELS,TRAY_COLORS,
  defaultDiceTrayAppearance,validateDiceTrayAppearance} from './diceTrayCatalogue.mjs';

const label=id=>id.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
function Option({name,value,items,onChange}){
  return <label>{name}<select aria-label={name} value={value} onChange={event=>onChange(event.target.value)}>
    {items.map(id=><option key={id} value={id}>{label(id)}</option>)}
  </select></label>;
}
function ColorOption({name,value,onChange}){
  return <div className="asteria-tray-color"><label>{name}
    <input type="color" aria-label={name+' custom colour'} value={value}
      onChange={event=>onChange(event.target.value.toUpperCase())}/>
  </label><div className="asteria-tray-swatches" role="group" aria-label={name+' presets'}>
    {TRAY_COLORS.map(x=><button type="button" key={x}
      aria-label={name+' '+x} title={x} aria-pressed={x.toUpperCase()===value.toUpperCase()}
      className={x.toUpperCase()===value.toUpperCase()?'is-selected':''}
      style={{'--tray-color':x}} onClick={()=>onChange(x)}>
      <span aria-hidden="true"/></button>)}
  </div></div>;
}
export function DiceTrayStudio({value,onChange,rolling=false,mode='advanced'}){
  const patch=change=>onChange(validateDiceTrayAppearance({...value,...change}));
  return <section className="asteria-tray-studio" aria-label="3D Dice Tray Studio">
    <header className="asteria-tray-studio-heading">
      <strong>3D Dice Tray Studio</strong>
      <small>Six realistic tray bodies — design, materials, detailing and sound</small>
    </header>
    <div className="asteria-tray-design-grid" role="group" aria-label="Six dice tray designs">
      {TRAY_FAMILIES.map(f=><button key={f.id} type="button"
        className={value.designId===f.id?'is-selected':''}
        onClick={()=>onChange({...defaultDiceTrayAppearance(f.id),size:value.size})}
        aria-pressed={value.designId===f.id}
        title={f.name}>
        <span className="asteria-tray-design-swatch"
          style={{'--tray-frame':f.frameColor,'--tray-lining':f.interiorColor}} aria-hidden="true"/>
        <span>{f.name}</span>
      </button>)}
    </div>
    <div className="asteria-tray-options-grid">
      <Option name="Tray size" value={value.size} items={TRAY_SIZE_IDS}
        onChange={size=>patch({size})}/>
      {mode==='advanced'?<>
      <Option name="Wall height" value={value.wallHeight} items={TRAY_WALL_HEIGHT_IDS}
        onChange={wallHeight=>patch({wallHeight})}/>
      <Option name="Frame material" value={value.frameMaterial} items={TRAY_FRAME_MATERIALS}
        onChange={frameMaterial=>patch({frameMaterial})}/>
      <Option name="Interior material" value={value.interiorMaterial} items={TRAY_INTERIOR_MATERIALS}
        onChange={interiorMaterial=>patch({interiorMaterial})}/>
      <Option name="Rim profile" value={value.rim} items={TRAY_RIM_PROFILES}
        onChange={rim=>patch({rim})}/>
      <Option name="Engraving" value={value.engraving} items={TRAY_ENGRAVINGS}
        onChange={engraving=>patch({engraving})}/>
      <Option name="Centre emblem" value={value.emblem} items={TRAY_EMBLEMS}
        onChange={emblem=>patch({emblem})}/>
      <Option name="Lighting" value={value.lighting} items={TRAY_LIGHTING}
        onChange={lighting=>patch({lighting})}/>
      <Option name="Surface wear" value={value.wear} items={TRAY_WEAR}
        onChange={wear=>patch({wear})}/>
      <Option name="Impact sound" value={value.sound} items={TRAY_SOUNDS}
        onChange={sound=>patch({sound})}/>
      <Option name="Impact volume" value={value.soundVolume} items={TRAY_SOUND_LEVELS}
        onChange={soundVolume=>patch({soundVolume})}/>
      </>:null}
    </div>
    <div className="asteria-tray-colour-grid">
      <ColorOption name="Frame colour" value={value.frameColor}
        onChange={frameColor=>patch({frameColor})}/>
      <ColorOption name="Interior colour" value={value.interiorColor}
        onChange={interiorColor=>patch({interiorColor})}/>
      {mode==='advanced'?<ColorOption name="Metallic trim" value={value.trimColor}
        onChange={trimColor=>patch({trimColor})}/>:null}
    </div>
    <div className="asteria-tray-studio-footer">
      <button type="button" onClick={()=>onChange(defaultDiceTrayAppearance(value.designId))}>
        Restore tray defaults
      </button>
      <small>{rolling?'The active roll keeps its current collision tray until it settles.':
        'Rotate, zoom and preview the same 3D tray used for rolling. No gameplay changes.'}</small>
    </div>
  </section>;
}
