import React,{useEffect,useMemo,useState} from 'react';
import {GM_AREAS,RELATIONSHIP_SCOPES,RELATIONSHIP_LEVELS,REPUTATION_RANKS,
  relationshipLabel,reputationLabel,localGMSearch} from './digitalGMModel.mjs';
import {libraryDraft} from '../../../src/state/gmNpcCreatureLibraryModel.mjs';
import {generateNPCConcept,NPC_GENERATOR_ROLES,NPC_GENERATOR_MOODS} from '../../../src/state/gmNpcGeneratorModel.mjs';
import {GM_CARD_TEMPLATES,GM_CARD_THEMES,normalizeGMCharacterCard} from '../../../src/state/gmCharacterCardModel.mjs';
import {RANDOM_TABLE_CATEGORIES} from '../../../src/state/randomTableModel.mjs';
import {ASTERIA_MONTHS,ASTERIA_ERAS,formatAsteriaDate} from '../../../src/state/asteriaCalendarModel.mjs';
import {WEATHER_BIOMES,WEATHER_VOLATILITY} from '../../../src/state/weatherEnvironmentModel.mjs';
import {recordingSupportedMime,recordingBaseMime,RECORDING_FORMATS,
  RECORDING_MAX_SECONDS,RECORDING_MAX_BYTES}
  from '../../../src/state/sessionRecordingModel.mjs';
import styles from './DigitalGMWorkspace.module.css';

const newid=prefix=>prefix+'-'+crypto.randomUUID();
const rows=v=>Array.isArray(v)?v:[];
const options=(values,value,change,label)=> <label>{label}<select value={value}
  onChange={event=>change(event.target.value)}>{values.map(row=>{
    const id=typeof row==='string'?row:row.id;
    const name=typeof row==='string'?row:row.label||row.name;
    return <option value={id} key={id}>{name}</option>;
  })}</select></label>;
const field=(label,value,change,props={})=><label>{label}
  <input value={value} onChange={event=>change(event.target.value)} {...props}/></label>;
function Area({api,campaignId,area,onData,onError}){
  useEffect(()=>api.watchGM(campaignId,area,onData,onError),[api,campaignId,area,onData,onError]);
  return null;
}
function NPCEditor({data,action}){
  const [kind,setKind]=useState('npc'),[selected,setSelected]=useState(''),
    [draft,setDraft]=useState(libraryDraft()),[query,setQuery]=useState(''),
    [mood,setMood]=useState('Grounded'),[role,setRole]=useState('Merchant'),
    [preview,setPreview]=useState(null),[card,setCard]=useState(null);
  const library=rows(data.library).filter(x=>(kind==='all'||kind===x.kind)&&
    [x.name,x.race,x.species,x.faction,x.role,x.description].join(' ').toLowerCase().includes(query.toLowerCase()));
  const record=library.find(x=>x.id===selected);
  const update=(key,value)=>setDraft(old=>({...old,[key]:value}));
  const edit=row=>{setSelected(row.id);setKind(row.kind);setDraft(libraryDraft(row.kind,row));
    setCard(normalizeGMCharacterCard(row.card,row.kind));setPreview(null);};
  const create=()=>{setSelected('');setDraft(libraryDraft(kind));setPreview(null);setCard(null);};
  const operate=async(type,entry,success)=>{
    const id=selected||newid(kind),source=data.library.find(x=>x.id===id);
    const saved=await action.world({type,kind,id,entry,
      expectedUpdatedAt:source?.updatedAt||''},success);
    if(saved&&!selected)setSelected(id);
  };
  return <div className={styles.section} data-testid="site-digital-gm-library">
    <h3>NPC &amp; Creature Library</h3>
    <p>Campaign NPCs and creatures are private GM records. Official compendium creatures remain read-only; their statistics are not overwritten.</p>
    <div className={styles.fields}>
      {options([{id:'npc',label:'NPCs'},{id:'creature',label:'Creatures'},{id:'all',label:'All'}],
        kind,value=>{setKind(value);setSelected('');setDraft(libraryDraft(value));},'Library')}
      {field('Search library',query,setQuery,{type:'search'})}
    </div>
    <div className={styles.cards}>{library.slice(0,120).map(row=><article className={styles.card} key={row.id}>
      <strong>{row.name}</strong><span>{row.kind} · {row.role||row.species||row.race||'Unspecified'}</span>
      <small>{row.faction||row.location||''}</small>
      <button disabled={row.official||row.id.startsWith('legacy-')} onClick={()=>edit(row)}>
        {row.official?'Official: Read-only':'Edit Campaign Record'}</button>
    </article>)}</div>
    <button onClick={create} disabled={kind==='all'}>New {kind==='creature'?'Creature':'NPC'}</button>
    {kind!=='all'?<fieldset className={styles.box}><legend>{selected?'Edit':'Create'} {kind}</legend>
      <div className={styles.fields}>
        {['name','role','race','species','faction','location','personality','goals','fears',
          'dialogueStyle','description','notes','threatTier','hp','sp','mp','ac','initiative','xpReward']
          .filter(x=>kind==='npc'||!['race','personality','goals','fears','dialogueStyle'].includes(x))
          .map(x=>field(x,draft[x]??'',v=>update(x,v),{key:x}))}
      </div>
      <div className={styles.actions}>
        <button disabled={action.busy||!draft.name.trim()} onClick={()=>operate('library-save',draft,'Library record saved.')}>Save Record</button>
        {selected?<button disabled={action.busy} onClick={()=>action.world({type:'library-delete',
          kind,id:selected,expectedUpdatedAt:record?.updatedAt||''},'Record deleted.')
          .then(ok=>{if(ok)create();})}>Delete</button>:null}
      </div>
      {kind==='npc'?<div className={styles.box}><h4>Concept generator</h4>
        <div className={styles.fields}>
          {options(NPC_GENERATOR_ROLES,role,setRole,'Role')}
          {options(NPC_GENERATOR_MOODS,mood,setMood,'Mood')}
        </div>
        <button onClick={()=>setPreview(generateNPCConcept({seed:Date.now(),options:{
          role,mood},world:data.world,races:[]}))}>Generate Roleplay Draft</button>
        {preview?<div><strong>{preview.name}</strong><p>{preview.personality} · {preview.goals}</p>
          <button onClick={()=>{setDraft(libraryDraft('npc',preview));setPreview(null);}}>
            Use in NPC Editor</button></div>:null}
      </div>:null}
      {selected&&record?<div className={styles.box}><h4>Character Card</h4>
        {options(GM_CARD_TEMPLATES,card?.template||'portrait',
          v=>setCard(old=>({...old,template:v})),'Card layout')}
        {options(GM_CARD_THEMES,card?.theme||'obsidian',
          v=>setCard(old=>({...old,theme:v})),'Card theme')}
        {field('Card tagline',card?.tagline||'',v=>setCard(old=>({...old,tagline:v})))}
        {field('Portrait HTTPS URL or approved asset',card?.portraitUrl||'',
          v=>setCard(old=>({...old,portraitUrl:v})))}
        <button disabled={action.busy} onClick={()=>action.world({type:'card-save',kind,
          id:selected,card:card||normalizeGMCharacterCard(null,kind),
          expectedUpdatedAt:record.updatedAt||''},'Character card saved.')}>Save Character Card</button>
      </div>:null}
    </fieldset>:null}
  </div>;
}
function Reputation({data,action}){
  const [tab,setTab]=useState('relationship'),[recordId,setRecordId]=useState(''),
    [form,setForm]=useState({sourceType:'npc',targetType:'player',scope:'faction',
      sourceId:'',targetId:'',subjectId:'',level:'0',rank:'0',note:'',milestone:'',title:''}),
    [merchantId,setMerchantId]=useState(''),[character,setCharacter]=useState(''),
    [score,setScore]=useState('0'),[reason,setReason]=useState('');
  const collection=tab==='relationship'?data.relationships:data.reputations;
  const current=collection.find(x=>x.id===recordId);
  const update=(key,value)=>setForm(f=>({...f,[key]:value}));
  const edit=row=>{setRecordId(row.id);setForm(old=>({...old,...row,
    level:String(row.level??0),rank:String(row.rank??0)}));};
  const clear=()=>{setRecordId('');setForm({sourceType:'npc',targetType:'player',scope:'faction',
    sourceId:'',targetId:'',subjectId:'',level:'0',rank:'0',note:'',milestone:'',title:''});};
  const save=()=>action.world({type:tab==='relationship'?'relationship-save':'reputation-save',
    id:recordId||newid(tab),expectedRevision:current?.revision||0,entry:{
      ...form,level:Number(form.level),rank:Number(form.rank)
    }},'GM-only ledger updated. No automatic gameplay effect.');
  return <section className={styles.section} data-testid="site-digital-gm-reputation">
    <h3>Relationships &amp; Reputation</h3>
    <p>17 relationship levels and 15 global reputation ranks are GM-authored narrative ledgers.
      No automatic deterioration, price changes, NPC recognition or XP changes are inferred.
      Milestones and consequences require GM decisions.</p>
    <div className={styles.actions}>{options([{id:'relationship',label:'Relationships'},
      {id:'reputation',label:'Global reputation'}],tab,v=>{setTab(v);clear();},'Ledger')}</div>
    <div className={styles.cards}>{collection.map(row=><article className={styles.card} key={row.id}>
      <strong>{row.sourceId||row.subjectId}</strong>
      <span>{tab==='relationship'?row.label||relationshipLabel(row.level):
        (row.title||reputationLabel(row.rank))}</span><small>{row.note}</small>
      <button onClick={()=>edit(row)}>Edit</button>
    </article>)}</div>
    <fieldset className={styles.box}><legend>{recordId?'Edit':'Add'} {tab}</legend>
      <div className={styles.fields}>
        {tab==='relationship'?<>
          {options(RELATIONSHIP_SCOPES,form.sourceType,v=>update('sourceType',v),'Source type')}
          {field('Source record ID',form.sourceId,v=>update('sourceId',v))}
          {options(RELATIONSHIP_SCOPES,form.targetType,v=>update('targetType',v),'Target type')}
          {field('Target record ID',form.targetId,v=>update('targetId',v))}
          {options(RELATIONSHIP_LEVELS.map(v=>({id:String(v),label:relationshipLabel(v)})),
            String(form.level),v=>update('level',v),'Relationship level')}
        </>:<>
          {options(RELATIONSHIP_SCOPES,form.scope,v=>update('scope',v),'Scope')}
          {field('Subject record ID',form.subjectId,v=>update('subjectId',v))}
          {options(REPUTATION_RANKS.map(v=>({id:String(v),label:reputationLabel(v)})),
            String(form.rank),v=>update('rank',v),'Reputation rank')}
          {field('Custom rank title (optional)',form.title,v=>update('title',v))}
        </>}
        {field('Reason or significant event',form.note,v=>update('note',v))}
        {field('Milestone / recognition requirement',form.milestone,v=>update('milestone',v))}
      </div>
      <div className={styles.actions}>
        <button disabled={action.busy} onClick={save}>Save GM Ledger</button>
        {recordId?<button disabled={action.busy} onClick={()=>action.world({
          type:tab==='relationship'?'relationship-delete':'reputation-delete',
          id:recordId,expectedRevision:current?.revision||0},'Ledger entry deleted.')
          .then(ok=>{if(ok)clear();})}>Delete</button>:null}
        <button onClick={clear}>New Entry</button>
      </div>
    </fieldset>
    <h4>Existing Merchant Standing (server-authoritative)</h4>
    <p>Merchant scores remain on the established -100 to +100 scale. These are separate from global reputation and are checked by the backend when selling or purchasing restricted stock.</p>
    <div className={styles.cards}>{data.merchantRelationships.map(row=><article className={styles.card} key={row.id}>
      <strong>{row.shopId} / {row.characterId}</strong><span>{row.tier}: {row.score}</span>
      <small>{row.message}</small></article>)}</div>
    <div className={styles.fields}>
      {options([{id:'',label:'Select merchant'},...rows(data.sections.shops).map(s=>({id:s.id,label:s.name||s.id}))],
        merchantId,setMerchantId,'Merchant')}
      {options([{id:'',label:'Select player'},...rows(data.sections.characters).map(s=>({id:s.id,label:s.name||s.id}))],
        character,setCharacter,'Linked character')}
      {field('Standing (-100 to +100)',score,setScore,{type:'number',min:-100,max:100})}
      {field('GM reason',reason,setReason)}
    </div>
    <button disabled={!merchantId||!character||action.busy||!Number.isSafeInteger(Number(score))||
      Number(score)<-100||Number(score)>100} onClick={()=>action.command('merchant',
      {shopId:merchantId,characterId:character,score:Number(score),message:reason},
      'Merchant standing updated.')}>Update Merchant Standing</button>
  </section>;
}
function Stories({data,action}){
  const [note,setNote]=useState(data.notes?.privateNotes||''),[logTitle,setLogTitle]=useState(''),
    [logBody,setLogBody]=useState(''),[questTitle,setQuestTitle]=useState(''),
    [objective,setObjective]=useState(''),[questVisibility,setQuestVisibility]=useState('GM Only');
  useEffect(()=>setNote(data.notes?.privateNotes||''),[data.notes?.privateNotes]);
  return <section className={styles.section} data-testid="site-digital-gm-stories">
    <h3>Campaign Notes, Logs &amp; Quests</h3>
    <label>Private GM Notes<textarea rows="7" value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button disabled={action.busy||note.length>20000}
      onClick={()=>action.world({type:'note-save',text:note,
        expectedText:data.notes?.privateNotes||''},'GM notes saved.')}>Save Private Notes</button>
    <div className={styles.box}><h4>Session Log</h4>
      {field('Log title',logTitle,setLogTitle)}
      <label>Session summary<textarea rows="4" value={logBody} onChange={e=>setLogBody(e.target.value)}/></label>
      <button disabled={action.busy||!logTitle.trim()} onClick={()=>action.world({
        type:'note-log',title:logTitle,text:logBody},'Session log saved.')}>Save Session Log</button>
      {rows(data.notes?.sessionLogs).slice(0,30).map(row=><article className={styles.card} key={row.id}>
        <strong>{row.title}</strong><p>{row.body}</p></article>)}
    </div>
    <div className={styles.box}><h4>Quest Planning</h4>
      {field('Quest title',questTitle,setQuestTitle)}
      <label>Objective<textarea rows="3" value={objective} onChange={e=>setObjective(e.target.value)}/></label>
      {options(['GM Only','Players'],questVisibility,setQuestVisibility,'Visibility')}
      <button disabled={action.busy||!questTitle.trim()} onClick={()=>action.world({
        type:'quest-save',id:newid('quest'),expectedUpdatedAt:'',entry:{
          title:questTitle,objective,visibility:questVisibility,status:'Draft'
        }},'Quest draft saved.')}>Create Quest Draft</button>
      {data.quests.map(row=><article className={styles.card} key={row.id}>
        <strong>{row.title}</strong><span>{row.status} · {row.visibility}</span>
        <p>{row.objective}</p>
      </article>)}
      <p>Existing quest assignment and player progress remain controlled by the established campaign backend, not the note editor.</p>
    </div>
  </section>;
}
function Tables({data,action}){
  const [kind,setKind]=useState('random'),[selected,setSelected]=useState(''),
    [name,setName]=useState(''),[category,setCategory]=useState('npc'),
    [tier,setTier]=useState('1'),[entry,setEntry]=useState(''),[weight,setWeight]=useState('1'),
    [count,setCount]=useState('1'),
    [result,setResult]=useState(null);
  const available=kind==='random'?rows(data.sections.randomTables):
    kind==='loot'?rows(data.sections.lootTables):rows(data.sections.encounterPlans);
  const current=available.find(x=>x.id===selected);
  const perform=async(cmd,op,success)=>{
    const outcome=await action.command(cmd,op,success);
    if(outcome)setResult(outcome);
  };
  return <section className={styles.section} data-testid="site-digital-gm-tables">
    <h3>Random Tables, Loot Tables &amp; Encounter Generator</h3>
    {options([{id:'random',label:'Narrative random tables'},{id:'loot',label:'Weighted loot tables'},
      {id:'encounter',label:'Encounter & reward generation'}],kind,v=>{setKind(v);setSelected('');setResult(null);},'Tool')}
    <div className={styles.cards}>{available.map(x=><article className={styles.card} key={x.id}>
      <strong>{x.name||x.title||x.id}</strong>
      <span>{x.status} · Revision {x.revision||0}</span>
      <button onClick={()=>{setSelected(x.id);setName(x.name||'');}}>Inspect</button>
    </article>)}</div>
    {kind==='random'?<div className={styles.box}>
      {field('Table name',name,setName)}
      {options(RANDOM_TABLE_CATEGORIES,category,setCategory,'Category')}
      {field('Threat tier 1–20',tier,setTier,{type:'number',min:1,max:20})}
      {field('First weighted narrative result',entry,setEntry)}
      {field('Weight',weight,setWeight,{type:'number',min:1,max:1000})}
      <button disabled={action.busy||!name.trim()||!entry.trim()}
        onClick={()=>perform('random',{type:'save',tableId:selected||newid('random'),
          expectedRevision:current?.revision||0,
          table:{name,description:'',location:'',category,threatTier:Number(tier),
            entries:[{id:'result-1',kind:'text',label:entry,description:'',note:'',
              weight:Number(weight)}]}},'Random table saved.')}>Save Table</button>
      {current?<div className={styles.actions}><button disabled={action.busy}
        onClick={()=>perform('random',{type:'roll',tableId:current.id,
          expectedRevision:current.revision},'Secure random roll recorded.')}>Roll Table</button>
        <button disabled={action.busy} onClick={()=>perform('random',{type:'archive',
          tableId:current.id,expectedRevision:current.revision},'Random table archived.')}>Archive</button>
      </div>:null}
    </div>:kind==='loot'?<div className={styles.box}>
      {field('Loot table name',name,setName)}
      {field('Threat tier',tier,setTier,{type:'number',min:1,max:20})}
      {field('Item name',entry,setEntry)}
      <button disabled={action.busy||!name.trim()||!entry.trim()} onClick={()=>perform('loot',{
        type:'save',tableId:selected||newid('loot-table'),expectedRevision:current?.revision||0,
        table:{name,description:'',location:'',threatTier:Number(tier),status:'active',
          entries:[{id:'entry-1',kind:'item',name:entry,definitionId:'',
            minQuantity:1,maxQuantity:1,weight:1,note:''}]}
      },'Loot table saved.')}>Save Weighted Loot Table</button>
      {current?<div className={styles.actions}>
        <button disabled={action.busy} onClick={()=>perform('loot',{type:'preview',
          tableId:current.id},'Private treasure preview generated.')}>Preview Loot</button>
        <button disabled={action.busy} onClick={()=>perform('loot',{type:'generate',
          tableId:current.id,expectedRevision:current.revision},'Hidden treasure draft generated.')}>
          Generate Hidden Loot</button>
      </div>:null}
    </div>:<div className={styles.box}>
      {field('Threat tier',tier,setTier,{type:'number',min:1,max:20})}
      {field('Number of creatures',count,setCount,{type:'number',min:1,max:8})}
      <button disabled={action.busy} onClick={()=>perform('encounter',{type:'generate',
        threatTier:Number(tier),count:Number(count),tolerance:0,source:'all',biome:'',
        lootRolls:0,lootTableId:'',randomTableId:''},'Encounter proposal generated.')}>
        Generate Private Encounter Proposal</button>
      {current?.status==='draft'?<button disabled={action.busy} onClick={()=>perform('encounter',{
        type:'approve',planId:current.id,expectedRevision:current.revision
      },'Encounter proposal approved. Generated treasure remains hidden until GM reveal.')}>Approve Encounter Proposal</button>:null}
    </div>}
    {result?<pre className={styles.result}>{JSON.stringify(result,null,2)}</pre>:null}
    <p>Server randomness and approved source records remain authoritative. Previews do not automatically award XP, items or combat outcomes.</p>
  </section>;
}
function Calendar({data,action}){
  const current=data.sections.calendarState||{};
  const [days,setDays]=useState('30'),[year,setYear]=useState('1'),
    [month,setMonth]=useState('1'),[day,setDay]=useState('1'),
    [unit,setUnit]=useState('day'),[amount,setAmount]=useState('1');
  const configured=Boolean(current.definition&&current.date);
  const date=configured?current.date:null;
  return <section className={styles.section} data-testid="site-digital-gm-calendar">
    <h3>Asteria Calendar &amp; World Time</h3>
    {configured?<p>{formatAsteriaDate(date,current.definition)} · Revision {current.revision}</p>:
      <p>Calendar not configured. Month lengths are GM-defined; no Gregorian defaults are assumed.</p>}
    {!configured?<div className={styles.box}>
      {field('Days per month (initial setting for all 12 months)',days,setDays,
        {type:'number',min:1,max:100})}
      {field('Starting year',year,setYear,{type:'number',min:1,max:100000})}
      {field('Starting month number',month,setMonth,{type:'number',min:1,max:12})}
      {field('Starting day',day,setDay,{type:'number',min:1,max:100})}
      <p>{ASTERIA_MONTHS.join(' · ')}</p>
      <button disabled={action.busy} onClick={()=>action.command('calendar',{type:'configure',
        expectedRevision:0,definition:{
          months:ASTERIA_MONTHS.map(()=>({days:Number(days),season:''})),
          hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0
        },date:{era:ASTERIA_ERAS[0].id,year:Number(year),month:Number(month),
          day:Number(day),hour:0,minute:0},reason:'GM calendar configuration'
      },'Asteria calendar configured.')}>Configure Calendar</button>
    </div>:<div className={styles.box}>
      {options(['minute','hour','day','week','month','year'],unit,setUnit,'Advance by')}
      {field('Amount',amount,setAmount,{type:'number',min:1,max:20})}
      <button disabled={action.busy} onClick={()=>action.command('calendar',{
        type:'advance',expectedRevision:current.revision,unit,amount:Number(amount),
        reason:'GM advanced campaign time'
      },'Campaign time advanced.')}>Advance Campaign Time</button>
    </div>}
    <h4>Saved Campaign Events</h4>
    {rows(data.sections.calendarEntries).map(e=><article className={styles.card} key={e.id}>
      <strong>{e.title}</strong><span>{e.kind} · {e.visibility}</span></article>)}
  </section>;
}
function Weather({data,action}){
  const [name,setName]=useState(''),[biome,setBiome]=useState('temperate'),
    [volatility,setVolatility]=useState('normal'),[zone,setZone]=useState(''),
    [days,setDays]=useState('3');
  const zones=rows(data.sections.weatherZones),reports=rows(data.sections.weatherReports);
  return <section className={styles.section} data-testid="site-digital-gm-weather">
    <h3>Weather &amp; Environment</h3>
    <p>GM-generated narrative forecasts do not automatically modify combat, movement or resource costs.</p>
    <div className={styles.fields}>
      {field('Zone name',name,setName)}
      {options(WEATHER_BIOMES,biome,setBiome,'Biome')}
      {options(WEATHER_VOLATILITY,volatility,setVolatility,'Variability')}
    </div>
    <button disabled={action.busy||!name.trim()} onClick={()=>action.command('weather',{
      type:'saveZone',zoneId:newid('weather-zone'),expectedRevision:0,
      zone:{name,region:'',biome,volatility,magicWeather:false,gmNotes:''}
    },'Weather zone saved.')}>Create Weather Zone</button>
    {options([{id:'',label:'Select zone'},...zones.map(x=>({id:x.id,label:x.name}))],zone,setZone,'Forecast zone')}
    {field('Forecast days',days,setDays,{type:'number',min:1,max:7})}
    <button disabled={action.busy||!zone} onClick={()=>action.command('weather',{
      type:'generate',zoneId:zone,days:Number(days),
      expectedZoneRevision:zones.find(x=>x.id===zone)?.revision||0
    },'Private weather forecast generated.')}>Generate Private Forecast</button>
    <div className={styles.cards}>{reports.map(x=><article className={styles.card} key={x.id}>
      <strong>{x.zoneName}</strong><span>{x.status} · {rows(x.forecast).length} days</span>
      {x.status==='draft'?<button disabled={action.busy} onClick={()=>action.command('weather',{
        type:'publish',reportId:x.id,expectedRevision:x.revision
      },'Forecast published to player-safe feed.')}>Publish Forecast</button>:null}
      {x.status==='published'?<button disabled={action.busy} onClick={()=>action.command('weather',{
        type:'unpublish',reportId:x.id,expectedRevision:x.revision
      },'Forecast withdrawn.')}>Unpublish</button>:null}
    </article>)}</div>
  </section>;
}
function Archives({data,action}){
  const [title,setTitle]=useState(''),[body,setBody]=useState(''),[kind,setKind]=useState('prep'),
    [sessionLabel,setSessionLabel]=useState(''),[editing,setEditing]=useState(null);
  const [pdfTitle,setPdfTitle]=useState(''),[pdfDescription,setPdfDescription]=useState(''),
    [pdfFile,setPdfFile]=useState(null),[pdfEdit,setPdfEdit]=useState(null);
  const [preview,setPreview]=useState(null),[localError,setLocalError]=useState('');
  useEffect(()=>()=>{if(preview?.url)URL.revokeObjectURL(preview.url);},[preview?.url]);
  const notes=rows(data.sections.sessionNotes).filter(x=>x.status!=='archived');
  const pdfs=rows(data.sections.sessionPdfs).filter(x=>x.status!=='archived');
  const saveNote=async()=>{
    const op=editing?{type:'update-note',id:editing.id,expectedRevision:editing.revision}:
      {type:'create-note',id:newid('note')};
    const result=await action.command('sessionLibrary',{
      ...op,note:{title,body,kind,sessionLabel}
    },editing?'Private session note updated.':'Private session note saved.');
    if(result){setTitle('');setBody('');setSessionLabel('');setKind('prep');setEditing(null);}
  };
  const openPdf=async row=>{
    setLocalError('');
    try{
      const blob=await action.api.fetchSessionPdf(action.campaignId,row);
      const url=URL.createObjectURL(blob);
      setPreview(old=>{if(old?.url)URL.revokeObjectURL(old.url);return {id:row.id,url};});
    }catch(e){setLocalError(e?.message||'Unable to open PDF.');}
  };
  const upload=async()=>{
    if(!pdfFile)return;
    const result=await action.uploadPdf(pdfFile,{
      title:pdfTitle.trim(),description:pdfDescription.trim()},'Private PDF uploaded.');
    if(result){setPdfFile(null);setPdfTitle('');setPdfDescription('');}
  };
  return <section className={styles.section} data-testid="site-digital-gm-archives">
    <h3>GM Session Notes &amp; PDF Library</h3>
    <p>Structured notes stay GM-private. PDFs are private until explicitly published.</p>
    {localError?<p role="alert">{localError}</p>:null}
    <div className={styles.box}>
      <h4>{editing?'Edit Private Note':'Create Private Note'}</h4>
      <div className={styles.fields}>
        <label>Note title<input maxLength={140} value={title}
          onChange={e=>setTitle(e.target.value)}/></label>
        {options(['prep','session','recap','lore'],kind,setKind,'Note category')}
        <label>Session label<input maxLength={100} value={sessionLabel}
          onChange={e=>setSessionLabel(e.target.value)}/></label>
      </div>
      <label>Note<textarea rows={5} maxLength={16000} value={body}
        onChange={e=>setBody(e.target.value)}/></label>
      <div className={styles.actions}>
        <button type="button" disabled={action.busy||!title.trim()} onClick={saveNote}>
          {editing?'Update Private Note':'Save Private Note'}</button>
        {editing?<button type="button" disabled={action.busy} onClick={()=>{
          setEditing(null);setTitle('');setBody('');setKind('prep');setSessionLabel('');
        }}>Cancel Editing</button>:null}
      </div>
    </div>
    <div className={styles.cards}>{notes.map(row=><article className={styles.card} key={row.id}>
      <strong>{row.title}</strong><span>{row.kind} · Revision {row.revision}</span>
      <p>{row.body}</p>
      <div className={styles.actions}>
        <button type="button" disabled={action.busy} onClick={()=>{
          setEditing(row);setTitle(row.title);setBody(row.body||'');
          setKind(row.kind||'prep');setSessionLabel(row.sessionLabel||'');
        }}>Edit</button>
        <button type="button" disabled={action.busy}
          onClick={()=>action.command('sessionLibrary',{
            type:'delete-note',id:row.id,expectedRevision:row.revision
          },'Private note archived.')}>Archive</button>
      </div>
    </article>)}</div>
    {!notes.length?<p>No private session notes saved.</p>:null}
    <div className={styles.box}>
      <h4>Upload Private PDF Handout</h4>
      <div className={styles.fields}>
        <label>PDF title<input maxLength={140} value={pdfTitle}
          onChange={e=>setPdfTitle(e.target.value)}/></label>
        <label>PDF file<input type="file" accept="application/pdf,.pdf"
          onChange={e=>setPdfFile(e.target.files?.[0]||null)}/></label>
      </div>
      <label>Description<textarea maxLength={600} rows={2} value={pdfDescription}
        onChange={e=>setPdfDescription(e.target.value)}/></label>
      <button type="button" disabled={action.busy||!pdfFile||!pdfTitle.trim()}
        onClick={upload}>Upload Private PDF</button>
    </div>
    <h4>PDF Document Library</h4>
    <div className={styles.cards}>{pdfs.map(row=><article className={styles.card} key={row.id}>
      <strong>{row.title}</strong><span>{row.status} · {row.visibility==='players'?'Shared with players':'GM private'} · Revision {row.revision}</span>
      {row.description?<p>{row.description}</p>:null}
      {row.status==='ready'?<div className={styles.actions}>
        <button type="button" disabled={action.busy} onClick={()=>openPdf(row)}>Open PDF</button>
        <button type="button" disabled={action.busy} onClick={()=>action.command('sessionLibrary',{
          type:row.visibility==='players'?'unpublish-pdf':'publish-pdf',
          id:row.id,expectedRevision:row.revision
        },'PDF publication updated.')}>{row.visibility==='players'?'Unpublish':'Publish to Players'}</button>
        <button type="button" disabled={action.busy} onClick={()=>{
          setPdfEdit(row);setPdfTitle(row.title);setPdfDescription(row.description||'');
        }}>Edit Details</button>
      </div>:null}
      {pdfEdit?.id===row.id?<div className={styles.box}>
        <label>PDF title<input maxLength={140} value={pdfTitle}
          onChange={e=>setPdfTitle(e.target.value)}/></label>
        <label>Description<textarea maxLength={600} value={pdfDescription}
          onChange={e=>setPdfDescription(e.target.value)}/></label>
        <div className={styles.actions}>
          <button type="button" disabled={action.busy||!pdfTitle.trim()} onClick={async()=>{
            const result=await action.command('sessionLibrary',{
              type:'update-pdf',id:row.id,expectedRevision:row.revision,
              title:pdfTitle,description:pdfDescription
            },'PDF details updated.');
            if(result)setPdfEdit(null);
          }}>Save PDF Details</button>
          <button type="button" onClick={()=>setPdfEdit(null)}>Cancel</button>
        </div>
      </div>:null}
      <button type="button" disabled={action.busy} onClick={()=>action.command('sessionLibrary',{
        type:'archive-pdf',id:row.id,expectedRevision:row.revision
      },'PDF archived and player access revoked.')}>Archive PDF</button>
      {preview?.id===row.id?<a href={preview.url} target="_blank" rel="noreferrer">
        Open Private PDF Preview</a>:null}
    </article>)}</div>
    {!pdfs.length?<p>No PDFs uploaded for this campaign.</p>:null}
  </section>;
}

function Audio({data,action}){
  const [track,setTrack]=useState(''),[file,setFile]=useState(null),
    [title,setTitle]=useState(''),[description,setDescription]=useState(''),
    [category,setCategory]=useState('ambient'),[volume,setVolume]=useState('70'),
    [loop,setLoop]=useState(true),[preview,setPreview]=useState(null),
    [localError,setLocalError]=useState('');
  const tracks=rows(data.sections.audioTracks).filter(x=>x.status!=='archived');
  const live=data.sections.audioLive||{};
  useEffect(()=>()=>{if(preview?.url)URL.revokeObjectURL(preview.url);},[preview?.url]);
  const upload=async()=>{
    if(!file||!title.trim())return;
    const result=await action.uploadAudio(file,{
      name:title.trim(),description:description.trim(),category,
      loop,volume:Number(volume)
    },'Private audio track uploaded.');
    if(result){setFile(null);setTitle('');setDescription('');}
  };
  const showPreview=async row=>{
    setLocalError('');
    try{
      const blob=await action.api.fetchCampaignAudio(action.campaignId,row);
      const url=URL.createObjectURL(blob);
      setPreview(old=>{if(old?.url)URL.revokeObjectURL(old.url);return {id:row.id,url};});
    }catch(err){setLocalError(err?.message||'Audio preview unavailable.');}
  };
  const cue=(type,id)=>{
    const op={type,expectedLiveRevision:live.revision||0};
    if(id)op.trackId=id;
    return action.command('audio',op,'Campaign audio cue updated.');
  };
  return <section className={styles.section} data-testid="site-digital-gm-audio">
    <h3>Campaign Soundboard &amp; Ambient Audio</h3>
    <p>Upload private audio, publish approved tracks and broadcast cues. Players must opt in to playback on their own device.</p>
    {localError?<p role="alert">{localError}</p>:null}
    <div className={styles.box}>
      <h4>Upload Private Audio</h4>
      <div className={styles.fields}>
        <label>Track name<input maxLength={120} value={title}
          onChange={e=>setTitle(e.target.value)}/></label>
        <label>Audio file<input type="file" accept=".mp3,.ogg,.wav,.webm,audio/mpeg,audio/ogg,audio/wav,audio/webm"
          onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
        {options(['ambient','music','effect'],category,setCategory,'Track category')}
        <label>Volume<input type="number" min={0} max={100} step={1} value={volume}
          onChange={e=>setVolume(e.target.value)}/></label>
        <label>Loop<input type="checkbox" checked={loop}
          onChange={e=>setLoop(e.target.checked)}/></label>
      </div>
      <label>Description<textarea rows={2} maxLength={500} value={description}
        onChange={e=>setDescription(e.target.value)}/></label>
      <button type="button" disabled={action.busy||!file||!title.trim()||
        !Number.isSafeInteger(Number(volume))||Number(volume)<0||Number(volume)>100}
        onClick={upload}>Upload Private Audio</button>
    </div>
    <div className={styles.box}>
      <h4>Live Audio Controls</h4>
      <p>Ambient status: {live.ambient?.status||'Stopped'}.
        {live.ambient?.trackId?' Current track: '+live.ambient.trackId:''}</p>
      {options([{id:'',label:'Select published ambient track'},...tracks
        .filter(row=>row.status==='ready'&&row.visibility==='players'&&row.category!=='effect')
        .map(row=>({id:row.id,label:row.name}))],track,setTrack,'Broadcast ambient track')}
      <div className={styles.actions}>
        <button type="button" disabled={action.busy||!track}
          onClick={()=>cue('play-ambient',track)}>Play Ambient Track</button>
        <button type="button" disabled={action.busy||live.ambient?.status!=='playing'}
          onClick={()=>cue('pause-ambient')}>Pause Ambience</button>
        <button type="button" disabled={action.busy||live.ambient?.status!=='paused'}
          onClick={()=>cue('resume-ambient')}>Resume Ambience</button>
        <button type="button" disabled={action.busy||!live.ambient}
          onClick={()=>cue('stop-ambient')}>Stop Ambience</button>
        <button type="button" disabled={action.busy||!live.effect}
          onClick={()=>cue('stop-effect')}>Clear Sound Effect</button>
      </div>
    </div>
    <h4>Audio Library ({tracks.length})</h4>
    <div className={styles.cards}>{tracks.map(row=><article className={styles.card} key={row.id}>
      <strong>{row.name||row.id}</strong>
      <span>{row.category} · {row.status} · {row.visibility==='players'?'Published':'GM private'}</span>
      {row.description?<p>{row.description}</p>:null}
      <div className={styles.actions}>
        {row.status==='ready'?<>
          <button type="button" disabled={action.busy}
            onClick={()=>showPreview(row)}>Preview Privately</button>
          <button type="button" disabled={action.busy} onClick={()=>action.command('audio',{
            type:row.visibility==='players'?'unpublish-track':'publish-track',
            id:row.id,expectedRevision:row.revision
          },'Track publication updated.')}>{row.visibility==='players'?'Unpublish':'Publish'}</button>
          {row.visibility==='players'?<button type="button" disabled={action.busy}
            onClick={()=>cue(row.category==='effect'?'play-effect':'play-ambient',row.id)}>
            {row.category==='effect'?'Play Sound Effect':'Broadcast Track'}</button>:null}
        </>:null}
        <button type="button" disabled={action.busy} onClick={()=>action.command('audio',{
          type:'archive-track',id:row.id,expectedRevision:row.revision
        },'Audio track archived and player access revoked.')}>Archive</button>
      </div>
      {preview?.id===row.id?<audio controls src={preview.url} preload="metadata"/>:null}
    </article>)}</div>
    {!tracks.length?<p>No campaign audio tracks uploaded.</p>:null}
  </section>;
}

function Recordings({data,action}){
  const control=data.sections.recordingControl||{status:'idle',revision:0};
  const consents=rows(data.sections.recordingConsents);
  const archives=rows(data.sections.recordingArchives).filter(row=>row.status!=='archived');
  const [mode,setMode]=useState('microphone'),[ack,setAck]=useState(false),
    [active,setActive]=useState(null),[clip,setClip]=useState(null),
    [title,setTitle]=useState(''),[summary,setSummary]=useState(''),
    [error,setError]=useState(''),[message,setMessage]=useState(''),
    [preview,setPreview]=useState(null);
  const recorder=React.useRef(null),stream=React.useRef(null),
    cutoff=React.useRef(null),activeRef=React.useRef(null),
    discarded=React.useRef(false);
  const stopTracks=()=>{if(cutoff.current)clearTimeout(cutoff.current);cutoff.current=null;
    stream.current?.getTracks?.().forEach(track=>track.stop());stream.current=null;};
  useEffect(()=>()=>{discarded.current=true;
    if(recorder.current?.state!=='inactive')recorder.current?.stop();
    stopTracks();
  },[]);
  useEffect(()=>{
    if(active&&control.status==='recording'&&control.requestId===active.requestId)
      activeRef.current.seenRecording=true;
    if(active&&(control.requestId!==active.requestId||
      activeRef.current?.seenRecording&&control.status!=='recording')){
      discarded.current=true;
      if(recorder.current?.state==='recording')recorder.current.stop();
      stopTracks();setActive(null);setClip(null);
      setMessage('Recording stopped because authoritative consent or recording status changed.');
    }
  },[control.requestId,control.status,active?.requestId]);
  useEffect(()=>()=>{if(preview?.url)URL.revokeObjectURL(preview.url);},[preview?.url]);
  const currentConsents=consents.filter(row=>row.requestId===control.requestId);
  const agreed=(control.participants||[]).filter(uid=>
    currentConsents.some(row=>row.uid===uid&&row.decision==='agree')).length;
  const declined=currentConsents.some(row=>row.decision==='decline');
  const ready=control.status==='consent'&&!declined&&
    agreed===(control.participants||[]).length;
  const requestConsent=async()=>{
    if(!ack||data.session?.status!=='active')return;
    const result=await action.command('recording',{
      type:'request-consent',requestId:'rec-'+crypto.randomUUID(),
      sessionId:data.session.id,mode,actorConsent:true,
      expectedRevision:control.revision||0
    },'Recording consent requested from active campaign participants.');
    if(result){setClip(null);setMessage('All active participants must agree before capture starts.');}
  };
  const start=async()=>{
    if(!ready||active||action.busy)return;
    setError('');setMessage('');
    if(typeof window.MediaRecorder!=='function'){
      setError('Audio recording is not supported in this browser.');return;
    }
    const mime=recordingSupportedMime(window.MediaRecorder);
    if(!mime){setError('No supported recording format was found.');return;}
    let media=null;
    try{
      media=mode==='tab-audio'?
        await navigator.mediaDevices?.getDisplayMedia?.({video:true,audio:true}):
        await navigator.mediaDevices?.getUserMedia?.({audio:true});
      if(!media||media.getAudioTracks().length===0)
        throw Error('No audio track was shared. Choose an audio-enabled source.');
      const capture=new MediaStream(media.getAudioTracks());
      const nextRecorder=new window.MediaRecorder(capture,{
        mimeType:mime,audioBitsPerSecond:96000
      });
      const result=await action.command('recording',{
        type:'start-recording',requestId:control.requestId,
        expectedRevision:control.revision
      },'Recording started after verified participant consent.');
      if(!result){media.getTracks().forEach(t=>t.stop());return;}
      discarded.current=false;
      const token={requestId:control.requestId,sessionId:control.sessionId,
        revision:result.revision,started:Date.now(),mime:recordingBaseMime(mime),seenRecording:false};
      activeRef.current=token;setActive(token);stream.current=media;recorder.current=nextRecorder;
      const chunks=[];
      nextRecorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
      nextRecorder.onerror=()=>{discarded.current=true;
        setError('The browser recorder failed. The capture has been discarded.');
        if(nextRecorder.state!=='inactive')nextRecorder.stop();};
      nextRecorder.onstop=async()=>{
        stopTracks();recorder.current=null;
        setActive(null);activeRef.current=null;
        if(discarded.current){setClip(null);return;}
        const blob=new Blob(chunks,{type:token.mime});
        const durationSeconds=Math.min(RECORDING_MAX_SECONDS,
          Math.max(1,Math.ceil((Date.now()-token.started)/1000)));
        const finished=await action.command('recording',{
          type:'stop-recording',requestId:token.requestId,
          expectedRevision:token.revision
        },'Recording stopped. Your local clip is ready for review.');
        if(!finished||!blob.size){setClip(null);setError('The capture could not be confirmed by the server. No archive will be uploaded.');return;}
        const ext=RECORDING_FORMATS[token.mime]?.extension||'webm';
        const file=new File([blob],'asteria-session-'+token.requestId+'.'+ext,{
          type:token.mime
        });
        if(file.size>RECORDING_MAX_BYTES){
          setError('The recording exceeds 40 MB. Download locally; cloud archive is unavailable.');
        }
        setClip({file,requestId:token.requestId,sessionId:token.sessionId,
          durationSeconds});setMessage('Recording is local and private until you explicitly save an archive.');
      };
      nextRecorder.start(1000);
      cutoff.current=window.setTimeout(()=>{
        if(nextRecorder.state==='recording')nextRecorder.stop();
      },RECORDING_MAX_SECONDS*1000);
    }catch(err){media?.getTracks?.().forEach(t=>t.stop());
      setError(err?.message||'Recording could not start.');}
  };
  const download=()=>{
    if(!clip?.file)return;
    const url=URL.createObjectURL(clip.file);
    const link=document.createElement('a');link.href=url;link.download=clip.file.name;
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const saveArchive=async()=>{
    if(!clip?.file||clip.file.size>RECORDING_MAX_BYTES||!title.trim())return;
    const result=await action.uploadRecording(clip.file,{
      title,summary,sessionId:clip.sessionId,requestId:clip.requestId,
      durationSeconds:clip.durationSeconds
    },'Private recording archive uploaded.');
    if(result){setClip(null);setTitle('');setSummary('');}
  };
  const showPreview=async row=>{
    try{
      const blob=await action.api.fetchRecordingArchive(action.campaignId,row);
      const url=URL.createObjectURL(blob);
      setPreview(previous=>{if(previous?.url)URL.revokeObjectURL(previous.url);
        return {id:row.id,url};});
    }catch(err){setError(err?.message||'Recording playback unavailable.');}
  };
  return <section className={styles.section} data-testid="site-digital-gm-recordings">
    <h3>Session Recordings, Consent &amp; Private Archives</h3>
    <p>Browser audio capture requires explicit consent from every active participant.
      No microphone or tab audio is captured until the GM starts recording.</p>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
    <div className={styles.box}>
      <h4>Recording Consent Controller</h4>
      <p>Session: {data.session?.status||'idle'} · Controller: {control.status||'idle'}</p>
      <p>Participant agreements: {agreed}/{(control.participants||[]).length}
        {declined?' · A participant declined':''}</p>
      {options([{id:'microphone',label:'Microphone'},
        {id:'tab-audio',label:'Browser Tab Audio'}],mode,setMode,'Capture source')}
      <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>
        I consent to recording my own audio and have permission to capture the selected source.</label>
      <div className={styles.actions}>
        <button type="button" disabled={action.busy||!ack||data.session?.status!=='active'||
          !['idle','cancelled'].includes(control.status||'idle')}
          onClick={requestConsent}>Request Participant Consent</button>
        {control.status==='consent'?<>
          <button type="button" disabled={action.busy||!ready||!ack}
            onClick={start}>Start Browser Recording</button>
          <button type="button" disabled={action.busy} onClick={()=>action.command('recording',{
            type:'cancel-consent',requestId:control.requestId,
            expectedRevision:control.revision
          },'Recording consent request cancelled.')}>Cancel Consent Request</button>
        </>:null}
        {active?<button type="button" onClick={()=>{
          if(recorder.current?.state==='recording')recorder.current.stop();
        }}>Stop Recording</button>:null}
        {control.status==='recording'&&!active?<button type="button"
          disabled={action.busy} onClick={()=>action.command('recording',{
            type:'stop-recording',requestId:control.requestId,
            expectedRevision:control.revision
          },'Stale recording controller stopped.')}>Stop Remote Recording State</button>:null}
      </div>
      {active?<p role="status">Recording active. Stop it before leaving this workspace.</p>:null}
    </div>
    {clip?<div className={styles.box}>
      <h4>Local Recording Review</h4>
      <p>{clip.durationSeconds} seconds · {Math.ceil(clip.file.size/1024)} KB.
        Private unless explicitly archived and later shared.</p>
      <div className={styles.fields}>
        <label>Archive title<input maxLength={140} value={title}
          onChange={e=>setTitle(e.target.value)}/></label>
        <label>Archive summary<textarea rows={3} maxLength={2000} value={summary}
          onChange={e=>setSummary(e.target.value)}/></label>
      </div>
      <div className={styles.actions}>
        <button type="button" disabled={action.busy} onClick={download}>Download Local Recording</button>
        <button type="button" disabled={action.busy||!title.trim()||
          clip.file.size>RECORDING_MAX_BYTES} onClick={saveArchive}>
          Save Private Cloud Archive</button>
        <button type="button" onClick={()=>{setClip(null);setMessage('Local recording discarded.');}}>
          Discard Local Recording</button>
      </div>
    </div>:null}
    <h4>GM Recording Archives ({archives.length})</h4>
    <div className={styles.cards}>{archives.map(row=><article key={row.id} className={styles.card}>
      <strong>{row.title||row.id}</strong>
      <span>{row.status} · {row.visibility==='players'?'Shared with players':'GM private'}
        {' · '+Math.ceil((row.durationSeconds||0)/60)+' min'}</span>
      {row.summary?<p>{row.summary}</p>:null}
      <div className={styles.actions}>
        {row.status==='ready'?<>
          <button type="button" disabled={action.busy}
            onClick={()=>showPreview(row)}>Load Recording</button>
          <button type="button" disabled={action.busy} onClick={()=>action.command('recording',{
            type:row.visibility==='players'?'unpublish-archive':'publish-archive',
            id:row.id,expectedRevision:row.revision
          },'Recording archive publication updated.')}>
            {row.visibility==='players'?'Unshare Recording':'Share With Players'}</button>
        </>:null}
        <button type="button" disabled={action.busy} onClick={()=>action.command('recording',{
          type:'archive-archive',id:row.id,expectedRevision:row.revision
        },'Recording archived and player access revoked.')}>Archive Recording</button>
      </div>
      {preview?.id===row.id?<audio controls preload="metadata" src={preview.url}/>:null}
    </article>)}</div>
    {!archives.length?<p>No session recording archives.</p>:null}
  </section>;
}

export function GMDigitalGMWorkspace({api,campaignId,initialArea='library'}){
  const [area,setArea]=useState(()=>GM_AREAS.includes(initialArea)?initialArea:'library'),[snapshot,setSnapshot]=useState({area:'',data:null}),
    [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),
    [search,setSearch]=useState('');
  // Never render a different tab's stale snapshot. Area-change effects run
  // after paint and would otherwise briefly mount a form with old data, then
  // destroy the player's in-progress input on first interaction.
  const data=snapshot.area===area?snapshot.data:null;
  useEffect(()=>{setError('');setMessage('');},[area,campaignId,api]);
  const update=React.useCallback(v=>setSnapshot({area,data:v}),[area]);
  const fail=React.useCallback(e=>{setSnapshot({area,data:null});
    setError(e?.message||'GM access denied.');},[area]);
  const action={
    busy,api,campaignId,
    async world(op,success){if(busy)return false;setBusy(true);setError('');setMessage('');
      try{await api.world(campaignId,op);setMessage(success);return true;}
      catch(e){setError(e?.message||'Unable to update GM workspace.');return false;}
      finally{setBusy(false);}
    },
    async command(kind,op,success){if(busy)return null;setBusy(true);setError('');setMessage('');
      try{const result=await api.command(campaignId,kind,op);setMessage(success);return result;}
      catch(e){setError(e?.message||'GM request failed.');return null;}
      finally{setBusy(false);}
    },
    async uploadPdf(file,details,success){
      if(busy)return null;setBusy(true);setError('');setMessage('');
      try{const result=await api.uploadSessionPdf(campaignId,file,details);
        setMessage(success);return result;}
      catch(e){setError(e?.message||'PDF upload failed.');return null;}
      finally{setBusy(false);}
    },
    async uploadAudio(file,details,success){
      if(busy)return null;setBusy(true);setError('');setMessage('');
      try{const result=await api.uploadCampaignAudio(campaignId,file,details);
        setMessage(success);return result;}
      catch(e){setError(e?.message||'Audio upload failed.');return null;}
      finally{setBusy(false);}
    },
    async uploadRecording(file,details,success){
      if(busy)return null;setBusy(true);setError('');setMessage('');
      try{const result=await api.uploadRecordingArchive(campaignId,file,details);
        setMessage(success);return result;}
      catch(e){setError(e?.message||'Recording archive upload failed.');return null;}
      finally{setBusy(false);}
    }
  };
  const results=useMemo(()=>data&&search.trim()?localGMSearch(data,data.sections,search):[],
    [data,search]);
  return <section className={styles.workspace} data-testid="site-gm-digital-tools">
    <h2>Digital GM Toolkit</h2>
    <Area api={api} campaignId={campaignId} area={area} onData={update} onError={fail}/>
    <nav className={styles.tabs} aria-label="Digital GM sections">
      {GM_AREAS.filter(id=>id!=='world').map(id=><button key={id} aria-current={id===area?'page':undefined}
        onClick={()=>setArea(id)}>{({library:'NPC Library',relationships:'Reputation',
          stories:'Quests & Notes',tables:'Generators',calendar:'Calendar',
          weather:'Weather',archives:'Documents',audio:'Soundboard',
          recordings:'Recordings'})[id]}</button>)}
    </nav>
    {error?<p role="alert">{error}</p>:null}
    {message?<p role="status">{message}</p>:null}
    {!data?<p>Verifying GM access and connecting to private campaign tools…</p>:null}
    {data?<>{field('Search current GM records',search,setSearch,{type:'search'})}
      {results.length?<div className={styles.box}><h3>Search Results</h3>
        {results.slice(0,30).map((row,i)=><p key={row.id||i}>{row.title||row.name||row.label}</p>)}
      </div>:null}
      {area==='library'?<NPCEditor data={data} action={action}/>:null}
      {area==='relationships'?<Reputation data={data} action={action}/>:null}
      {area==='stories'?<Stories data={data} action={action}/>:null}
      {area==='tables'?<Tables data={data} action={action}/>:null}
      {area==='calendar'?<Calendar data={data} action={action}/>:null}
      {area==='weather'?<Weather data={data} action={action}/>:null}
      {area==='archives'?<Archives data={data} action={action}/>:null}
      {area==='audio'?<Audio data={data} action={action}/>:null}
      {area==='recordings'?<Recordings data={data} action={action}/>:null}
    </>:null}
  </section>;
}
/** Public read-only projections: these are separate from GM-private source data. */
export function PlayerDigitalGMWorkspace({api,campaignId,initialSection='calendar'}){
  const [data,setData]=useState(null),[error,setError]=useState(''),
    [selected,setSelected]=useState(()=>['calendar','weather','handouts','soundboard','recording'].includes(initialSection)?initialSection:'calendar');
  useEffect(()=>{
    setData(null);setError('');
    return api.watchPlayer(campaignId,setData,e=>{setData(null);
      setError(e?.message||'Shared campaign information is unavailable.');});
  },[api,campaignId]);
  const sections=data?.sections||{};
  const records=selected==='calendar'?rows(sections.calendarEntries):
    selected==='weather'?rows(sections.weatherReports):
    selected==='handouts'?rows(sections.sessionPdfs):
    selected==='soundboard'?rows(sections.audioTracks):[];
  return <section className={styles.workspace} data-testid="site-player-digital-tools">
    <h2>Campaign World &amp; Session</h2>
    <nav className={styles.tabs} aria-label="Shared campaign information">
      {['calendar','weather','handouts','soundboard','recording'].map(key=>
        <button key={key} aria-current={key===selected?'page':undefined}
          onClick={()=>setSelected(key)}>{({
            calendar:'Asteria Calendar',weather:'Weather',handouts:'Published PDFs',
            soundboard:'Ambient Audio',recording:'Recording Status'
          })[key]}</button>)}
    </nav>
    {error?<p role="alert">{error}</p>:null}
    {!data?<p>Verifying campaign access and loading published information…</p>:null}
    {data?<>
      {selected==='calendar'&&sections.calendarPublic?.date&&
        sections.calendarPublic?.definition?<p>{formatAsteriaDate(
          sections.calendarPublic.date,sections.calendarPublic.definition)}</p>:null}
      {selected==='recording'?<p>Recording: {sections.recordingNotice?.status||'Not active'}</p>:null}
      {records.map(item=><article className={styles.card} key={item.id}>
        <strong>{item.title||item.name||item.zoneName||item.fileName||'Campaign update'}</strong>
        <span>{item.kind||item.status||'Published'}</span>
        {item.description?<p>{item.description}</p>:null}
        {selected==='weather'?<ul>{rows(item.forecast).map((day,index)=>
          <li key={index}>{day.condition||'Weather'} · {day.severity||''}</li>)}</ul>:null}
      </article>)}
      {!records.length&&selected!=='recording'?<p>No published records in this section.</p>:null}
      {selected==='soundboard'?<p>Playback remains opt-in. This view lists published tracks and does not autoplay audio.</p>:null}
    </>:null}
  </section>;
}