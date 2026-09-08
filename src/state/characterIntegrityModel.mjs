const PROFILE_SYNC_FIELDS = [
  'name', 'initial', 'race', 'klass', 'class', 'classes', 'classNames', 'classKeys',
  'subclass', 'pronouns', 'age', 'appearance', 'origin', 'backstory', 'family_tree',
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

export function strictResourcePair(value, resource = 'resource') {
  let current;
  let maximum;
  if(Array.isArray(value) && value.length >= 2) {
    [current, maximum] = value;
  } else if(value && typeof value === 'object') {
    current = value.current ?? value.value;
    maximum = value.maximum ?? value.max;
  } else {
    throw new Error(`${String(resource).toUpperCase()} data is missing or invalid. Refresh before trying again.`);
  }
  current = Number(current);
  maximum = Number(maximum);
  if(!Number.isFinite(current) || !Number.isFinite(maximum) || maximum < 0) {
    throw new Error(`${String(resource).toUpperCase()} data is missing or invalid. Refresh before trying again.`);
  }
  return [Math.max(0, Math.min(maximum, current)), maximum];
}

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

export const LINKED_PROFILE_SYNC_FIELDS = Object.freeze(PROFILE_SYNC_FIELDS.slice());
