import {createPublicSectionHref, isValidPublicEntryRoute} from './publicEntryModel.mjs';
import {publicDetailFields} from './publicationPolicy.mjs';
import {isRestrictedSectionTitle} from './publicSections.mjs';

const overviewFields={
  race:['naturalAC','size','movement','languages','magicAffinity'],
  item:['itemType','itemClass','weight','durability','damage','marketValue','marketPrice'],
  creature:[]
};
const creatureFields=['hp','sp','mp','armour','threatTier','levelRange','size','attacks'];
const labels={
  naturalAC:'Natural Armour Class (NAC)', className:'Class', hp:'HP', sp:'SP', mp:'MP'
};
const factLabel=key=>labels[key]||key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,char=>char.toUpperCase());
const preferredTabs={
  race:['Overview','Racial Sheet','Lore','Culture','Historical Figures','Settlements','Relations','Traits & Biology'],
  class:['Overview','Talent Tree','Lore'],
  creature:['Overview','Stat Sheet','Lore','Habitat','Behaviour','Combat','Loot & Drops','Soul Information','Variants','Encounter Use'],
  item:['Overview','Properties','Crafting','Lore','Sources'],
  spell:['Overview','Casting','Scaling','Lore','Sources'],
  talent:['Overview','Ranks','Prerequisites','Scaling','Synergy']
};

function displayValue(value){
  if(typeof value==='string')return value.trim();
  if(typeof value==='number'&&Number.isFinite(value))return String(value);
  if(typeof value==='boolean')return value?'Yes':'No';
  if(Array.isArray(value))return value.map(item=>{
    if(item&&typeof item==='object')return '';
    return displayValue(item);
  }).filter(Boolean).join(', ');
  return '';
}

export function publicEntryFacts({domain,details={}},tab){
  let keys=[];
  if(tab==='Overview')keys=overviewFields[domain]||publicDetailFields(domain);
  else if(tab==='Properties'&&domain==='item')keys=publicDetailFields(domain);
  else if(tab==='Racial Sheet'&&domain==='race')keys=overviewFields.race;
  else if(tab==='Stat Sheet'&&domain==='creature')keys=creatureFields;
  else if(tab==='Loot & Drops'&&domain==='creature')keys=['lootTags'];
  else if(tab==='Soul Information'&&domain==='creature')keys=['soulValue'];
  return keys.filter(key=>key!=='naturalACSource'&&key!=='racialTraits').flatMap(key=>{
    const value=key==='naturalAC'&&details.naturalACSource==='fallback'?'Not recorded (fallback 1)':displayValue(details[key]);
    return value?[{key,label:factLabel(key),value}]:[];
  });
}

export function getPublicEntryTabs(entry){
  if(!entry)return [];
  const {domain}=entry;
  const sections=(entry.sections||[]).filter(section=>!isRestrictedSectionTitle(section.title));
  const tabs=new Map(sections.map(section=>[section.title,{title:section.title,sections:[section]}]));
  const namedSections=(...titles)=>titles.flatMap(title=>sections.filter(section=>section.title===title));
  const set=(title,contents,kind)=>tabs.set(title,{title,sections:contents,kind});
  const overview=namedSections('Overview');
  if(domain!=='handbook'&&!overview.length&&(entry.summary||publicEntryFacts(entry,'Overview').length)){
    set('Overview',entry.summary?[{title:'Overview',body:entry.summary}]:[]);
  }
  if(domain==='handbook'&&sections.length)set('Rules',sections,'headings');
  if(domain==='class'){
    const classOverview=namedSections('Overview','Class Information','Class Features');
    if(classOverview.length)set('Overview',classOverview,'headings');
    set('Talent Tree',[],'talents');
  }
  if(domain==='talent'){
    const ranks=namedSections('Ranks',...Array.from({length:5},(_,index)=>'Rank '+(index+1)));
    if(ranks.length)set('Ranks',ranks,'headings');
  }
  if(domain==='race'){
    const racial=namedSections('Racial Sheet','Racial Features','Racial Characteristics','Racial Traits','Traits & Biology');
    if(racial.length||publicEntryFacts(entry,'Racial Sheet').length||entry.details?.racialTraits?.length){
      set('Racial Sheet',racial,'racial');
    }
  }
  if(domain==='creature'){
    for(const tab of ['Stat Sheet','Loot & Drops','Soul Information']){
      if(publicEntryFacts(entry,tab).length)set(tab,namedSections(tab));
    }
  }
  if(domain==='item'&&publicEntryFacts(entry,'Properties').length){
    set('Properties',namedSections('Properties'));
  }
  if(entry.gallery?.length)set('Gallery',namedSections('Gallery'),'gallery');
  if(entry.related?.length)set('Related',namedSections('Related'),'related');
  const preferred=domain==='handbook'?['Rules','Related']:preferredTabs[domain]||['Overview'];
  return [...new Set([...preferred,...tabs.keys()])].flatMap(name=>tabs.has(name)?[tabs.get(name)]:[]);
}

/** The loader authorizes these images from published data. This validates the final URL shape. */
export function publicEntryArtwork(candidate, base=globalThis.location?.href||'https://asteria.invalid/'){
  if(typeof candidate!=='string'||!candidate||candidate.startsWith('//')||
    /[\\\s]|(?:^|\/)\.\.(?:\/|$)|%2e|%2f|%5c/i.test(candidate)||
    Array.from(candidate,char=>char.charCodeAt(0)).some(code=>code<32||code===127))return null;
  try{
    const origin=new URL(base);
    const image=new URL(candidate,origin);
    if(image.origin!==origin.origin||!['http:','https:'].includes(image.protocol)||
      image.username||image.password||image.hash||image.search||
      !/\.(?:avif|gif|jpe?g|png|webp)$/i.test(image.pathname))return null;
    return candidate;
  }catch{return null;}
}

export function publicRelationshipTargets(rows){
  const targets=new Map();
  for(const row of rows||[]){
    if(!row?.title||!isValidPublicEntryRoute(row.domain,row.slug))continue;
    const href=createPublicSectionHref(row.domain,row.slug,row.section);
    if(!targets.has(href))targets.set(href,{...row,href});
  }
  return [...targets.values()];
}

export function publicTalentTiers(rows){
  const talents=publicRelationshipTargets(rows).filter(row=>row.domain==='talent');
  return [1,2,3,4,5].map(number=>({number,talents:talents.filter(row=>Number(row.tier)===number)}));
}
