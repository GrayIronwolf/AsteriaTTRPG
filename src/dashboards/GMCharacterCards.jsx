import React,{useState} from 'react';
import {
  GM_CARD_FIELDS,GM_CARD_TEMPLATES,GM_CARD_THEMES,
  normalizeGMCharacterCard,defaultGMCharacterCard,
  gmCharacterCardSections,moveGMCardField,toggleGMCardField,
  validateGMCharacterCard
} from '../state/gmCharacterCardModel.mjs';

const kindFor=row=>row?.official?'official':row?.kind||row?.libraryKind||'npc';

export function GMCharacterCardPreview({record={},settings,compact=false}){
  const kind=kindFor(record);
  const card=normalizeGMCharacterCard(settings??record.card,kind);
  const sections=gmCharacterCardSections(record,card);
  const name=String(record.name||record.title||'Unnamed Character');
  const subtitle=card.tagline||[record.role,record.race||record.species,record.threatTier].filter(Boolean).join(' · ');
  const portrait=card.portraitUrl;
  const initial=name.slice(0,1).toUpperCase()||'?';
  return <article className="react-gm-character-card" data-template={card.template}
    data-theme={card.theme} data-compact={compact?'true':'false'}
    aria-label={name+' character card'}>
    <header className="react-gm-card-banner">
      <span>{record.official?'Official Compendium':kind==='creature'?'Campaign Creature':'Campaign NPC'}</span>
      <span>ASTERIA</span>
    </header>
    <div className="react-gm-card-body">
      <div className="react-gm-card-portrait">
        {portrait?<img src={portrait} alt="" loading="lazy" referrerPolicy="no-referrer"/>:
          <span aria-hidden="true">{initial}</span>}
      </div>
      <div className="react-gm-card-content">
        <div className="react-gm-card-identity">
          <h3>{name}</h3>
          {subtitle?<p>{subtitle}</p>:null}
        </div>
        <dl className="react-gm-card-details">
          {sections.map(section=><div key={section.id} className="react-gm-card-detail"
            data-private={section.private?'true':'false'}>
            <dt>{section.label}{section.private?' · GM Only':''}</dt>
            <dd>{section.value}</dd>
          </div>)}
        </dl>
        {!sections.length?<p className="react-gm-card-empty">No selected details available for this character.</p>:null}
      </div>
    </div>
    <footer className="react-gm-card-footer">
      <span>{record.official?'Official reference · read-only':'Private GM campaign record'}</span>
      <span>{card.template==='tactical'?'Tactical Card':card.template==='dossier'?'Dossier Card':'Portrait Card'}</span>
    </footer>
  </article>;
}

/**
 * Layout, field order and art settings are an edit-in-preview draft only.
 * Parent confirms persistence via its existing authorized GM world patch.
 */
export function GMCharacterCardStudio({record={},onSave,onClose,disabled=false}){
  const kind=kindFor(record);
  const readOnly=Boolean(record.official)||typeof onSave!=='function';
  const [draft,setDraft]=useState(()=>normalizeGMCharacterCard(record.card,kind));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const blocked=disabled||busy;
  const fieldById=id=>GM_CARD_FIELDS.find(field=>field.id===id);
  const hidden=GM_CARD_FIELDS.filter(field=>!draft.fields.includes(field.id));
  const change=(key,value)=>setDraft(old=>({...old,[key]:value}));
  const save=async()=>{
    if(blocked||readOnly)return;
    const checked=validateGMCharacterCard(draft,kind);
    if(!checked.ok){setMessage(checked.error);return;}
    setBusy(true);setMessage('Saving character card...');
    try{
      const result=await onSave(checked.card);
      if(result?.ok===false){setMessage(result.error||'Card could not be saved.');return;}
      setDraft(checked.card);
      setMessage('Character card settings saved to the campaign record.');
    }catch(error){setMessage(error?.message||'Card could not be saved.');}
    finally{setBusy(false);}
  };
  return <section className="react-gm-card-studio" aria-label={'Character Card Studio for '+(record.name||'character')}>
    <header className="react-gm-card-studio-header">
      <div><h2>Character Card Studio</h2>
        <p>{readOnly?'Official bestiary cards are reference-only.':
          'Customise the existing campaign character card. Changes remain private to the GM until saved.'}</p>
      </div>
      <button type="button" disabled={blocked} onClick={onClose}>Close Card Studio</button>
    </header>
    <div className="react-gm-card-studio-grid">
      {!readOnly?<div className="react-gm-card-studio-controls">
        <fieldset>
          <legend>Card layout</legend>
          <div className="react-gm-card-option-list">
            {GM_CARD_TEMPLATES.map(template=><button key={template.id} type="button"
              aria-pressed={draft.template===template.id} disabled={blocked}
              onClick={()=>change('template',template.id)}>
              <strong>{template.label}</strong><small>{template.description}</small>
            </button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>Card finish</legend>
          <div className="react-gm-card-option-list">
            {GM_CARD_THEMES.map(theme=><button key={theme.id} type="button"
              aria-pressed={draft.theme===theme.id} disabled={blocked}
              onClick={()=>change('theme',theme.id)}>{theme.label}</button>)}
          </div>
        </fieldset>
        <label className="react-gm-card-setting">
          Subtitle / Epithet
          <input type="text" maxLength={100} value={draft.tagline} disabled={blocked}
            onChange={event=>change('tagline',event.target.value)}
            placeholder="Optional card subtitle"/>
        </label>
        <label className="react-gm-card-setting">
          Portrait image URL (HTTPS or local site image path)
          <input type="text" maxLength={600} value={draft.portraitUrl} disabled={blocked}
            onChange={event=>change('portraitUrl',event.target.value)}
            placeholder="https://... or images/portrait.png" autoComplete="off"/>
        </label>
        <p className="react-gm-card-hint">Portraits are linked, not uploaded. Only use image URLs you trust. Blank URLs display a character initial.</p>
        <fieldset>
          <legend>Visible fields and order</legend>
          <div className="react-gm-card-field-list">
            {draft.fields.map((field,index)=>{
              const data=fieldById(field);
              return <div className="react-gm-card-field" key={field}>
                <span>{data.label}{data.private?' · GM Only':''}</span>
                <div>
                  <button type="button" disabled={blocked||index===0}
                    aria-label={'Move '+data.label+' up'}
                    onClick={()=>setDraft(old=>moveGMCardField(old,kind,field,-1))}>Up</button>
                  <button type="button" disabled={blocked||index===draft.fields.length-1}
                    aria-label={'Move '+data.label+' down'}
                    onClick={()=>setDraft(old=>moveGMCardField(old,kind,field,1))}>Down</button>
                  <button type="button" disabled={blocked} aria-label={'Hide '+data.label}
                    onClick={()=>setDraft(old=>toggleGMCardField(old,kind,field,false))}>Hide</button>
                </div>
              </div>;
            })}
          </div>
          <p className="react-gm-card-hint">Only fields present in the existing character record appear on the card. Private GM Notes are hidden by default.</p>
          {hidden.length?<div className="react-gm-card-hidden-fields">
            <p>Add fields</p>
            <div>{hidden.map(field=><button type="button" key={field.id}
              disabled={blocked} onClick={()=>setDraft(old=>toggleGMCardField(old,kind,field.id,true))}>
              Add {field.label}{field.private?' (GM Only)':''}
            </button>)}</div>
          </div>:null}
        </fieldset>
        <div className="react-gm-card-studio-actions">
          <button type="button" disabled={blocked}
            onClick={()=>{setDraft(defaultGMCharacterCard(kind));setMessage('Preview reset; save to apply.');}}>Reset Preview</button>
          <button type="button" className="primary" disabled={blocked}
            onClick={save}>{busy?'Saving...':'Save Character Card'}</button>
        </div>
      </div>:null}
      <div className="react-gm-card-live-preview">
        <h3>Live preview</h3>
        <GMCharacterCardPreview record={record} settings={draft}/>
      </div>
    </div>
    {readOnly?<p className="react-gm-card-hint">This reference uses the published Asteria Compendium. Create a separate campaign creature to customise its card.</p>:null}
    <p className="react-gm-card-feedback" role="status" aria-live="polite">{message}</p>
  </section>;
}
