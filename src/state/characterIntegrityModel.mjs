const PROFILE_SYNC_FIELDS = [
  'name', 'initial', 'pronouns', 'age', 'appearance', 'origin', 'backstory', 'family_tree',
  'biography', 'description'
];

function clone(value) {
  if(value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function own(record, key) {
  return Object.prototype.hasOwnProperty.call(record || {}, key);
}

export function safeLinkedCharacterPatch(incoming = {}) {
  const patch = {};
  PROFILE_SYNC_FIELDS.forEach(key => {
    if(own(incoming, key)) patch[key] = clone(incoming[key]);
  });
  return patch;
}

export function mergeLinkedCharacter(existing, incoming = {}, metadata = {}) {
  if(!existing) return { ...clone(incoming), ...clone(metadata) };
  return {
    ...clone(existing),
    ...safeLinkedCharacterPatch(incoming),
    ...clone(metadata)
  };
}

export { strictResourcePair } from './resourceValues.mjs';

function magicName(value) {
  return String(value || '').trim().replace(/\s+Magic$/i, '');
}

export function knownMagicElements(character = {}) {
  const values = [
    character.magicTypes,
    character.magicAffinities,
    character.gmGrantedMagicTypes,
    character.magic?.types,
    character.magic?.gmGrantedTypes,
    character.character?.magic?.types,
    character.character?.magic?.gmGrantedTypes
  ].flatMap(value => Array.isArray(value) ? value : []);
  const seen = new Set();
  return values.map(magicName).filter(value => {
    const key = value.toLowerCase();
    if(!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function addGrantedMagicElement(character = {}, magicType) {
  const name = magicName(magicType);
  if(!name) throw new Error('Choose a magical element.');
  const existing = knownMagicElements(character);
  if(existing.some(value => value.toLowerCase() === name.toLowerCase())) {
    return { character:clone(character), added:false, element:name };
  }
  const grants = [...(Array.isArray(character.gmGrantedMagicTypes) ? character.gmGrantedMagicTypes.map(magicName) : []), name];
  const next = clone(character);
  next.gmGrantedMagicTypes = grants;
  next.magic = { ...(next.magic || {}), gmGrantedTypes:grants.slice() };
  next.character = {
    ...(next.character || {}),
    magic:{ ...(next.character?.magic || {}), gmGrantedTypes:grants.slice() }
  };
  return { character:next, added:true, element:name };
}

export function timestampValue(value) {
  if(!value) return 0;
  if(typeof value.toMillis === 'function') return value.toMillis();
  if(Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000 + Number(value.nanoseconds || 0) / 1e6;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function incomingSnapshotIsStale(canonical = {}, incoming = {}) {
  const canonicalTime = timestampValue(canonical.updatedAt);
  const incomingTime = timestampValue(incoming.updatedAt);
  return canonicalTime > 0 && (!incomingTime || incomingTime < canonicalTime);
}

// Shared gameplay can flow back to the owner's Forge record. Profile and private
// fields are intentionally excluded, and complete map values replace old maps.
const GAMEPLAY_MIRROR_FIELDS = [
  'level', 'xp', 'xpMax', 'cp', 'tp', 'pendingSkillChoices', 'progressionSync',
  'dashboardNotifications', 'hp', 'sp', 'mp', 'bp', 'zp', 'resources',
  'resourceDefinitions', 'resourceState', 'conditions', 'activeEffects', 'effects',
  'talentResourceEffects', 'talentResourceState', 'talentStateVersion', 'talentEffects',
  'talentRestBonus', 'talentSavingThrows', 'talentUsage', 'talents', 'unlockedTalents',
  'acModifiers', 'specialDamage', 'soulDamage', 'restState', 'coreStateVersion',
  'coreRevision', 'actionLog', 'inventory', 'equipment', 'coins', 'coinPouch',
  'quickSlots', 'bags', 'storages', 'storageLimit', 'pendingItemRewards',
  'resolvedItemRewardIds', 'characteristics', 'skills', 'selectedSkills',
  'skillProgress', 'spells', 'quests', 'questLog', 'titles', 'gmGrantedMagicTypes',
  'magic', 'patronEffects', 'campaignEffects'
];
export function ownedGameplayMirrorPatch(existing, shared, uid, characterId) {
  if(!existing || !shared || existing.ownerUid !== uid || shared.ownerUid !== uid ||
    String(shared.sourceCharacterId || shared.id) !== String(characterId) ||
    incomingSnapshotIsStale(existing, shared)) return {};
  const patch = {};
  for(const key of GAMEPLAY_MIRROR_FIELDS) {
    if(own(shared, key) && JSON.stringify(existing[key]) !== JSON.stringify(shared[key])) patch[key] = clone(shared[key]);
  }
  return patch;
}

export const LINKED_PROFILE_SYNC_FIELDS = Object.freeze(PROFILE_SYNC_FIELDS.slice());
