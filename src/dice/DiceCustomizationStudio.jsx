import React,{useId,useState} from 'react';
import {CoreDicePicker} from './CoreDicePicker.jsx';
import {DiceTrayStudio} from './DiceTrayStudio.jsx';
import {STUDIO_LOOKS} from './diceStudioModel.mjs';

/** Shared visual editor; no writes, dice roll requests or account collections. */
export function DiceCustomizationStudio({
  value,onChange,trayValue,onTrayChange,
  onUndo,onRedo,canUndo=false,canRedo=false,onApplyLook,onMatch,onRestore
}){
  const id=useId(),[mode,setMode]=useState('basic');
  const [target,setTarget]=useState('dice'),[notice,setNotice]=useState('');
  const inform=(message,handler)=>{
    handler?.();
    setNotice(message);
  };
  return <section className="asteria-dice-studio" aria-label="Dice Customisation Studio">
    <header className="asteria-dice-studio-heading">
      <div>
        <h3>Dice Customisation Studio</h3>
        <p>Personalise your dice and their physical tray. Changes are preview-only until a roll is requested.</p>
      </div>
      <span>Local session · saving arrives in Phase 3.7</span>
    </header>
    <div className="asteria-dice-studio-tabs" role="tablist" aria-label="Customisation detail">
      {['basic','advanced'].map(key=><button key={key} type="button"
        id={id+'-'+key} role="tab" aria-controls={id+'-panel'}
        aria-selected={mode===key} tabIndex={mode===key?0:-1}
        className={mode===key?'is-selected':''}
        onClick={()=>{setMode(key);setNotice('');}}>
        {key==='basic'?'Basic':'Advanced'}
      </button>)}
    </div>
    <div className="asteria-dice-studio-toolbar" role="group" aria-label="Appearance history">
      <button type="button" disabled={!canUndo}
        onClick={()=>inform('Last appearance change undone.',onUndo)}>Undo</button>
      <button type="button" disabled={!canRedo}
        onClick={()=>inform('Appearance change redone.',onRedo)}>Redo</button>
      <button type="button" onClick={()=>inform('Selected design restored to its defaults.',
        ()=>onRestore(target))}>Restore selected design</button>
      <button type="button" onClick={()=>inform('Dice and tray restored to starting defaults.',
        ()=>onRestore('all'))}>Restore both</button>
    </div>
    <section className="asteria-dice-studio-looks" aria-label="Ready-made matching looks">
      <strong>Matching looks</strong>
      <div className="asteria-dice-studio-looks-grid">
        {STUDIO_LOOKS.map(look=><button key={look.id} type="button"
          onClick={()=>inform(look.name+' appearance applied.',
            ()=>onApplyLook(look.id))}>
          {look.name}
        </button>)}
      </div>
      <button type="button" className="asteria-dice-studio-match"
        onClick={()=>inform('Tray frame, lining and trim now match the dice palette.',onMatch)}>
        Match tray colours to dice
      </button>
    </section>
    <div className="asteria-dice-studio-targets" role="group" aria-label="Choose appearance to edit">
      <button type="button" aria-pressed={target==='dice'}
        className={target==='dice'?'is-selected':''}
        onClick={()=>setTarget('dice')}>Dice</button>
      <button type="button" aria-pressed={target==='tray'}
        className={target==='tray'?'is-selected':''}
        onClick={()=>setTarget('tray')}>Tray</button>
    </div>
    <div role="tabpanel" id={id+'-panel'} aria-labelledby={id+'-'+mode}
      className="asteria-dice-studio-panel" data-studio-mode={mode} data-studio-target={target}>
      {target==='dice'?
        <CoreDicePicker value={value} onChange={onChange} mode={mode}/>:
        <DiceTrayStudio value={trayValue} onChange={onTrayChange} mode={mode}/>}
    </div>
    <p className="asteria-dice-studio-tower-note">
      Dice towers unlock in Phases 3.8–3.9. Tower pairing is not selectable yet;
      the six 3D trays are fully editable today.
    </p>
    {notice?<p className="asteria-dice-studio-status" role="status" aria-live="polite">{notice}</p>:null}
  </section>;
}
