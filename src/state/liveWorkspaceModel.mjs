import { normalizeMarketPricing } from '../systems/items/marketPricing.mjs';

export const SESSION_LIMIT_MS = 10 * 60 * 60 * 1000;

export const CHARACTERISTICS = [
  { key:'strength', short:'STR', label:'Strength' },
  { key:'dexterity', short:'DEX', label:'Dexterity' },
  { key:'agility', short:'AGI', label:'Agility' },
  { key:'constitution', short:'CON', label:'Constitution' },
  { key:'endurance', short:'END', label:'Endurance' },
  { key:'intelligence', short:'INT', label:'Intelligence' },
  { key:'wisdom', short:'WIS', label:'Wisdom' },
  { key:'charisma', short:'CHA', label:'Charisma' },
  { key:'luck', short:'LCK', label:'Luck' }
];

export const SKILL_RANKS = ['Novice','Initiate','Apprentice','Journeyman','Adept','Master','Grandmaster'];
export const TALENT_TIER_LEVELS = { 1:1, 2:10, 3:20, 4:30, 5:40 };

export const DEFAULT_DASHBOARD_PANELS = [
  'weapons', 'talents', 'spells', 'skills', 'conditions'
];

export const OPTIONAL_INFORMATION_FIELDS = [
  'portrait', 'title', 'party', 'currency', 'campaignDetails', 'liveSync'
];

export const DEFAULT_CHARACTER_STORAGES = [];

const LEGACY_AUTOMATIC_STORAGES = [
  { id:'storage-1', name:'Adventuring Pack' },
  { id:'storage-2', name:'Item Pouch' },
  { id:'storage-3', name:'Personal Storage' }
];

export const STORAGE_GRID_MIN = 1;
export const STORAGE_GRID_MAX = 20;

export function timestampMs(value) {
  if(!value) return 0;
  if(typeof value.toMillis === 'function') return value.toMillis();
  if(Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1e6;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function effectiveSession(session = {}, now = Date.now()) {
  const expiresAt = timestampMs(session.expiresAt);
  const expired = ['active','paused'].includes(session.status) && Boolean(expiresAt) && now >= expiresAt;
  return { ...session, status:expired ? 'expired' : (session.status || 'idle'), expired, expiresAtMs:expiresAt, editable:session.status === 'active' && !expired };
}

export function sessionRemainingMs(session, now = Date.now()) {
  const state = effectiveSession(session, now);
  return state.editable ? Math.max(0, state.expiresAtMs - now) : 0;
}

export function characteristicValue(character = {}, key) {
  const source = character.characteristics || {};
  const aliases = {
    strength:['strength','str'], dexterity:['dexterity','dex'], agility:['agility','agi'],
    constitution:['constitution','con'], endurance:['endurance','end'], intelligence:['intelligence','int'],
    wisdom:['wisdom','wis'], charisma:['charisma','cha'], luck:['luck','lck']
  }[key] || [key];
  const raw = aliases.map(alias => source[alias]).find(value => value !== undefined);
  return Number(raw?.value ?? raw ?? 0);
}

export function characteristicTier(score) {
  const value = Number(score || 0);
  if(value >= 100) return { label:'Tier V', modifier:5 };
  if(value >= 80) return { label:'Tier IV', modifier:4 };
  if(value >= 60) return { label:'Tier III', modifier:3 };
  if(value >= 40) return { label:'Tier II', modifier:2 };
  if(value >= 20) return { label:'Tier I', modifier:1 };
  return { label:'Tier 0', modifier:0 };
}

export function characteristicCap(character = {}, key) {
  const rules = character.characteristicRules || character.characteristic_rules || character.character?.characteristic_rules || {};
  const cap = rules.tierCaps?.[key] || rules.tier_caps?.[key];
  const value = Number(cap?.maxScore ?? cap?.max ?? cap?.score ?? 100);
  return Number.isFinite(value) ? value : 100;
}

export function applyCharacteristicPoints(character, key, amount) {
  const points = Math.max(1, Math.floor(Number(amount || 1)));
  const available = Math.max(0, Number(character.cp || 0));
  if(!CHARACTERISTICS.some(entry => entry.key === key)) throw new Error('Unknown characteristic.');
  if(points > available) throw new Error('Not enough Characteristic Points.');
  const before = characteristicValue(character, key);
  const cap = characteristicCap(character, key);
  const applied = Math.min(points, Math.max(0, cap - before));
  if(!applied) throw new Error('Characteristic tier cap reached.');
  const next = structuredCloneSafe(character);
  next.characteristics = { ...(next.characteristics || {}), [key]:before + applied };
  next.cp = available - applied;
  const resourceKey = { constitution:'hp', endurance:'sp', wisdom:'mp' }[key];
  if(resourceKey) {
    const pair = Array.isArray(next[resourceKey]) ? next[resourceKey] : [0, 0];
    next[resourceKey] = [Number(pair[0] || 0), Number(pair[1] || 0) + applied * 10];
  }
  return { character:next, applied };
}

export function talentRankCost(nextRank) {
  return Math.max(1, Math.floor(Number(nextRank || 1))) * 3;
}

export function talentTierUnlocked(level, tier) {
  return Number(level || 0) >= Number(TALENT_TIER_LEVELS[Number(tier) || 1] || 1);
}

export function skillRankNumber(value) {
  if(Number.isFinite(Number(value))) return Math.max(1, Math.min(7, Number(value)));
  const index = SKILL_RANKS.findIndex(rank => rank.toLowerCase() === String(value || '').toLowerCase());
  return index >= 0 ? index + 1 : 1;
}

export function nextSkillProgress(current = {}) {
  let rank = skillRankNumber(current.rank || current.rankName);
  let successes = Math.max(0, Number(current.successes || 0)) + 1;
  const target = rank >= 7 ? 0 : rank * 5;
  let rankedUp = false;
  if(rank < 7 && successes >= target) {
    rank += 1;
    successes = 0;
    rankedUp = true;
  }
  return { ...current, rank, rankName:SKILL_RANKS[rank - 1], successes, target:rank >= 7 ? 0 : rank * 5, rankedUp };
}

export function parseResourceCost(value, fallbackResource = 'mp') {
  if(value && typeof value === 'object') {
    return ['hp','sp','mp','bp'].reduce((result, key) => {
      const amount = Number(value[key] ?? value[key.toUpperCase()] ?? 0);
      if(amount > 0) result[key] = amount;
      return result;
    }, {});
  }
  const text = String(value ?? '').trim();
  const result = {};
  for(const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(HP|SP|MP|BP)/gi)) result[match[2].toLowerCase()] = Number(match[1]);
  if(!Object.keys(result).length && Number.isFinite(Number(value)) && Number(value) > 0) result[fallbackResource] = Number(value);
  return result;
}

export function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

export function normalizeDashboardPreferences(character = {}) {
  const source = character.dashboardPreferences || {};
  const requested = Array.isArray(source.panelOrder) ? source.panelOrder : [];
  const panelOrder = [...new Set([...requested, ...DEFAULT_DASHBOARD_PANELS])]
    .filter(key => DEFAULT_DASHBOARD_PANELS.includes(key));
  return {
    panelOrder,
    hiddenPanels:Array.isArray(source.hiddenPanels) ? source.hiddenPanels.filter(key => DEFAULT_DASHBOARD_PANELS.includes(key)) : [],
    hiddenInformationFields:Array.isArray(source.hiddenInformationFields)
      ? source.hiddenInformationFields.filter(key => OPTIONAL_INFORMATION_FIELDS.includes(key))
      : [],
    visibleTitleId:String(source.visibleTitleId || ''),
    showPartyMembership:source.showPartyMembership !== false
  };
}

export function normalizeCharacterStorages(character = {}) {
  const current = Array.isArray(character.storages) ? character.storages : [];
  const legacy = Array.isArray(character.bags) ? character.bags : [];
  const keepStorage = storage => !LEGACY_AUTOMATIC_STORAGES.some(record =>
    String(storage?.id || '') === record.id && String(storage?.name || '') === record.name
  );
  const activeStorages = current.filter(keepStorage);
  const source = activeStorages.length ? activeStorages : legacy.filter(keepStorage);
  const limit = Math.max(3, Math.floor(Number(character.storageLimit || 3)), source.length);
  return source
    .slice(0, limit)
    .map((storage,index) => {
      const requestedSlots = Math.max(1, Number(storage.maxSlots || storage.capacity || 16));
      const requestedCols = Number(storage.cols ?? storage.columns ?? storage.gridCols);
      const cols = Math.max(STORAGE_GRID_MIN, Math.min(STORAGE_GRID_MAX, Math.floor(requestedCols || Math.ceil(Math.sqrt(requestedSlots)))));
      const requestedRows = Number(storage.rows ?? storage.gridRows);
      const rows = Math.max(STORAGE_GRID_MIN, Math.min(STORAGE_GRID_MAX, Math.floor(requestedRows || Math.ceil(requestedSlots / cols))));
      return {
        ...structuredCloneSafe(storage),
        id:String(storage.id || storage.bagId || `storage-${index+1}`),
        name:String(storage.name || storage.label || `Storage ${index+1}`),
        order:Number(storage.order ?? index),
        rows,
        cols,
        maxSlots:rows * cols
      };
    })
    .sort((left,right) => left.order - right.order)
    .map((storage,index) => ({ ...storage, order:index }));
}

export function firstFreeStorageSlot(items = [], storage = {}, excludeItemId = '') {
  if(!storage?.id) return -1;
  const capacity = Math.max(1, Number(storage.maxSlots || Number(storage.rows || 4) * Number(storage.cols || 4)));
  const occupied = new Set(items
    .filter(item => String(item.storageId || item.bagId || '') === String(storage.id || '') && !item.equipped && String(item.id || '') !== String(excludeItemId || ''))
    .map(item => Number(item.storageSlot ?? item.bagSlot))
    .filter(slot => Number.isInteger(slot) && slot >= 0 && slot < capacity));
  for(let slot = 0; slot < capacity; slot += 1) if(!occupied.has(slot)) return slot;
  return -1;
}

export function stackableStorageItem(items = [], incoming = {}, storageId = '') {
  if(incoming.stackable === false || Number(incoming.maxStack || 0) === 1 || !storageId) return null;
  const identity = String(incoming.catalogId || incoming.trueName || incoming.name || incoming.title || '').trim().toLowerCase();
  if(!identity) return null;
  return items.find(item => {
    if(item.equipped || String(item.storageId || item.bagId || '') !== String(storageId)) return false;
    if(item.stackable === false || Number(item.maxStack || 0) === 1 || item.identified !== incoming.identified) return false;
    return String(item.catalogId || item.trueName || item.name || item.title || '').trim().toLowerCase() === identity;
  }) || null;
}

export function characterKnowsIdentify(character = {}) {
  const spells = [character.spells, character.activeSpells, character.knownSpells]
    .flatMap(value => Array.isArray(value) ? value : [])
    .map(value => slug(value?.name || value?.title || value));
  return spells.includes('identify');
}

export function unidentifiedItemName(item = {}) {
  if(item.identified !== false) return String(item.name || item.title || 'Item');
  if(item.basicName) return String(item.basicName);
  const text = `${item.type || ''} ${item.category || ''} ${item.name || item.title || ''}`.toLowerCase();
  if(/spellbook|book|tome|grimoire/.test(text)) return 'Book';
  if(/shield/.test(text)) return 'Shield';
  const weaponType = [
    ['sword','Sword'], ['axe','Axe'], ['dagger','Dagger'], ['mace','Mace'],
    ['spear','Spear'], ['staff','Staff'], ['crossbow','Crossbow'], ['bow','Bow']
  ].find(([pattern]) => text.includes(pattern));
  if(weaponType) return weaponType[1];
  if(/weapon/.test(text)) return 'Weapon';
  if(/armour|armor|helmet|helm|breastplate|robe|boots|gloves/.test(text)) return 'Equipment';
  if(/potion|elixir|poison|vial/.test(text)) return 'Vial';
  return 'Item';
}

export function normalizeLiveItem(item = {}, index = 0, character = {}) {
  const storages = normalizeCharacterStorages(character);
  const identified = item.identified !== false;
  const storedSlot = Number(item.storageSlot ?? item.bagSlot);
  return normalizeMarketPricing({
    ...structuredCloneSafe(item),
    id:String(item.id || item.instanceId || item.catalogId || slug(item.name || item.title) || `item-${index}`),
    name:unidentifiedItemName(item),
    trueName:String(item.trueName || item.name || item.title || 'Unknown Item'),
    basicName:String(item.basicName || unidentifiedItemName({ ...item, identified:false })),
    identified,
    storageId:String(item.storageId || item.bagId || storages[0]?.id || ''),
    storageSlot:Number.isInteger(storedSlot) && storedSlot >= 0 ? storedSlot : null,
    isSpellbook:Boolean(item.isSpellbook || /spellbook|grimoire|tome/i.test(`${item.type || ''} ${item.category || ''}`)),
    spell:item.spell || item.spellData || null
  }, { legacy:true, removeLegacy:true, migratedRecord:true });
}

export function slug(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
