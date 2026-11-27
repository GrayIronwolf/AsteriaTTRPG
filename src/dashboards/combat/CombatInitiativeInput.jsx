import React,{useEffect,useState} from 'react';
import {ManualNumberInput} from '../../components/ManualNumberInput.jsx';
import {isManualNumber} from '../../state/manualNumber.mjs';

/** Equivalent to the recovered GM initiative editor, now owned by Combat Command Centre.
 * Never coerce an empty draft to initiative zero and never create a second write path. */
export function CombatInitiativeInput({entry,disabled=false,onCommit}){
  const displayed=entry.initiativeSet===false&&!entry.initiativeRoll?''
    :entry.initiative===undefined||entry.initiative===null?''
      :String(Number(entry.initiative));
  const [value,setValue]=useState(displayed);
  useEffect(()=>setValue(displayed),[entry.id,displayed]);
  const commit=()=>{
    if(!isManualNumber(value))return setValue(displayed);
    const next=Number(value);
    if(next!==Number(entry.initiative??0)||!entry.initiativeSet)onCommit(next);
  };
  return <ManualNumberInput aria-label={entry.name+' initiative'}
    placeholder="Roll on start" disabled={disabled} value={value}
    onChange={event=>setValue(event.target.value)}
    onBlur={commit} onKeyDown={event=>{
      if(event.key==='Enter')event.currentTarget.blur();
      if(event.key==='Escape'){setValue(displayed);event.currentTarget.blur();}
    }}/>;
}
