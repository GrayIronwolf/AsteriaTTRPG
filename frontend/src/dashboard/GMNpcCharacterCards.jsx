import React,{useState} from 'react';
import {
  GM_CARD_FIELDS,GM_CARD_TEMPLATES,GM_CARD_THEMES,
  normalizeGMCharacterCard,gmCharacterCardSections,defaultGMCharacterCard,
  toggleGMCardField,moveGMCardField,validateGMCharacterCard
} from '../../../src/state/gmCharacterCardModel.mjs';
import styles from './GMNpcToolkit.module.css';

export function GMNpcCardPreview({record={},settings,compact=false}){
  const kind=record.official?'official':record.kind||record.libraryKind||'npc';
  const card=normalizeGMCharacterCard(settings??record.card,kind);
  const rows=gmCharacterCardSections(record,card);
  const name=String(record.name||record.title||'Unnamed Character');
  const subtitle=card.tagline||
    [record.role,record.race||record.species,record.threatTier].filter(Boolean).join(' · ');
  return <article className={styles.characterCard} data-template={card.template}
    data-theme={card.theme} data-compact={compact}>
    <header><span>{record.official?'Official Compendium':kind==='creature'?
      'Campaign Creature':'Campaign NPC'}</span><strong>ASTERIA</strong></header>
    <div className={styles.cardBody}>
      <div className={styles.cardPortrait}>
        {card.portraitUrl?<img alt="" loading="lazy" referrerPolicy="no-referrer"
          src={card.portraitUrl}/>:<span aria-hidden="true">{name.slice(0,1).toUpperCase()}</span>}
      </div>
      <div className={styles.cardFacts}><h3>{name}</h3>{subtitle?<p>{subtitle}</p>:null}
        <dl>{rows.map(row=><div key={row.id}>
          <dt>{row.label}{row.private?' · GM Only':''}</dt><dd>{row.value}</dd>
        </div>)}</dl>
        {!rows.length?<small>No character card details selected.</small>:null}
      </div>
    </div>
    <footer>{record.official?'Read-only official reference':'Private GM character card'}
      {' · '}{card.template}</footer>
  </article>;
}
export function GMNpcCardStudio({record,onSave,onClose,disabled=false}){
  const kind=record.official?'official':record.kind||'npc';
  const readOnly=Boolean(record.official)||typeof onSave!=='function';
  const [draft,setDraft]=useState(()=>normalizeGMCharacterCard(record.card,kind));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const blocked=disabled||busy;
  const set=(key,value)=>setDraft(old=>({...old,[key]:value}));
  const hidden=GM_CARD_FIELDS.filter(row=>!draft.fields.includes(row.id));
  const save=async()=>{
    if(blocked||readOnly)return;
    const checked=validateGMCharacterCard(draft,kind);
    if(!checked.ok){setError(checked.error);return;}
    setBusy(true);setError('');setMessage('');
    try{
      const result=await onSave(checked.card);
      if(result?.ok===false)throw Error(result.error||'Character card was not saved.');
      setDraft(checked.card);setMessage('Character card saved to the private campaign record.');
    }catch(err){setError(err?.message||'Character card was not saved.');}
    finally{setBusy(false);}
  };
  return <section className={styles.subpanel} aria-label={'Character Card Studio for '+record.name}
    data-testid="site-gm-card-studio">
    <header className={styles.head}><div><h3>Character Card Studio · {record.name}</h3>
      <p>{readOnly?'Official entries are reference-only.':'Card settings remain private to campaign GMs.'}</p>
    </div><button type="button" onClick={onClose} disabled={blocked}>Close Studio</button></header>
    <div className={styles.cardGrid}>
      {!readOnly?<div className={styles.form}>
        <div className={styles.fields}>
          <label>Layout<select disabled={blocked} value={draft.template}
            onChange={e=>set('template',e.target.value)}>
            {GM_CARD_TEMPLATES.map(row=><option value={row.id} key={row.id}>{row.label}</option>)}
          </select></label>
          <label>Finish<select disabled={blocked} value={draft.theme}
            onChange={e=>set('theme',e.target.value)}>
            {GM_CARD_THEMES.map(row=><option value={row.id} key={row.id}>{row.label}</option>)}
          </select></label>
          <label>Subtitle<input maxLength={100} disabled={blocked} value={draft.tagline}
            onChange={e=>set('tagline',e.target.value)}/></label>
          <label>Portrait URL (HTTPS or approved site asset)
            <input maxLength={600} disabled={blocked} value={draft.portraitUrl}
              onChange={e=>set('portraitUrl',e.target.value)}/></label>
        </div>
        <fieldset className={styles.fieldset}><legend>Visible Card Fields &amp; Order</legend>
          {draft.fields.map((id,index)=>{
            const field=GM_CARD_FIELDS.find(row=>row.id===id);
            return <div className={styles.cardSetting} key={id}>
              <span>{field.label}{field.private?' · GM Only':''}</span>
              <div className={styles.actions}>
                <button type="button" disabled={blocked||index===0}
                  onClick={()=>setDraft(old=>moveGMCardField(old,kind,id,-1))}
                  aria-label={'Move '+field.label+' up'}>Up</button>
                <button type="button" disabled={blocked||index===draft.fields.length-1}
                  onClick={()=>setDraft(old=>moveGMCardField(old,kind,id,1))}
                  aria-label={'Move '+field.label+' down'}>Down</button>
                <button type="button" disabled={blocked}
                  onClick={()=>setDraft(old=>toggleGMCardField(old,kind,id,false))}
                  aria-label={'Hide '+field.label}>Hide</button>
              </div>
            </div>;
          })}
          {hidden.length?<div className={styles.actions}>{hidden.map(field=>
            <button type="button" key={field.id} disabled={blocked}
              onClick={()=>setDraft(old=>toggleGMCardField(old,kind,field.id,true))}>
              Add {field.label}{field.private?' (GM Only)':''}</button>)}</div>:null}
        </fieldset>
        <div className={styles.actions}>
          <button type="button" disabled={blocked} onClick={()=>{
            setDraft(defaultGMCharacterCard(kind));setMessage('Preview reset. Save to apply.');}}>
            Reset Preview</button>
          <button type="button" disabled={blocked} onClick={save}>Save Character Card</button>
        </div>
      </div>:null}
      <div><h4>Live Preview</h4><GMNpcCardPreview record={record} settings={draft}/></div>
    </div>
    {readOnly?<p>This published entry cannot be edited. Create a separate campaign creature to customise its card.</p>:null}
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
  </section>;
}
