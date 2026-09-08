export const ENCOUNTER_RESOURCE_KEYS = Object.freeze(['hp', 'sp', 'mp']);

const RESOURCE_ALIASES = Object.freeze({
  hp:['hp', 'health', 'hitPoints', 'hit_points'],
  sp:['sp', 'stamina', 'staminaPoints', 'stamina_points'],
  mp:['mp', 'mana', 'manaPoints', 'mana_points']
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstDefined(source = {}, keys = []) {
  for(const key of keys) {
    if(source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') return source[key];
  }
  return undefined;
}

export function normalizeEncounterResource(value) {
  if(Array.isArray(value)) {
    const current = finiteNumber(value[0]);
    const maximum = finiteNumber(value[1]);
    if(current === null || maximum === null || maximum <= 0) return null;
    return [Math.max(0, Math.min(maximum, current)), maximum];
  }
  if(value && typeof value === 'object') {
    const current = finiteNumber(value.current ?? value.value ?? value.amount);
    const maximum = finiteNumber(value.maximum ?? value.max ?? value.capacity);
    if(current === null && maximum === null) return null;
    const resolvedMaximum = maximum ?? current;
    const resolvedCurrent = current ?? resolvedMaximum;
    if(resolvedMaximum === null || resolvedCurrent === null || resolvedMaximum <= 0) return null;
    return [Math.max(0, Math.min(resolvedMaximum, resolvedCurrent)), resolvedMaximum];
  }
  const amount = finiteNumber(value);
  if(amount === null || amount <= 0) return null;
  return [amount, amount];
}

export function encounterResourcePair(record = {}, key) {
  const resource = String(key || '').toLowerCase();
  if(!ENCOUNTER_RESOURCE_KEYS.includes(resource)) return null;
  return normalizeEncounterResource(firstDefined(record, RESOURCE_ALIASES[resource]));
}

export function encounterSourceResources(record = {}) {
  return Object.fromEntries(ENCOUNTER_RESOURCE_KEYS.map(key => [key, encounterResourcePair(record, key)]));
}

export function preserveEncounterResources(incomingRecords = [], persistedRecords = []) {
  const persistedById = new Map((Array.isArray(persistedRecords) ? persistedRecords : []).map(record => [String(record?.id || ''), record]));
  return (Array.isArray(incomingRecords) ? incomingRecords : []).map(record => {
    const persisted = persistedById.get(String(record?.id || ''));
    if(!persisted) return { ...record };
    const next = { ...record };
    ENCOUNTER_RESOURCE_KEYS.forEach(key => {
      const pair = encounterResourcePair(persisted, key);
      if(pair) next[key] = pair;
    });
    return next;
  });
}

export function setEncounterResource(record = {}, key, current, maximum) {
  const resource = String(key || '').toLowerCase();
  if(!ENCOUNTER_RESOURCE_KEYS.includes(resource)) throw new Error('Unsupported encounter resource.');
  const existing = encounterResourcePair(record, resource);
  const nextMaximum = finiteNumber(maximum ?? existing?.[1]);
  const nextCurrent = finiteNumber(current);
  if(nextMaximum === null || nextMaximum <= 0) throw new Error(`Enter a ${resource.toUpperCase()} maximum greater than zero.`);
  if(nextCurrent === null) throw new Error(`Enter a valid current ${resource.toUpperCase()} value.`);
  return {
    ...record,
    [resource]:[Math.max(0, Math.min(nextMaximum, nextCurrent)), nextMaximum]
  };
}

export function adjustEncounterResource(record = {}, key, delta) {
  const resource = String(key || '').toLowerCase();
  const pair = encounterResourcePair(record, resource);
  if(!pair) throw new Error(`${resource.toUpperCase()} is not recorded for this encounter entry.`);
  const change = finiteNumber(delta);
  if(change === null) throw new Error(`Enter a valid ${resource.toUpperCase()} change.`);
  return setEncounterResource(record, resource, pair[0] + change, pair[1]);
}
