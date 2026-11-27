import React from 'react';
import {diceEffectForRecord} from './dicePresentationModel.mjs';
/** Pure decoration; does not touch die meshes, dice physics or recorded totals. */
export function DiceOutcomeEffects({record,preferences,profile,replayToken=0}){
 const fx=diceEffectForRecord(record,preferences,profile);
 if(!fx.critical&&!fx.element)return null;
 return <div key={String(record?.id||'roll')+':'+String(replayToken)}
  className={'asteria-dice-outcome-fx asteria-dice-outcome-fx-'+fx.intensity+
    (fx.critical?' asteria-dice-outcome-fx-'+fx.critical:'')}
  aria-hidden="true" data-critical-effect={fx.critical||'none'}
  data-element-effect={fx.element||'none'} data-particle-count={fx.count}
  style={{'--asteria-fx-primary':fx.primary,'--asteria-fx-secondary':fx.secondary}}>
  <span className="asteria-dice-outcome-ring"/>
  {Array.from({length:fx.count},(_,i)=><span key={i}
    className="asteria-dice-outcome-spark"
    style={{'--asteria-spark-index':i,
      '--asteria-spark-angle':Math.round(i*360/fx.count)+'deg',
      '--asteria-spark-delay':((i%5)*.055)+'s'}}/>)}
 </div>;
}
