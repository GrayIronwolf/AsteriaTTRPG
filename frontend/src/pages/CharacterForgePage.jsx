import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useAppServices} from '../app/AppServices.jsx';
import {useAuth} from '../auth/AuthProvider.jsx';
import {isVerifiedOwnedSession} from '../auth/accountSecurityPolicy.mjs';
import { PageLayout, PageHeader } from '../components/ui/PageLayout.jsx';
import {SurfacePanel} from '../components/ui/SurfacePanel.jsx';
import {CrystalButton} from '../components/ui/CrystalButton.jsx';
import { Heading, BodyText } from '../components/ui/Typography.jsx';
import {loadPublicForgeRules} from '../forge/publicForgeRules.mjs';
import {newDraft,draftFromCharacter,visibleTabs,magicRules,patronClasses,
 affinityItems,validForge,STATS,MAGIC,PACKS,ORIGIN_FIELDS,FAMILY_FIELDS,
 APPEARANCE_FIELDS} from '../forge/forgeModel.mjs';
import styles from './CharacterForgePage.module.css';

const nice=s=>s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const valueOf=(record,key)=>record?.[key]||'';
const extract=e=>e.target.value;
const MISSING='Your character data could not be verified. No changes were saved.';
function ChoiceGrid({choices,selected,onChoose,disabled=false}){
 return <div className={styles.choices}>
  {choices.map(row=><button key={row.slug} type="button"
    className={styles.choice} aria-pressed={selected===row.slug}
    disabled={disabled} onClick={()=>onChoose(row.slug)}>
    <strong>{row.title}</strong><small>{row.category}</small>
    {row.summary&&<span>{row.summary.slice(0,180)}</span>}
  </button>)}
 </div>;
}
export function CharacterForgePage(){
 const {session}=useAuth(),services=useAppServices();
 const api=services.get('characters');
 const uid=isVerifiedOwnedSession(session)?session.user.uid:null;
 const [rules,setRules]=useState(null),[records,setRecords]=useState([]);
 const [mode,setMode]=useState('hub'),[draft,setDraft]=useState(newDraft);
 const [active,setActive]=useState('Race'),[query,setQuery]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 const [excluded,setExcluded]=useState(0);
 const seq=useRef(0),owner=useRef(uid);owner.current=uid;
 const update=(patch)=>setDraft(old=>({...old,...patch}));
 const section=(key,value)=>setDraft(old=>({...old,[key]:{...old[key],[value.key]:value.data}}));
 useEffect(()=>{
  const token=++seq.current;let alive=true;
  setMode('hub');setRules(null);setRecords([]);setDraft(newDraft());
  setActive('Race');setBusy(false);setLoading(true);setError('');setMessage('');setExcluded(0);
  if(!uid||!api){setLoading(false);return undefined;}
  Promise.all([loadPublicForgeRules(),api.list()]).then(([publicRules,owned])=>{
   if(!alive||seq.current!==token||owner.current!==uid)return;
   setRules(publicRules);setRecords(owned.items);setExcluded(owned.excluded);
  }).catch(()=>{
   if(alive&&seq.current===token)setError('Character Forge could not load. Check your connection.');
  }).finally(()=>{if(alive&&seq.current===token)setLoading(false);});
  return ()=>{alive=false;++seq.current;};
 },[uid,api]);

 const tabs=useMemo(()=>rules?visibleTabs(draft,rules):[],[draft,rules]);
 const options=(domain,search='')=>(rules?.[domain]||[]).filter(row=>
   !search||[row.title,row.category,row.summary].join(' ').toLowerCase().includes(search.toLowerCase()));
 const selectMany=(field,value,limit=100)=>setDraft(old=>{
   const existing=old[field]||[];
   return {...old,[field]:existing.includes(value)?
    existing.filter(x=>x!==value):existing.length<limit?[...existing,value]:existing};
 });
 const affinity=(kind,name,field,value)=>setDraft(old=>({
   ...old,affinityRolls:{...old.affinityRolls,[kind]:{
    ...old.affinityRolls[kind],[name]:{
      ...old.affinityRolls[kind]?.[name],[field]:value
    }
   }}
 }));
 const refresh=async()=>{
  if(!api||!uid)return;
  const token=seq.current;
  setError('');setLoading(true);
  try{
   const result=await api.list();
   if(owner.current!==uid||seq.current!==token)return;
   setRecords(result.items);setExcluded(result.excluded);
  }catch{if(owner.current===uid)setError(MISSING);}
  finally{if(owner.current===uid&&seq.current===token)setLoading(false);}
 };
 const begin=()=>{setMode('create');setDraft(newDraft());setActive('Race');setQuery('');setError('');setMessage('');};
 const edit=async id=>{
  if(busy)return;
  const token=seq.current;
  setBusy(true);setError('');setMessage('');
  try{
   const character=await api.load(id);
   if(seq.current!==token||owner.current!==uid)return;
   setDraft(draftFromCharacter(character));setMode('edit');setActive('Race');setQuery('');
  }catch{if(seq.current===token)setError('Character could not be verified. Editing is disabled.');}
  finally{if(seq.current===token)setBusy(false);}
 };
 const save=async()=>{
  if(busy||!rules)return;
  const problems=validForge(draft,rules,mode==='edit'?{
   primaryClassSlug:draft.editCharacterId ? draft.classSlug : ''
  }:null);
  if(problems.length){
   setError(problems[0].message);
   setActive(problems[0].step);
   return;
  }
  const token=seq.current,account=uid;
  setBusy(true);setError('');setMessage('');
  try{
   const record=await api.save(draft,rules,mode==='edit'?draft.editCharacterId:null);
   if(token!==seq.current||owner.current!==account)return;
   setMessage(record.name+' saved to your private Character Forge.');
   setMode('hub');setDraft(newDraft());setActive('Race');await refresh();
  }catch(err){if(token===seq.current)setError(err?.message||'Character could not be saved.');}
  finally{if(token===seq.current)setBusy(false);}
 };
 if(!api||!uid)return <PageLayout as="section" width="reading" labelledBy="forge-title"
  data-testid="site-character-forge-page">
  <Heading id="forge-title">Character Forge</Heading>
  <BodyText>{session.status==='authenticated'?
   'Your saved account profile is not verified. Character editing is disabled.':
   'Sign in to forge and manage your saved characters.'}</BodyText>
  <CrystalButton href="#/account/login">Login</CrystalButton>
 </PageLayout>;
 const magic=rules?magicRules(draft,rules):{slots:0,required:[],patronRequired:false,mancer:false};
 const races=options('race',query),classes=options('class',query);
 const chosen=rules?.class?.find(row=>row.slug===draft.classSlug);
 const patron=rules?patronClasses(draft,rules):[];
 const currentIndex=tabs.indexOf(active);
 const finish=()=>{setMode('hub');setDraft(newDraft());setActive('Race');setError('');};
 const pair=(key,label,value,change,multiline=false)=> <label key={key} className={styles.field}>
  {label}{multiline?<textarea rows={3} value={value||''} maxLength={1500} onChange={e=>change(extract(e))}/>:
   <input value={value||''} maxLength={350} onChange={e=>change(extract(e))}/>}
 </label>;
 return <PageLayout as="section" width="wide" className={styles.page}
  labelledBy="forge-title" data-testid="site-character-forge-page">
  <PageHeader eyebrow="Asteria Character Creation" id="forge-title" title="Character Forge" />
  {error&&<p role="alert" className={styles.notice} data-testid="site-forge-error">{error}</p>}
  {message&&<p role="status" className={styles.notice} data-testid="site-forge-message">{message}</p>}
  {loading&&<BodyText>Loading your owned characters and public rules…</BodyText>}
  {!loading&&!rules&&<CrystalButton onClick={refresh}>Retry</CrystalButton>}
  {!loading&&rules&&mode==='hub'&&<SurfacePanel className={styles.panel}>
    <div className={styles.heading}>
      <h2>My Characters</h2>
      <div className={styles.actions}>
       <CrystalButton onClick={refresh} disabled={busy}>Refresh</CrystalButton>
       <CrystalButton onClick={begin} variant="primary" data-testid="site-forge-create">Forge New Character</CrystalButton>
        {services.get('campaigns')?.connections?.availability().forgeEnabled&&
         <CrystalButton href="#/campaign-invitation" data-testid="site-forge-link-campaign">Link to Campaign</CrystalButton>}
      </div>
    </div>
    {excluded>0&&<BodyText muted>{excluded} unverified or incorrectly owned record(s)
      were excluded for your account's security.</BodyText>}
    {records.length===0?<BodyText>No saved characters were found for this account.</BodyText>:
    <div className={styles.choices}>
      {records.map(row=><article className={styles.saved} key={row.id}>
       <h3>{row.name}</h3><p>{row.race||'Race'} / {row.klass||'Class'}</p>
       <small>Level {row.level}{row.linked?' · Campaign linked':' · Unassigned'}</small>
       <CrystalButton onClick={()=>edit(row.id)} disabled={busy}>Edit Character</CrystalButton>
       {api?.dashboard?.availability().enabled&&<CrystalButton
         href={'#/react/owned-character/'+encodeURIComponent(row.id)}
         data-testid="site-forge-open-dashboard">Open Character Dashboard</CrystalButton>}
      </article>)}
    </div>}
  </SurfacePanel>}
  {!loading&&rules&&mode!=='hub'&&<>
   <div className={styles.heading}>
    <BodyText muted>{mode==='edit'?'Editing existing character (primary class locked)':
      'New character — guided creation'}</BodyText>
    <CrystalButton onClick={finish} disabled={busy}>Back to Characters</CrystalButton>
   </div>
   <div data-page-shell="true">
    <nav data-page-rail="true" data-page-nav="true" aria-label="Character creation steps">
     {tabs.map((tab,index)=><button key={tab} type="button" onClick={()=>{setActive(tab);setQuery('');setError('');}}
       aria-current={active===tab?'step':undefined} data-page-nav-item="true"
       data-testid={'site-forge-tab-'+tab.toLowerCase().replaceAll(' ','-')}>
       <span>{index+1}.</span> {tab}
      </button>)}
    </nav>
    <div data-page-content="true"><SurfacePanel as="section" className={styles.panel} data-testid="site-forge-editor">
     <div className={styles.heading}><h2>{active}</h2><small>Step {currentIndex+1} of {tabs.length}</small></div>
     {(active==='Race'||active==='Class'||active==='Origin')&&<>
      <label className={styles.field}>Search {active.toLowerCase()}
       <input value={query} onChange={e=>setQuery(extract(e))} placeholder={'Search '+active.toLowerCase()+'...'} />
      </label>
      {active==='Race'&&<>
       <ChoiceGrid choices={races} selected={draft.raceSlug}
        onChoose={x=>update({raceSlug:x})}/>
       {draft.raceSlug&&<BodyText muted>Natural AC: {
         rules.race.find(x=>x.slug===draft.raceSlug)?.rules.naturalAC}.
        Racial modifiers and characteristic tier caps apply at save.</BodyText>}
      </>}
      {active==='Class'&&<>
       <ChoiceGrid choices={classes} selected={draft.classSlug}
         disabled={mode==='edit'} onChoose={x=>update({classSlug:x})}/>
       <div className={styles.actions}>
        <CrystalButton disabled={mode==='edit'} onClick={()=>update({classMode:'single',extraClassSlugs:[]})}>
         Single Class</CrystalButton>
        <CrystalButton onClick={()=>update({classMode:'multi'})}>Multi-Class</CrystalButton>
       </div>
       {draft.classMode==='multi'&&<label className={styles.field}>Secondary Class
        <select value={draft.extraClassSlugs[0]||''} onChange={e=>update({extraClassSlugs:extract(e)?[extract(e)]:[]})}>
         <option value="">Choose a second class</option>
         {rules.class.filter(x=>x.slug!==draft.classSlug).map(row=><option key={row.slug} value={row.slug}>{row.title}</option>)}
        </select>
       </label>}
       {chosen&&<BodyText muted>{chosen.rules.role||chosen.summary}</BodyText>}
      </>}
      {active==='Origin'&&<ChoiceGrid choices={options('origin',query)}
        selected={draft.originSlug} onChoose={x=>update({originSlug:x})}/>}
     </>}
     {active==='Patron'&&<>
      <BodyText muted>Choose a public Theology patron for each Religious Class.</BodyText>
      {patron.map(row=><label className={styles.field} key={row.slug}>{row.title} Patron
       <select value={draft.classPatrons[row.slug]||''}
         onChange={e=>section('classPatrons',{key:row.slug,data:extract(e)})}>
        <option value="">Select patron</option>
        {rules.religion.map(e=><option key={e.slug} value={e.slug}>{e.title} · {e.rules.pantheon}</option>)}
       </select>
      </label>)}
     </>}
     {active==='Appearance'&&<>
      <BodyText muted>Appearance details are saved to the existing character profile.</BodyText>
      <div className={styles.fields}>{APPEARANCE_FIELDS.map(key=>pair(key,nice(key),
       valueOf(draft.appearance,key),value=>section('appearance',{key,data:value}),
       key==='voice_notes'))}</div>
     </>}
     {active==='Origin'&&<>
      <h3>Character Story</h3>
      <div className={styles.fields}>{ORIGIN_FIELDS.map(key=>pair(key,nice(key),
       valueOf(draft.origin,key),value=>section('origin',{key,data:value}),
       ['history','backstory','personality','notes'].includes(key)))}</div>
      <h3>Family Tree</h3>
      <div className={styles.fields}>{FAMILY_FIELDS.map(key=>pair(key,nice(key),
       valueOf(draft.family_tree,key),value=>section('family_tree',{key,data:value})))}</div>
     </>}
     {active==='Characteristics'&&<div className={styles.statGrid}>
      {STATS.map(key=><label className={styles.field} key={key}>{nice(key)}
       <input type="number" min="0" max="100" value={draft.characteristics[key]}
        onChange={e=>section('characteristics',{key,data:Number(extract(e))})}/>
       <small>Racial modifier: {rules.race.find(row=>row.slug===draft.raceSlug)?.rules.rollModifiers?.[key]??0}
        {' · '}Tier cap: {rules.race.find(row=>row.slug===draft.raceSlug)?.rules.tierCaps?.[key]??100}</small>
      </label>)}
     </div>}
     {active==='Magic'&&<>
      <BodyText muted>Class elemental slots: {draft.magicTypes.length}/{magic.slots}.
       {magic.required.length?' Required: '+magic.required.join(', '):''}</BodyText>
      <div className={styles.choices}>
       {MAGIC.map(name=><label className={styles.check} key={name}>
        <input type="checkbox" checked={draft.magicTypes.includes(name)}
         disabled={!draft.magicTypes.includes(name)&&draft.magicTypes.length>=magic.slots}
         onChange={()=>selectMany('magicTypes',name,magic.slots)}/>{name}
       </label>)}
      </div>
      {magic.patronRequired&&<label className={styles.field}>Patron-Linked Element
       <select value={draft.patronMagicType} onChange={e=>update({patronMagicType:extract(e)})}>
        <option value="">Choose selected element</option>
        {draft.magicTypes.map(name=><option key={name}>{name}</option>)}
       </select></label>}
      {magic.mancer&&<label className={styles.field}>Mancer Advantage Element
       <select value={draft.mancerAdvantageMagicType}
        onChange={e=>update({mancerAdvantageMagicType:extract(e)})}>
        <option value="">Choose selected element</option>
        {draft.magicTypes.map(name=><option key={name}>{name}</option>)}
       </select></label>}
     </>}
     {active==='Skills'&&<>
      <BodyText muted>Select exactly four public starting skills: {draft.skills.length}/4.</BodyText>
      <label className={styles.field}>Search skills
       <input value={query} onChange={e=>setQuery(extract(e))}/>
      </label>
      <div className={styles.choices}>
       {options('skill',query).map(row=><label className={styles.check} key={row.id}>
        <input type="checkbox" checked={draft.skills.includes(row.title)}
         disabled={!draft.skills.includes(row.title)&&draft.skills.length>=4}
         onChange={()=>selectMany('skills',row.title,4)}/>{row.title}
       </label>)}
      </div>
     </>}
     {active==='Affinity Rolls'&&<>
      <BodyText muted>Enter a D100 value for each chosen magical element and skill, then lock it.</BodyText>
      <div className={styles.fields}>{affinityItems(draft).map(item=>{
       const record=draft.affinityRolls?.[item.kind]?.[item.name]||{};
       return <div key={item.kind+item.name} className={styles.affinity}>
        <strong>{item.name}</strong>
        <label className={styles.field}>D100 Roll
         <input type="number" min="1" max="100" value={record.value??''}
          disabled={record.locked===true} onChange={e=>affinity(item.kind,item.name,'value',extract(e))}/>
        </label>
        <CrystalButton size="compact" onClick={()=>affinity(item.kind,item.name,'locked',!record.locked)}>
         {record.locked?'Unlock Roll':'Confirm / Lock'}</CrystalButton>
       </div>;})}</div>
     </>}
     {active==='Equipment'&&<>
      <BodyText muted>Choose one starting equipment pack. No campaign loot or trade items are modified.</BodyText>
      <ChoiceGrid choices={PACKS.map(x=>({...x,category:'Equipment',summary:x.items.join(', ')}))}
       selected={draft.equipmentPackSlug} onChoose={x=>update({equipmentPackSlug:x})}/>
     </>}
     {active==='Review'&&<>
      <div className={styles.fields}>
       {pair('name','Character Name',draft.details.name,value=>section('details',{key:'name',data:value}))}
       {pair('age','Age',draft.details.age,value=>section('details',{key:'age',data:value}))}
       {pair('pronouns','Pronouns',draft.details.pronouns,value=>section('details',{key:'pronouns',data:value}))}
      </div>
      <dl className={styles.review}>
       <dt>Race</dt><dd>{rules.race.find(x=>x.slug===draft.raceSlug)?.title||'Not selected'}</dd>
       <dt>Class</dt><dd>{[draft.classSlug,...draft.extraClassSlugs].join(' / ')||'Not selected'}</dd>
       <dt>Origin</dt><dd>{draft.originSlug||'Not selected'}</dd>
       <dt>Magic</dt><dd>{draft.magicTypes.join(', ')||'None'}</dd>
       <dt>Skills</dt><dd>{draft.skills.join(', ')||'None'}</dd>
       <dt>Equipment</dt><dd>{draft.equipmentPackSlug||'Not selected'}</dd>
      </dl>
      {validForge(draft,rules).length>0&&<BodyText muted>{
       validForge(draft,rules)[0].message}</BodyText>}
      <CrystalButton variant="primary" disabled={busy}
        data-testid="site-forge-save" onClick={save}>
       {busy?'Saving…':mode==='edit'?'Save Character Changes':'Create Character'}
      </CrystalButton>
     </>}
     <div className={styles.actions}>
      <CrystalButton disabled={currentIndex<=0||busy} onClick={()=>{
       setActive(tabs[currentIndex-1]);setQuery('');setError('');
      }}>Previous</CrystalButton>
      {currentIndex<tabs.length-1&&<CrystalButton disabled={busy} onClick={()=>{
       setActive(tabs[currentIndex+1]);setQuery('');setError('');
      }}>Next Step</CrystalButton>}
     </div>
    </SurfacePanel></div>
   </div>
  </>}
 </PageLayout>;
}
