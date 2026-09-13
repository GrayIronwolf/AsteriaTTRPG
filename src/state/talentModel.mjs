import { resourcePair } from './specialDamageModel.mjs';
export const talentKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const identity = value => talentKey(value).replaceAll('-','');
export const talentMeta = (entry,key) => Object.entries(entry.metadata || entry).find(([name])=>identity(name)===identity(key))?.[1];
export const plainTalentText = value => String(value || '').replace(/\*|`/g,'').trim();
const clone = value => JSON.parse(JSON.stringify(value));
const roman = {I:1,II:2,III:3,IV:4,V:5};

export function characterClasses(character = {}) {
  const found=new Map();
  const visit=value=>{
    if(Array.isArray(value)) return value.forEach(visit);
    if(value && typeof value==='object') return visit(value.classes?.length?value.classes:value.title || value.name || value.className || value.slug || value.key);
    if(typeof value!=='string') return;
    value.split(/\s*[/,|+]\s*/).filter(Boolean).forEach(name=>{if(!found.has(identity(name)))found.set(identity(name),name.replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase()));});
  };
  for(const source of [character,character.character || {}]) for(const field of ['classInfo','classes','primaryClass','klass','class','classNames','secondaryClasses','classSlugs','primaryClassSlug','secondaryClassSlugs','classSlug','talentClasses','talentClass']) visit(source[field]);
  return [...found.values()];
}
export function rankSections(body='') {
  return Object.fromEntries([...String(body).matchAll(/^##\s+Rank\s+(\d+|IV|III|II|I|V)\b[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gm)].map(m=>[Number(m[1])||roman[m[1]],m[2].trim()]));
}
export const rankEffects = body => (String(body || '').match(/^### Effects\s*\n([\s\S]*?)(?=^### (?!#)|$(?![\s\S]))/m)?.[1] || body || '').trim();
export const rankDefined = (talent,rank) => Boolean(talent.ranks?.[rank]) && !/^Information coming soon\.?$/i.test(plainTalentText(rankEffects(talent.ranks[rank])));

export function buildTalentCatalog(character={},entries=[]) {
  const classes=characterClasses(character).map(identity), found=new Map();
  for(const entry of entries) {
    if(String(entry.type || talentMeta(entry,'type')).toLowerCase()!=='talent') continue;
    const className=entry.className || talentMeta(entry,'className') || talentMeta(entry,'classSlug');
    const name=entry.title || entry.name;
    if(!name || !className || !classes.includes(identity(className))) continue;
    const id=`${talentKey(className)}:${talentKey(name)}`, body=entry.content || entry.body || '', ranks=rankSections(body);
    // Keep the authored class page when a second, older placeholder has the same name.
    if(found.has(id) && Object.keys(found.get(id).ranks).length>=Object.keys(ranks).length) continue;
    found.set(id,{id,sourceId:entry.id || entry.slug || '',name,className,body,ranks,
      tier:Number(String(talentMeta(entry,'talentTier') || talentMeta(entry,'tier') || entry.talentTier || entry.filters?.talentTier || 1).match(/[1-5]/)?.[0] || 1),
      maxRank:Math.min(5,Math.max(1,Number(talentMeta(entry,'ranks') || 5))),
      type:talentMeta(entry,'abilityType') || (/passive/i.test(talentMeta(entry,'cooldown'))?'Passive':'Active'),
      prerequisite:talentMeta(entry,'prerequisite') || 'None',summary:entry.summary || '',image:entry.imagePath || talentMeta(entry,'image') || '',metadata:entry.metadata || {},sourceOrder:Number(talentMeta(entry,'sourceOrder') || 99999)});
  }
  return [...found.values()].sort((a,b)=>classes.indexOf(identity(a.className))-classes.indexOf(identity(b.className)) || a.tier-b.tier || a.sourceOrder-b.sourceOrder || a.name.localeCompare(b.name));
}
function savedRows(value) {
  if(Array.isArray(value)) return value.map(row=>typeof row==='string'?{name:row,rank:1}:row).filter(Boolean);
  if(!value || typeof value!=='object') return [];
  return Object.entries(value).map(([name,row])=>row && typeof row==='object'?{name,...row}:{name,rank:row===true?1:Number(row)||0});
}
export function ownedTalents(character={},catalog=[]) {
  const found=new Map();
  for(const source of [character,character.character || {}]) for(const field of ['talents','unlockedTalents','classTalents','selectedTalents']) for(const row of savedRows(source[field])) {
    const rank=Math.min(5,Math.max(0,Math.floor(Number(row.rank ?? row.currentRank ?? (row.unlocked===false?0:1)) || 0)));
    if(!rank) continue;
    // A legacy unqualified name belongs to the first matching class, not every
    // class in a multiclass character. This prevents free duplicate Mana Wells.
    const talent=catalog.find(t=>(row.id===t.id || row.id===t.sourceId || identity(row.name || row.title)===identity(t.name)) && (!row.className || identity(row.className)===identity(t.className)));
    const id=talent?.id || row.id || `${talentKey(row.className || characterClasses(character)[0] || 'legacy')}:${talentKey(row.name || row.title)}`;
    if(!found.has(id) || found.get(id).rank<rank) found.set(id,{...row,...talent,id,rank,unlocked:true,name:talent?.name || row.name || row.title});
  }
  return [...found.values()];
}
export const talentRank = (character,talent,catalog=[talent]) => ownedTalents(character,catalog).find(row=>row.id===talent.id)?.rank || 0;
export function saveTalentRank(character,talent,rank,catalog) {
  const rows=[...ownedTalents(character,catalog).filter(row=>row.id!==talent.id),{...talent,rank,unlocked:true}], records={};
  const compact=rows.map(({body,ranks,metadata,summary,...row})=>{records[records[row.name]?row.id:row.name]=row;return row;});
  return {...character,talents:records,unlockedTalents:compact};
}
export function prerequisiteProblem(character,talent,catalog) {
  const text=plainTalentText(talent.prerequisite);
  if(!text || /^(none\.?|n\/a)$/i.test(text)) return '';
  const match=text.match(/^(.+?)\s+Rank\s+(\d+|IV|III|II|I|V)$/i);
  if(!match) return `Prerequisite requires GM review: ${text}.`;
  const required=catalog.find(t=>identity(t.name)===identity(match[1]) && identity(t.className)===identity(talent.className));
  return required && talentRank(character,required,catalog)>=(Number(match[2]) || roman[match[2].toUpperCase()])?'':`Requires ${text}.`;
}
export function talentEffectActive(effect,clock={}) {
  if(effect.ended || effect.expired) return false;
  if(effect.encounterId) {
    if(clock.encounter && (clock.encounter.status!=='active' || (clock.encounter.combatId || 'legacy-combat')!==effect.encounterId)) return false;
    if(effect.untilRound && Number(clock.encounter?.round)>=effect.untilRound) return false;
  } else if(effect.expiresAt && (clock.now || Date.now())>=effect.expiresAt) return false;
  return true;
}
export function reconcileTalentEffects(character,catalog=[],options={}) {
  const next=clone(character), owned=ownedTalents(character,catalog), state={...character.talentResourceState};
  const multiplier=Math.max(1,...owned.filter(row=>['cleric:mana-well','spellblade:mana-well'].includes(row.id)).map(row=>row.rank*3));
  const bloodRank=owned.find(row=>row.id==='bloodhunter:blood-control')?.rank || 0;
  for(const [key,mult,addition] of [['mp',multiplier,0],['bp',1,bloodRank*5]]) {
    if(character[key]===undefined) continue;
    const value=character[key], rawCurrent=Array.isArray(value)?value[0]:value?.current ?? value?.value, rawMax=Array.isArray(value)?value[1]:value?.maximum ?? value?.max;
    if(!Number.isFinite(Number(rawCurrent)) || !Number.isFinite(Number(rawMax)) || Number(rawMax)<0) continue;
    const [current,maximum]=resourcePair(character[key]), previous=state[key];
    // CP and equipment change the base maximum. Keep those deltas separate from
    // the talent multiplier so recalculation never compounds it or refills mana.
    const base=Math.max(0,previous?previous.baseMaximum+maximum-previous.maximum:maximum), max=Math.floor(base*mult+addition);
    const increase=options.grantIncrease && key==='mp'?Math.max(0,base*(mult-(previous?.multiplier || 1))):0;
    next[key]=[key==='bp'?current:Math.min(max,current+increase),max];
    state[key]={baseMaximum:base,multiplier:mult,addition,maximum:max};
  }
  next.talentResourceState=state;
  next.talentEffects=(character.talentEffects || []).map(effect=>({...effect,expired:!talentEffectActive(effect,options)}));
  next.acModifiers=[...(Array.isArray(character.acModifiers)?character.acModifiers:[]).filter(row=>row.sourceType!=='class-talent'),...next.talentEffects.filter(effect=>!effect.expired && effect.ac).map(effect=>({id:`talent:${effect.id}`,name:effect.name,source:effect.name,sourceType:'class-talent',type:'AC_MODIFIER',value:effect.ac,active:true}))];
  next.talentRestBonus=(owned.find(row=>row.id==='spellblade:mystic-recovery')?.rank || 0)*.1;
  const mind=owned.find(row=>row.id==='cleric:fortified-mind');
  next.talentSavingThrows=mind?[{source:'Fortified Mind',value:mind.rank+1,against:['Fear','Psychic effects','Magical mental influence']}]:[];
  next.talentStateVersion=1;
  return next;
}
export function resetTalentRest(character,type) {
  const next=clone(character);
  next.talentUsage=Object.fromEntries(Object.entries(next.talentUsage || {}).map(([id,use])=>[id,use.reset==='short-rest' || type==='long' && use.reset==='long-rest'?{...use,count:0}:use]));
  next.talentEffects=(next.talentEffects || []).map(effect=>({...effect,ended:true}));
  return next;
}
export function prepareForgeTalents(existing,next,entries) {
  const result={...next,talentEffects:existing?.talentEffects || [],talentUsage:existing?.talentUsage || {},talentResourceState:{}};
  const catalog=buildTalentCatalog(result,entries);
  for(const row of ownedTalents(existing || {},catalog)) Object.assign(result,saveTalentRank(result,row,row.rank,catalog));
  for(const key of ['mp','bp']) if(existing?.talentResourceState?.[key] && result[key]) {
    const maximum=resourcePair(result[key])[1];
    result.talentResourceState[key]={...existing.talentResourceState[key],baseMaximum:maximum,maximum};
    result[key]=[resourcePair(existing[key])[0],maximum];
  }
  return reconcileTalentEffects(result,catalog,{grantIncrease:true});
}
