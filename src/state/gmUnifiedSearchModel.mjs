/** Digital GM Phase 10.2 — read-only, local, GM-scoped unified search.
 * Inputs come only from already authorised GM subscriptions. All indexed fields
 * are allowlisted; raw private descriptions, notes and secrets are not copied.
 * No public endpoint, search index document, or third-party search service.
 */
import {GM_TOOLKIT_TOOLS} from './gmToolkitModel.mjs';

export const SEARCH_LIMIT=50;
export const SEARCH_INDEX_LIMIT=2400;
export const SEARCH_QUERY_MAX=120;
export const SEARCH_CATEGORIES=Object.freeze([
 'all','tool','npc','creature','merchant','shop','battle-map','world-map',
 'location','faction','event','quest','encounter','random-table','loot-table',
 'note','pdf','character'
]);
export const SEARCH_CATEGORY_LABELS=Object.freeze({
 all:'All',tool:'Tools',npc:'NPCs',creature:'Creatures',merchant:'Merchants',
 shop:'Shops','battle-map':'Battle Maps','world-map':'World Maps',
 location:'Locations',faction:'Factions',event:'Events',quest:'Quests',
 encounter:'Encounters','random-table':'Random Tables','loot-table':'Loot Tables',
 note:'Session Notes',pdf:'PDFs',character:'Characters'
});
const array=value=>Array.isArray(value)?value:[];
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const text=(value,max=160)=>typeof value==='string'?value.trim().slice(0,max):'';
const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .toLocaleLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value);
const bool=value=>value===true;
const sections=Object.freeze(['regions','settlements','merchants','factions','events']);
const destination=Object.freeze({
 tool:'toolkit',npc:'bestiary',creature:'bestiary',merchant:'world',shop:'economy',
 'battle-map':'battle-maps','world-map':'world-atlas',location:'world',
 faction:'world',event:'world',quest:'quests',encounter:'encounter-rewards',
 'random-table':'random-tables','loot-table':'economy',note:'session-library',
 pdf:'session-library',character:'inventory'
});
export const SEARCH_TABS=Object.freeze([
 'toolkit','bestiary','world','economy','battle-maps','world-atlas','quests',
 'encounter-rewards','random-tables','session-library','inventory','main',
 'tools','settings','crafting','presentation','notes','soundboard',
 'session-recordings','asteria-calendar','weather-environment','advanced-dice'
]);
function make(category,record,index,{id='',title='',detail='',words='',tab='',targetId='',section=''}={}){
 const safeId=text(id,160);
 const safeTitle=text(title,140);
 if(!safeTitle)return null;
 const safeTab=SEARCH_TABS.includes(tab)?tab:destination[category];
 if(!safeTab)return null;
 const key=category+':'+(safeId&&token(safeId)?safeId:'index-'+index)+':'+index;
 const subtitle=text(detail,190);
 const searchText=fold([safeTitle,subtitle,text(words,320),safeId].join(' '));
 // Never attach source records. The result is an explicit minimum projection.
 return Object.freeze({key,category,id:token(safeId)?safeId:'',title:safeTitle,
  detail:subtitle,searchText,tab:safeTab,targetId:token(targetId)?targetId:'',
  section:sections.includes(section)?section:''});
}
export function buildGMSearchIndex(sources={}){
 const workspace=object(sources.workspace),world=object(workspace.world),
 ecosystem=object(sources.itemEcosystem),rows=[],seen=new Set();
 const push=(category,records,mapper)=>{
  for(const [index,record] of array(records).slice(0,320).entries()){
   if(rows.length>=SEARCH_INDEX_LIMIT)break;
   if(!record||typeof record!=='object')continue;
   const entry=make(category,record,rows.length,mapper(record,index));
   if(!entry||seen.has(entry.key))continue;
   seen.add(entry.key);rows.push(entry);
  }
 };
 push('tool',GM_TOOLKIT_TOOLS,t=>({id:t.id,title:t.label,detail:t.description,
   words:t.keywords,tab:t.tab,targetId:t.targetId}));
 push('npc',world.npcs,r=>({id:r.id,title:r.name||r.title,
   detail:[r.role,r.race,r.faction,r.location].filter(Boolean).join(' · '),
   words:[r.species,r.threatTier,r.type].join(' ')}));
 push('creature',world.creatures,r=>({id:r.id,title:r.name||r.title,
   detail:[r.species,r.location,r.threatTier].filter(Boolean).join(' · '),
   words:[r.race,r.type].join(' ')}));
 push('merchant',world.merchants,r=>({id:r.id,title:r.name||r.title,
   detail:[r.location,r.region,r.type].filter(Boolean).join(' · '),section:'merchants'}));
 push('shop',ecosystem.shops,r=>({id:r.id,title:r.name||r.title,
   detail:[r.type,r.region,r.location].filter(Boolean).join(' · '),
   tab:'economy',targetId:'react-gm-shops'}));
 push('battle-map',sources.battleMaps,r=>({id:r.id,title:r.name,
   detail:[r.kind==='video'?'Looping video':'Map',r.visibility==='players'?'Published':'Private'].join(' · ')}));
 push('world-map',sources.worldMaps,r=>({id:r.id,title:r.name,
   detail:[r.region,r.status==='published'?'Published':'Private'].filter(Boolean).join(' · ')}));
 push('location',world.regions,r=>({id:r.id,title:r.name||r.title,
   detail:[r.type,'Region'].filter(Boolean).join(' · '),section:'regions'}));
 push('location',world.settlements,r=>({id:r.id,title:r.name||r.title,
   detail:[r.region,r.type,'Settlement'].filter(Boolean).join(' · '),section:'settlements'}));
 push('faction',world.factions,r=>({id:r.id,title:r.name||r.title,detail:r.region||r.status||'',section:'factions'}));
 push('event',world.events,r=>({id:r.id,title:r.name||r.title,detail:r.location||r.status||'',section:'events'}));
 push('quest',workspace.quests,r=>({id:r.id,title:r.title||r.name,
   detail:[r.location,r.questGiver,r.status].filter(Boolean).join(' · '),
   words:r.questType||r.category||''}));
 push('encounter',sources.encounterPlans,r=>({id:r.id,title:r.name||r.title||
   'Encounter plan '+String(r.id||'').slice(0,8),
   detail:[r.status,r.biome,r.threatTier?'TT '+r.threatTier:''].filter(Boolean).join(' · ')}));
 push('encounter',workspace.gameplay?.encounterTemplates,r=>({id:r.id,
   title:r.title||r.name,detail:r.biome||r.status||''}));
 push('random-table',sources.randomTables,r=>({id:r.id,title:r.name,
   detail:[r.category,r.location,r.status].filter(Boolean).join(' · ')}));
 push('loot-table',sources.lootTables,r=>({id:r.id,title:r.name,
   detail:[r.location,r.status].filter(Boolean).join(' · '),
   targetId:'react-gm-loot-tables'}));
 push('note',sources.sessionNotes,r=>({id:r.id,title:r.title,
   detail:[r.kind,r.sessionLabel].filter(Boolean).join(' · ')}));
 push('pdf',sources.sessionPdfs,r=>({id:r.id,title:r.title||r.fileName,
   detail:[r.fileName,r.visibility==='players'?'Published':'GM private'].filter(Boolean).join(' · ')}));
 push('character',Object.values(object(sources.characters)),r=>({id:r.id,title:r.name,
   detail:[r.klass||r.class,r.level?'Level '+r.level:''].filter(Boolean).join(' · ')}));
 return rows;
}
export function searchGMIndex(rows=[],query='',category='all',limit=SEARCH_LIMIT){
 const normalized=fold(String(query??'').slice(0,SEARCH_QUERY_MAX));
 const terms=normalized.split(' ').filter(Boolean).slice(0,12);
 if(!SEARCH_CATEGORIES.includes(category))return [];
 const maximum=Math.max(1,Math.min(SEARCH_LIMIT,Math.trunc(Number(limit)||SEARCH_LIMIT)));
 if(!terms.length&&category==='all')return [];
 return array(rows).filter(entry=>entry&&
  (category==='all'||entry.category===category)&&
  terms.every(term=>entry.searchText?.includes(term)))
  .map(entry=>{
   let rank=0;
   if(terms.length){
    const name=fold(entry.title),detail=fold(entry.detail);
    for(const term of terms){
     rank+=name===term?50:name.startsWith(term)?22:name.includes(term)?10:
       detail.includes(term)?3:1;
    }
   }else rank=5;
   return {entry,rank};
  }).sort((a,b)=>b.rank-a.rank||
   a.entry.title.localeCompare(b.entry.title)||a.entry.category.localeCompare(b.entry.category))
  .slice(0,maximum).map(x=>x.entry);
}
export function searchResultDestination(record){
 if(!record||!SEARCH_CATEGORIES.includes(record.category)||record.category==='all')
  return null;
 const tab=record.category==='tool'?record.tab:destination[record.category];
 if(!SEARCH_TABS.includes(tab))return null;
 if(record.category==='tool'&&!GM_TOOLKIT_TOOLS.some(t=>t.id===record.id&&t.tab===tab))
  return null;
 return Object.freeze({
  tab,id:token(record.id)?record.id:'',title:text(record.title,140),
  category:record.category,targetId:token(record.targetId)?record.targetId:'',
  section:sections.includes(record.section)?record.section:''
 });
}
export function categoryCounts(rows=[]){
 return Object.fromEntries(SEARCH_CATEGORIES.map(category=>[
  category,category==='all'?rows.length:rows.filter(row=>row.category===category).length
 ]));
}
