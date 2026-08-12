import { SKILL_RANKS, skillRankNumber, slug } from '../state/liveWorkspaceModel.mjs';

export function list(value) {
  if(Array.isArray(value)) return value;
  if(!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([name, record]) => typeof record === 'object' ? { name, ...record } : { name, rank:record });
}

export function characterClasses(character = {}) {
  return Array.from(new Set([
    character.klass, character.class, character.primaryClass,
    ...(Array.isArray(character.classNames) ? character.classNames : []),
    ...(Array.isArray(character.classes) ? character.classes.map(value => value?.name || value) : []),
    ...(Array.isArray(character.secondaryClasses) ? character.secondaryClasses.map(value => value?.name || value) : [])
  ].filter(Boolean).map(String)));
}

function universalEntries(type) {
  return (window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries || []).filter(entry => String(entry.type || entry.metadata?.type || '').toLowerCase() === type);
}

function tierNumber(value) {
  const match=String(value || '1').match(/[1-5]/);
  return Number(match?.[0] || 1);
}

export function talentCatalog(character = {}) {
  const classes=characterClasses(character);
  const classKeys=classes.map(slug);
  const fromIndex=universalEntries('talent').filter(entry=>{
    const owner=entry.className || entry.metadata?.className || entry.metadata?.classname || entry.metadata?.class_name || '';
    return !owner || classKeys.some(key=>slug(owner)===key);
  }).map(entry=>({
    id:entry.id || entry.slug || slug(entry.title), name:entry.title || entry.name, className:entry.className || entry.metadata?.className || entry.metadata?.classname || classes[0] || 'Class',
    tier:tierNumber(entry.talentTier || entry.filters?.talentTier || entry.metadata?.talentTier || entry.metadata?.talent_tier || entry.category),
    maxRank:Number(entry.ranks || entry.metadata?.ranks || entry.metadata?.maxRank || 5), image:entry.imagePath || entry.metadata?.image || '',
    type:entry.metadata?.abilityType || entry.metadata?.abilitytype || entry.category || 'Talent', summary:entry.summary || entry.metadata?.summary || 'Talent information coming soon.',
    cost:entry.metadata?.cost || entry.cost || '', body:entry.body || entry.content || ''
  }));
  const fallback=[];
  const trees=window.AsteriaProgressionUI?.asteriaClassTalentTrees || {};
  classKeys.forEach((key,index)=>{
    const tree=trees[key] || trees[window.AsteriaProgressionUI?.guessTalentClass?.(classes[index])];
    (tree?.tiers || []).forEach((tier,tierIndex)=>(tier.talents || []).forEach(([name,type,maxRank,summary])=>fallback.push({id:slug(name),name,className:tree.label||classes[index],tier:tierIndex+1,maxRank,type,summary,image:'',cost:''})));
  });
  const map=new Map();
  [...fallback,...fromIndex].forEach(talent=>{if(talent.name)map.set(`${slug(talent.className)}:${slug(talent.name)}`,talent);});
  return [...map.values()];
}

export function talentRank(character,talent) {
  const records=list(character.talents || character.unlockedTalents);
  const match=records.find(value=>slug(value.name||value.title)===slug(talent.name));
  return Number(match?.rank || (match?.unlocked ? 1 : 0) || 0);
}

export function selectedSkills(character = {}) {
  const raw=character.skills ?? character.selectedSkills ?? character.character?.skills ?? [];
  return list(raw).map((skill,index)=>{
    const name=skill.name || skill.title || String(skill);
    const entry=universalEntries('skill').find(value=>slug(value.title||value.name)===slug(name));
    const progress=character.skillProgress?.[slug(name)] || {};
    const rank=skillRankNumber(progress.rank || progress.rankName || skill.rank || skill.rankName || 1);
    return {
      id:skill.id || entry?.id || slug(name) || `skill-${index}`, name, rank, rankName:SKILL_RANKS[rank-1],
      successes:Number(progress.successes || 0), target:Number(progress.target ?? (rank>=7?0:rank*5)),
      category:entry?.metadata?.category || entry?.category || skill.category || 'Skill',
      summary:entry?.summary || entry?.metadata?.summary || skill.summary || 'Skill information coming soon.',
      body:entry?.body || entry?.content || ''
    };
  }).filter(skill=>skill.name);
}

export function knownMagic(character = {}) {
  return Array.from(new Set([
    ...(Array.isArray(character.magicTypes) ? character.magicTypes : []),
    ...(Array.isArray(character.magicAffinities) ? character.magicAffinities : []),
    ...(Array.isArray(character.gmGrantedMagicTypes) ? character.gmGrantedMagicTypes : []),
    ...(Array.isArray(character.character?.magic?.types) ? character.character.magic.types : []),
    ...(Array.isArray(character.character?.magic?.gmGrantedTypes) ? character.character.magic.gmGrantedTypes : [])
  ].filter(Boolean).map(value=>String(value).replace(/\s+Magic$/i,''))));
}

export function knownSpells(character = {}) {
  const source=list(character.spells || character.activeSpells || character.knownSpells);
  return source.map((spell,index)=>{
    const name=spell.name || spell.title || String(spell);
    const entry=universalEntries('spell').find(value=>slug(value.title||value.name)===slug(name));
    return {
      id:spell.id || entry?.id || slug(name) || `spell-${index}`, name, image:spell.image || entry?.imagePath || entry?.metadata?.image || '',
      element:spell.element || spell.magicType || entry?.metadata?.element || entry?.metadata?.magicType || 'Unaligned',
      rank:spell.rank || entry?.metadata?.rank || 'Rank I', cost:spell.cost ?? spell.manaCost ?? entry?.metadata?.manaCost ?? entry?.metadata?.cost ?? 0,
      costs:spell.costs || spell.resourceCosts || null, summary:spell.summary || entry?.summary || 'Spell information coming soon.', body:entry?.body || entry?.content || ''
    };
  }).filter(spell=>spell.name);
}

export function inventoryItems(character = {}) {
  return list(character.inventory).map((item,index)=>({
    id:String(item.id || item.instanceId || item.catalogId || slug(item.name||item.title) || `item-${index}`),
    name:item.name || item.title || `Item ${index+1}`, qty:Number(item.qty ?? item.quantity ?? 1), image:item.image || '',
    type:item.type || item.itemType || item.category || 'Item', rarity:item.rarity || item.itemClass || 'Common', value:Number(item.value || item.priceCopper || 0),
    equipped:Boolean(item.equipped), equippedSlot:item.equippedSlot || item.slot || '', allowedSlots:item.allowedSlots || window.AsteriaInventory?.inferSlots?.(item) || [],
    effect:item.effect || item.effects || null, locked:Boolean(item.locked), bound:Boolean(item.bound), questItem:Boolean(item.questItem), raw:item
  }));
}

export function raceTraits(character = {}) {
  return list(character.racialTraits || character.raceTraits || character.raceData?.traits || character.character?.race?.traits).map((trait,index)=>({
    id:trait.id || slug(trait.name||trait.title) || `trait-${index}`, name:trait.name || trait.title || `Racial Trait ${index+1}`,
    description:trait.description || trait.summary || 'Racial trait information coming soon.', effects:trait.effects || trait.effect || []
  }));
}

export function quests(character = {}, partyWorkspace = {}) {
  const rows=[...list(character.quests || character.questLog),...list(partyWorkspace.questLog)];
  const map=new Map();
  rows.forEach((quest,index)=>{const name=quest.name||quest.title||String(quest);const id=String(quest.id||quest.slug||slug(name)||index);map.set(id,{id,name,description:quest.description||quest.detail||'',status:quest.status||'Active',objectives:list(quest.objectives)});});
  return [...map.values()];
}

export function classTalentGroups(character = {}) {
  const catalog=talentCatalog(character);
  return characterClasses(character).map(className=>({className,talents:catalog.filter(talent=>slug(talent.className)===slug(className))})).filter(group=>group.talents.length);
}
