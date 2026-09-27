import { resourceDefinitions, storedResource, writeResource, applyResourceChanges } from './resourceEngine.mjs';
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
  return normalizeEncounterResource(firstDefined(record, RESOURCE_ALIASES[resource] || [resource]) ?? storedResource(record,resource) ?? firstDefined(record.metadata,RESOURCE_ALIASES[resource] || [resource]));
}

export const encounterResourceKeys = record => [...new Set([...ENCOUNTER_RESOURCE_KEYS,...resourceDefinitions({...record,kind:'enemy'}).map(row=>row.id)])].filter(key=>encounterResourcePair(record,key));
export function encounterXP(record={}) {
  const value=record.xpReward ?? record.xp ?? record.experienceReward ?? record.metadata?.xpReward ?? record.metadata?.xp;
  return value!==undefined && value!==null && value!=='' && Number.isFinite(Number(value)) && Number(value)>=0 ? Number(value) : null;
}
export function encounterSourceResources(record = {}) {
  const next=Object.fromEntries(ENCOUNTER_RESOURCE_KEYS.map(key=>[key,null]));
  for(const key of encounterResourceKeys(record)) {const pair=encounterResourcePair(record,key);writeResource(next,key,...pair);}
  if(record.resourceDefinitions)next.resourceDefinitions=record.resourceDefinitions;
  return next;
}

export function preserveEncounterResources(incomingRecords = [], persistedRecords = []) {
  const persistedById = new Map((Array.isArray(persistedRecords) ? persistedRecords : []).map(record => [String(record?.id || ''), record]));
  return (Array.isArray(incomingRecords) ? incomingRecords : []).map(record => {
    const persisted = persistedById.get(String(record?.id || ''));
    if(!persisted) return { ...record };
    const next = { ...record };
    encounterResourceKeys(persisted).forEach(key => {
      const pair = encounterResourcePair(persisted, key);
      if(pair) writeResource(next,key,...pair);
    });
    return next;
  });
}

export function setEncounterResource(record = {}, key, current, maximum) {
  const resource = String(key || '').toLowerCase();
  if(!ENCOUNTER_RESOURCE_KEYS.includes(resource) && !encounterResourceKeys(record).includes(resource)) throw new Error('Unsupported encounter resource.');
  const existing = encounterResourcePair(record, resource);
  const nextMaximum = finiteNumber(maximum ?? existing?.[1]);
  const nextCurrent = finiteNumber(current);
  if(nextMaximum === null || nextMaximum <= 0) throw new Error(`Enter a ${resource.toUpperCase()} maximum greater than zero.`);
  if(nextCurrent === null) throw new Error(`Enter a valid current ${resource.toUpperCase()} value.`);
  return writeResource({...record,resources:{...record.resources}},resource,Math.max(0,Math.min(nextMaximum,nextCurrent)),nextMaximum);
}

export function adjustEncounterResource(record = {}, key, delta) {
  const resource = String(key || '').toLowerCase();
  const pair = encounterResourcePair(record, resource);
  if(!pair) throw new Error(`${resource.toUpperCase()} is not recorded for this encounter entry.`);
  const change = finiteNumber(delta);
  if(change === null) throw new Error(`Enter a valid ${resource.toUpperCase()} change.`);
  const normalized=writeResource({...record,kind:'enemy',resources:{...record.resources}},resource,...pair);
  return applyResourceChanges(normalized,{delta:{[resource]:change}});
}

export function customEncounterCreature(input={},id) {
  const name=String(input.name || '').trim().slice(0,120);
  if(!name)throw new Error('Enter a creature name.');
  const next={id,name,kind:'enemy',type:'Custom Creature',custom:true,defeated:false};
  for(const key of ['hp','sp','mp','xpReward','ac','initiative']) {
    if(input[key]==='' || input[key]===undefined) {if(['hp','xpReward'].includes(key))throw new Error('HP and XP reward are required.');continue;}
    const value=Number(input[key]);
    if(!Number.isSafeInteger(value)||value<0||value>1e9||key==='hp'&&value===0)throw new Error(`Enter a valid ${key.toUpperCase()} value.`);
    if(ENCOUNTER_RESOURCE_KEYS.includes(key)) {if(value>0)next[key]=[value,value];} else next[key]=value;
  }
  return next;
}
