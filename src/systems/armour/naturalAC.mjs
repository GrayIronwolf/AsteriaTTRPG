// Canonical racial NAC reader. "Neutral AC" is the label in legacy race notes.
const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Set(['naturalac','nac','naturalarmourclass','naturalarmorclass','neutralac']);
export function readNaturalAC(record) {
  const queue = [record]; const seen = new Set();
  while(queue.length) {
    const source = queue.shift();
    if(!source || typeof source !== 'object' || seen.has(source)) continue;
    seen.add(source);
    if(!Object.entries(source).some(([name,value])=>key(name)==='naturalacsource' && value==='fallback')) {
      for(const [name,raw] of Object.entries(source).sort(([a],[b])=>Number(b==='naturalAC')-Number(a==='naturalAC'))) {
        if(!aliases.has(key(name)) || !['number','string'].includes(typeof raw)) continue;
        if(typeof raw === 'string' && !/^[+-]?\d+(?:\.\d+)?$/.test(raw.trim())) continue;
        const value = Number(raw);
        if(Number.isFinite(value)) return Math.max(1, Math.min(12, Math.floor(value)));
      }
    }
    for(const field of ['metadata','stats','raw','info']) if(source[field]) queue.push(source[field]);
  }
  return null;
}
export function resolveRacialNaturalAC(character = {}, options = {}) {
  const raceValue = character.race || character.character?.race;
  const names = [typeof raceValue === 'string' ? raceValue : raceValue?.title, raceValue?.name, raceValue?.slug, character.raceSlug, character.raceInfo?.title, character.raceData?.title].filter(Boolean).map(key);
  const entries = options.races ?? globalThis.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries ?? globalThis.window?.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX?.entries ?? [];
  const races = Array.isArray(entries) ? entries : Object.values(entries);
  const race = races.find(entry => (!entry.domain || entry.domain === 'race') && [entry.title,entry.name,entry.slug].some(name => name && names.includes(key(name))));
  const info = options.raceInfo ?? globalThis.ASTERIA_RACE_INFO_DATA ?? globalThis.window?.ASTERIA_RACE_INFO_DATA ?? {};
  const imported = Object.entries(info).find(([name,record]) => names.includes(key(name)) || (record.title && names.includes(key(record.title))))?.[1];
  // Current race definitions take precedence over stale character snapshots.
  for(const [record,source] of [[race,'race-compendium'],[imported,'race-notes']]) {
    const value = readNaturalAC(record);
    if(value !== null) return {value,source,configured:true,entry:record};
  }
  for(const snapshot of [character.raceData,character.raceInfo,character.racial_info,typeof raceValue==='object'?raceValue:null]) {
    const value = readNaturalAC(snapshot);
    if(value !== null && !(value===1 && race?.metadata?.naturalACSource==='fallback')) return {value,source:'race-snapshot',configured:true};
  }
  const direct = readNaturalAC(character) ?? readNaturalAC(character.character);
  if(direct !== null && !(direct===1 && race?.metadata?.naturalACSource==='fallback')) return {value:direct,source:'character-snapshot',configured:true};
  return {value:1,source:'fallback',configured:false,entry:race || null};
}
