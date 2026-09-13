import { buildTalentCatalog, characterClasses, ownedTalents, talentRank as savedTalentRank } from '../state/talentModel.mjs';
import { SKILL_RANKS, normalizeLiveItem, skillRankNumber, slug } from '../state/liveWorkspaceModel.mjs';
import { getMarketPrice, getMarketValue } from '../systems/items/marketPricing.mjs';
import { magicElementImage } from '../data/magicElementSymbols.mjs';
import { knownMagicElements } from '../state/characterIntegrityModel.mjs';

export function list(value) {
  if(Array.isArray(value)) return value;
  if(!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([name, record]) => typeof record === 'object' ? { name, ...record } : { name, rank:record });
}

export { characterClasses } from '../state/talentModel.mjs';
function universalEntries(type) {
  return (window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries || []).filter(entry => String(entry.type || entry.metadata?.type || '').toLowerCase() === type);
}
export function talentCatalog(character = {}) { return buildTalentCatalog(character, universalEntries('talent')); }
export function talentRank(character, talent) { return savedTalentRank(character, talent, talentCatalog(character)); }
export function unlockedClassTalents(character = {}) { return ownedTalents(character, talentCatalog(character)); }

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
  return knownMagicElements(character);
}

export function knownSpells(character = {}) {
  const source=list(character.spells || character.activeSpells || character.knownSpells);
  return source.map((spell,index)=>{
    const name=spell.name || spell.title || String(spell);
    const entry=universalEntries('spell').find(value=>slug(value.title||value.name)===slug(name));
    const element=spell.element || spell.magicType || entry?.metadata?.magicalElement || entry?.metadata?.element || entry?.metadata?.magicType || 'Unaligned';
    return {
      id:spell.id || entry?.id || slug(name) || `spell-${index}`, name, image:spell.image || entry?.imagePath || entry?.metadata?.image || magicElementImage(element),
      element,
      rank:spell.rank || entry?.metadata?.rank || 'Rank I', cost:spell.cost ?? spell.manaCost ?? entry?.metadata?.manaCost ?? entry?.metadata?.cost ?? 0,
      costs:spell.costs || spell.resourceCosts || null, summary:spell.summary || entry?.summary || 'Spell information coming soon.', body:entry?.body || entry?.content || ''
    };
  }).filter(spell=>spell.name);
}

export function inventoryItems(character = {}) {
  return list(character.inventory).map((source,index)=>{
    const item=normalizeLiveItem(source,index,character);
    return {
      id:item.id,
      name:item.name || `Item ${index+1}`, trueName:item.trueName, basicName:item.basicName, identified:item.identified, storageId:item.storageId, storageSlot:item.storageSlot,
      isSpellbook:item.isSpellbook, spell:item.spell, qty:Number(item.qty ?? item.quantity ?? 1), image:item.image || '',
      type:item.type || item.itemType || item.category || 'Item', rarity:item.rarity || item.itemClass || 'Common',
      marketValue:getMarketValue(item), marketPrice:getMarketPrice(item), pricingNeedsCompletion:Boolean(item.pricingNeedsCompletion),
      weight:Number(item.weight ?? item.unitWeight ?? item.metadata?.weight ?? 0),
      equipped:Boolean(item.equipped), equippedSlot:item.equippedSlot || item.slot || '', allowedSlots:item.allowedSlots || window.AsteriaInventory?.inferSlots?.(item) || [],
      effect:item.effect || item.effects || null, locked:Boolean(item.locked), bound:Boolean(item.bound), questItem:Boolean(item.questItem), raw:item
    };
  });
}

export function raceTraits(character = {}) {
  return list(character.racialTraits || character.raceTraits || character.raceData?.traits || character.character?.race?.traits).map((trait,index)=>({
    id:trait.id || slug(trait.name||trait.title) || `trait-${index}`, name:trait.name || trait.title || `Racial Trait ${index+1}`,
    description:trait.description || trait.summary || 'Racial trait information coming soon.', effects:trait.effects || trait.effect || []
  }));
}

export function quests(character = {}, partyWorkspace = {}) {
  const rows=[...list(partyWorkspace.questLog),...list(character.quests || character.questLog)];
  const map=new Map();
  rows.forEach((quest,index)=>{
    const record=quest && typeof quest==='object' ? quest : {};
    const name=record.name||record.title||String(quest);
    const id=String(record.id||record.slug||slug(name)||index);
    map.set(id,{
      ...record,
      id,
      name,
      title:record.title||name,
      description:record.description||record.objective||record.detail||'',
      status:record.status||'Active',
      objectives:list(record.objectives),
      reward:record.reward||{},
      rewardClaimedAt:record.rewardClaimedAt||null,
      rewardTransactionId:record.rewardTransactionId||'',
      rewardStatus:record.rewardStatus||''
    });
  });
  return [...map.values()];
}

export function classTalentGroups(character = {}) {
  const catalog=talentCatalog(character);
  return characterClasses(character).map(className=>({className,talents:catalog.filter(talent=>slug(talent.className)===slug(className))})).filter(group=>group.talents.length);
}
