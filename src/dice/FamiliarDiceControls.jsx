import React from 'react';
import {validateDiceAppearance,CAT_PATTERNS,CAT_POSES,TRANSPARENCY} from './diceAppearanceCatalogue.mjs';
import {
  FAMILIAR_COAT_COLORS,FAMILIAR_EYE_COLORS,FAMILIAR_PAW_COLORS,
  FAMILIAR_NUMBER_COLORS,FAMILIAR_DECORATIONS
} from './familiarDiceArt.mjs';

function TitleCase(text){
  return String(text).replaceAll('-',' ').replace(/\b\w/g,ch=>ch.toUpperCase());
}
function ColorChoices({title,value,options,onChange}){
  return <div className="asteria-familiar-colour-options">
    <label>{title}
      <input type="color" aria-label={title+' custom colour'} value={value}
        onChange={event=>onChange(event.target.value.toUpperCase())}/>
    </label>
    <div className="asteria-familiar-swatches" role="group" aria-label={title+' swatches'}>
      {options.map(color=><button type="button" key={color}
        className={color.toUpperCase()===value.toUpperCase()?'is-selected':''}
        style={{'--familiar-swatch':color}}
        onClick={()=>onChange(color)}
        aria-pressed={color.toUpperCase()===value.toUpperCase()}
        aria-label={title+' '+color}><span aria-hidden="true"/></button>)}
    </div>
  </div>;
}
export function FamiliarDiceControls({value,onChange}){
  const cat=value.special;
  const update=(changes,outer={})=>{
    onChange(validateDiceAppearance({...value,...outer,
      special:{...cat,...changes}}));
  };
  return <section className="asteria-familiar-controls" aria-label="Familiar Dice customisation">
    <div className="asteria-familiar-controls-heading">
      <strong>Familiar Dice · Cat Collection</strong>
      <small>White resin, black cat silhouettes and gold numbers are the featured default.</small>
    </div>
    <ColorChoices title="Cat coat" value={cat.coatColor}
      options={FAMILIAR_COAT_COLORS} onChange={coatColor=>update({coatColor})}/>
    <div className="asteria-familiar-fields">
      <label>Coat pattern
        <select aria-label="Cat coat pattern" value={cat.coatPattern}
          onChange={event=>update({coatPattern:event.target.value})}>
          {CAT_PATTERNS.map(id=><option value={id} key={id}>{TitleCase(id)}</option>)}
        </select>
      </label>
      <label>Cat pose
        <select aria-label="Cat pose" value={cat.pose}
          onChange={event=>update({pose:event.target.value})}>
          {CAT_POSES.map(id=><option value={id} key={id}>{TitleCase(id)}</option>)}
        </select>
      </label>
    </div>
    <ColorChoices title="Cat eyes" value={cat.eyeColor}
      options={FAMILIAR_EYE_COLORS} onChange={eyeColor=>update({eyeColor})}/>
    <ColorChoices title="Paw prints" value={cat.pawColor}
      options={FAMILIAR_PAW_COLORS} onChange={pawColor=>update({pawColor})}/>
    <ColorChoices title="Resin body" value={cat.resinColor}
      options={['#F2F3EE','#FFFFFF','#B0E7EF','#D3DDE4','#C982A5',
        '#43AEC2','#295EA8','#247858','#7947B2','#AE3241','#D5B36A',
        '#9C7047','#61412F','#162C53','#111925','#C27B31']}
      onChange={resinColor=>update({resinColor},{primaryColor:resinColor})}/>
    <ColorChoices title="Familiar numerals" value={value.numberColor}
      options={FAMILIAR_NUMBER_COLORS}
      onChange={numberColor=>update({}, {numberColor})}/>
    <div className="asteria-familiar-fields">
      <label>Resin appearance
        <select value={cat.transparency} aria-label="Familiar resin transparency"
          onChange={event=>update({transparency:event.target.value})}>
          {TRANSPARENCY.map(id=><option value={id} key={id}>{TitleCase(id)}</option>)}
        </select>
      </label>
      <label>Decorative motif
        <select aria-label="Familiar decorative motif" value={cat.decoration}
          onChange={event=>update({decoration:event.target.value})}>
          {FAMILIAR_DECORATIONS.map(id=><option value={id} key={id}>
            {TitleCase(id)}</option>)}
        </select>
      </label>
    </div>
    <label className="asteria-familiar-animation">
      <input type="checkbox" checked={cat.animation}
        aria-label="Animate Familiar Dice shimmer"
        onChange={event=>update({animation:event.target.checked})}/>
      Animated resin shimmer (cosmetic only)
    </label>
    <small className="asteria-familiar-note">
      Resin is a PBR glass-look surface rather than physically refractive liquid.
      Reduced-motion settings disable automatic shimmer and dice roll animations.
      No roll value, number face or gameplay rule is changed by these settings.
    </small>
  </section>;
}
