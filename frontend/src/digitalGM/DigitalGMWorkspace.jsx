import React,{useEffect,useMemo,useState} from 'react';
import {GM_AREAS,RELATIONSHIP_SCOPES,RELATIONSHIP_LEVELS,REPUTATION_RANKS,
  relationshipLabel,reputationLabel,localGMSearch} from './digitalGMModel.mjs';
import {libraryDraft} from '../../../src/state/gmNpcCreatureLibraryModel.mjs';
import {generateNPCConcept,NPC_GENERATOR_ROLES,NPC_GENERATOR_MOODS} from '../../../src/state/gmNpcGeneratorModel.mjs';
import {GM_CARD_TEMPLATES,GM_CARD_THEMES,normalizeGMCharacterCard} from '../../../src/state/gmCharacterCardModel.mjs';
import {RANDOM_TABLE_CATEGORIES} from '../../../src/state/randomTableModel.mjs';
import {ASTERIA_MONTHS,ASTERIA_ERAS,formatAsteriaDate} from '../../../src/state/asteriaCalendarModel.mjs';
import {WEATHER_BIOMES,WEATHER_VOLATILITY} from '../../../src/state/weatherEnvironmentModel.mjs';
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
  const [title,setTitle]=useState(''),[body,setBody]=useState(''),[kind,setKind]=useState('prep');
  return <section className={styles.section} data-testid="site-digital-gm-archives">
    <h3>GM Session Notes &amp; PDFs</h3>
    <div className={styles.fields}>{field('Note title',title,setTitle)}
      {options(['prep','session','recap','lore'],kind,setKind,'Note category')}</div>
    <label>Note<textarea rows="5" value={body} onChange={e=>setBody(e.target.value)}/></label>
    <button disabled={action.busy||!title.trim()} onClick={()=>action.command('sessionLibrary',{
      type:'create-note',id:newid('note'),note:{title,body,kind,sessionLabel:''}
    },'Private session note saved.')}>Save Private Note</button>
    <div className={styles.cards}>{rows(data.sections.sessionNotes).map(row=><article className={styles.card} key={row.id}>
      <strong>{row.title}</strong><span>{row.kind} · Revision {row.revision}</span>
      <p>{row.body}</p></article>)}</div>
    <h4>Document Library</h4>
    <p>Use the authenticated upload action to store a private PDF; player access is controlled by explicit publication.</p>
    {rows(data.sections.sessionPdfs).map(row=><article className={styles.card} key={row.id}>
      <strong>{row.title}</strong><span>{row.status} · {row.visibility}</span>
      {row.status==='ready'?<button disabled={action.busy} onClick={()=>action.command('sessionLibrary',{
        type:row.visibility==='players'?'unpublish-pdf':'publish-pdf',
        id:row.id,expectedRevision:row.revision
      },'PDF publication updated.')}>{row.visibility==='players'?'Unpublish':'Publish to players'}</button>:null}
    </article>)}
  </section>;
}
function Audio({data,action}){
  const [track,setTrack]=useState('');
  return <section className={styles.section} data-testid="site-digital-gm-audio">
    <h3>Campaign Soundboard</h3>
    <p>Only GM-approved and already uploaded audio tracks may be broadcast. Playback is opt-in for players.</p>
    <div className={styles.cards}>{rows(data.sections.audioTracks).map(row=><article className={styles.card} key={row.id}>
      <strong>{row.title||row.name}</strong><span>{row.status} · {row.visibility||'Private'}</span>
      <button disabled={action.busy||row.status!=='ready'} onClick={()=>action.command('audio',{
        type:row.visibility==='players'?'unpublish-track':'publish-track',
        id:row.id,expectedRevision:row.revision
      },'Track publication updated.')}>{row.visibility==='players'?'Unpublish':'Publish'}</button>
    </article>)}</div>
    {options([{id:'',label:'Select approved track'},...rows(data.sections.audioTracks)
      .filter(row=>row.status==='ready'&&row.visibility==='players')
      .map(row=>({id:row.id,label:row.title||row.name}))],track,setTrack,'Broadcast track')}
    <div className={styles.actions}>
      <button disabled={action.busy||!track} onClick={()=>action.command('audio',{
        type:'play-ambient',trackId:track,
        expectedLiveRevision:data.sections.audioLive?.revision||0
      },'GM ambient audio cue sent.')}>Play Ambient Track</button>
      <button disabled={action.busy} onClick={()=>action.command('audio',{
        type:'stop-ambient',expectedLiveRevision:data.sections.audioLive?.revision||0
      },'Ambient audio stopped.')}>Stop Ambient Track</button>
    </div>
  </section>;
}
function Recordings({data}){
  const control=data.sections.recordingControl;
  return <section className={styles.section} data-testid="site-digital-gm-recordings">
    <h3>Session Recordings &amp; Consent</h3>
    <p>Recording requests, participant consent, browser capture and archive publication require their existing verified recording controls. A recording cannot be started without prior consent.</p>
    <p>Controller status: {control?.status||'Idle'}</p>
    <h4>GM Archives</h4>
    {rows(data.sections.recordingArchives).map(row=><article className={styles.card} key={row.id}>
      <strong>{row.title||row.id}</strong><span>{row.status} · {row.visibility||'Private'}</span></article>)}
  </section>;
}
export function GMDigitalGMWorkspace({api,campaignId}){
  const [area,setArea]=useState('library'),[snapshot,setSnapshot]=useState({area:'',data:null}),
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
    busy,
    async world(op,success){if(busy)return false;setBusy(true);setError('');setMessage('');
      try{await api.world(campaignId,op);setMessage(success);return true;}
      catch(e){setError(e?.message||'Unable to update GM workspace.');return false;}
      finally{setBusy(false);}
    },
    async command(kind,op,success){if(busy)return null;setBusy(true);setError('');setMessage('');
      try{const result=await api.command(campaignId,kind,op);setMessage(success);return result;}
      catch(e){setError(e?.message||'GM request failed.');return null;}
      finally{setBusy(false);}
    }
  };
  const results=useMemo(()=>data&&search.trim()?localGMSearch(data,data.sections,search):[],
    [data,search]);
  return <section className={styles.workspace} data-testid="site-gm-digital-tools">
    <h2>Digital GM Toolkit</h2>
    <Area api={api} campaignId={campaignId} area={area} onData={update} onError={fail}/>
    <nav className={styles.tabs} aria-label="Digital GM sections">
      {GM_AREAS.map(id=><button key={id} aria-current={id===area?'page':undefined}
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
      {area==='recordings'?<Recordings data={data}/>:null}
    </>:null}
  </section>;
}
/** Public read-only projections: these are separate from GM-private source data. */
export function PlayerDigitalGMWorkspace({api,campaignId}){
  const [data,setData]=useState(null),[error,setError]=useState(''),
    [selected,setSelected]=useState('calendar');
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