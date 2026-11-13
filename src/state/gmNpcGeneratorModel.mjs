/**
 * Digital GM Toolkit Phase 3.2 — deterministic NPC concept generator.
 * World affiliations are selected only from existing campaign entities.
 * Races are selected only from approved Asteria Compendium entries.
 * No stats, canon lore, species facts or official IDs are invented.
 */
export const NPC_GENERATOR_ROLES=Object.freeze([
  'Merchant','Guard','Scholar','Artisan','Guide','Healer','Innkeeper',
  'Sailor','Farmer','Diplomat','Hunter','Priest','Messenger','Wanderer'
]);
export const NPC_GENERATOR_MOODS=Object.freeze([
  'Grounded','Mysterious','Friendly','Suspicious','Dramatic'
]);
const firstParts=['Ael','Bel','Cal','Dar','El','Fen','Gal','Hal','Is','Jar','Kel','Lor','Mar','Nor','Or','Per','Ral','Sel','Tal','Val','Wen','Yar'];
const lastParts=['an','ara','en','enor','ian','ila','in','ira','or','ren','ric','rin','un','wyn'];
const personalityPools={
  Grounded:['Practical, patient, and quietly observant','Direct, reliable, and wary of empty promises','Thoughtful, economical with words, and steadfast','Disciplined, earnest, and slow to trust'],
  Mysterious:['Watchful, elusive, and unexpectedly generous','Soft-spoken, secretive, and attentive to small details','Calm under pressure and reluctant to reveal motives','Curious, enigmatic, and careful with questions'],
  Friendly:['Warm, talkative, and quick to offer help','Optimistic, sociable, and genuinely interested in strangers','Cheerful, loyal, and fond of stories','Hospitable, expressive, and eager to make friends'],
  Suspicious:['Guarded, analytical, and slow to trust','Cautious, blunt, and protective of personal boundaries','Observant, stubborn, and unwilling to reveal secrets','Quiet, skeptical, and fiercely protective of allies'],
  Dramatic:['Expressive, proud, and easily moved','Passionate, theatrical, and quick to make promises','Charming, impulsive, and deeply ambitious','Bold, restless, and eager to prove a point']
};
const roleMotives={
  Merchant:['Find a reliable trading partner','Protect a vulnerable caravan','Recover a missing shipment'],
  Guard:['Keep the local community safe','Find out who broke an old oath','Earn the trust of a superior'],
  Scholar:['Recover a lost document','Verify a disputed historical account','Protect valuable research'],
  Artisan:['Complete an important commission','Obtain a scarce raw material','Train a promising apprentice'],
  Guide:['Map an unfamiliar route','Protect travellers in dangerous terrain','Discover why a familiar road is unsafe'],
  Healer:['Find a rare medicinal ingredient','Care for someone who cannot pay','Learn the cause of an unusual sickness'],
  Innkeeper:['Keep the establishment running','Protect a regular guest','Repair strained ties with neighbours'],
  Sailor:['Secure passage for a companion','Locate a vessel that never returned','Earn funds for a new voyage'],
  Farmer:['Protect the coming harvest','Resolve a land dispute','Provide for an extended family'],
  Diplomat:['Negotiate a fragile agreement','Find a peaceful solution to a dispute','Protect a confidential message'],
  Hunter:['Track a dangerous animal','Protect a threatened habitat','Find a missing companion'],
  Priest:['Maintain a local sanctuary','Offer guidance during a dispute','Understand a troubling omen'],
  Messenger:['Deliver an urgent sealed message','Find the intended recipient','Recover a package lost en route'],
  Wanderer:['Find a place to belong','Reconnect with an old friend','Settle a debt from the past']
};
const fears=[
  'Losing the trust of close companions','Failing those who depend on them',
  'Being forced to abandon their home','An old mistake becoming public',
  'The loss of a hard-won livelihood','Making a decision that harms an innocent person'
];
const voices=[
  'Formal and measured, with careful pauses','Brief, practical, and direct',
  'Friendly and conversational, often asking questions',
  'Reserved and quiet, choosing every word',
  'Vivid and animated, with colourful metaphors',
  'Polite but skeptical, rarely revealing strong opinions'
];
const hooks=[
  'Has witnessed something that does not fit the official story.',
  'Needs help with a private problem that cannot be solved openly.',
  'Recognises a detail that the party has overlooked.',
  'Is keeping a promise made to someone who is missing.',
  'Has a practical service to offer, but asks a favour in return.',
  'Is caught between two competing obligations.'
];
const clean=value=>String(value??'').trim().replace(/\s+/g,' ').slice(0,120);
const array=value=>Array.isArray(value)?value:[];
const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const clampSeed=value=>Number.isSafeInteger(Number(value))?Number(value)>>>0:0;

export function officialNPCRaces(entries=[]){
  const seen=new Set();
  return array(entries).filter(entry=>record(entry)===entry&&entry.playable!==false)
    .map(entry=>clean(entry.title||entry.name))
    .filter(name=>{
      const key=name.toLocaleLowerCase();
      if(!name||seen.has(key))return false;
      seen.add(key);return true;
    }).sort((a,b)=>a.localeCompare(b));
}
export function npcWorldOptions(world={}){
  const safe=record(world);
  const names=values=>[...new Set(array(values).map(row=>clean(row?.name||row?.title)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  return {
    factions:names(safe.factions),
    locations:names([...array(safe.settlements),...array(safe.regions)])
  };
}
function xorshift(value){
  let x=(clampSeed(value)||0x9e3779b9)>>>0;
  return ()=>{
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return (x>>>0)/4294967296;
  };
}
function hashKey(key){
  let h=2166136261;
  for(const ch of key){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function chooser(seed,key){return xorshift(clampSeed(seed)^hashKey(key));}
function pick(list,random){return list[Math.floor(random()*list.length)]||'';}
export function npcGeneratorDefaults(){
  return {role:'Merchant',mood:'Grounded',race:'',faction:'',location:''};
}
export function npcGeneratorOptions({world={},races=[],role='Merchant',mood='Grounded',race='',faction='',location=''}={}){
  const validRole=NPC_GENERATOR_ROLES.includes(role)?role:NPC_GENERATOR_ROLES[0];
  const validMood=NPC_GENERATOR_MOODS.includes(mood)?mood:NPC_GENERATOR_MOODS[0];
  const worldOptions=npcWorldOptions(world);
  const canonical=officialNPCRaces(races);
  return {
    role:validRole,mood:validMood,
    race:canonical.includes(clean(race))?clean(race):'',
    faction:worldOptions.factions.includes(clean(faction))?clean(faction):'',
    location:worldOptions.locations.includes(clean(location))?clean(location):''
  };
}
/** Independent seed streams allow individual rerolls without changing others. */
export function generateNPCConcept({
  seed=0,options={},world={},races=[],previous={},locked=[]
}={}){
  const opts=npcGeneratorOptions({...options,world,races});
  const old=record(previous);
  const keep=new Set(array(locked));
  const fields={};
  const fill=(key,make)=>{
    fields[key]=keep.has(key)&&old[key]!==undefined?old[key]:make(chooser(seed,key));
  };
  fill('name',rnd=>pick(firstParts,rnd)+pick(lastParts,rnd)+' '+pick(firstParts,rnd)+pick(lastParts,rnd));
  fill('personality',rnd=>pick(personalityPools[opts.mood],rnd));
  fill('goals',rnd=>pick(roleMotives[opts.role],rnd));
  fill('fears',rnd=>pick(fears,rnd));
  fill('dialogueStyle',rnd=>pick(voices,rnd));
  fill('description',rnd=>pick(hooks,rnd));
  return {
    name:fields.name,
    species:opts.race,
    race:opts.race,
    role:opts.role,
    faction:opts.faction,
    location:opts.location,
    personality:fields.personality,
    goals:fields.goals,
    fears:fields.fears,
    dialogueStyle:fields.dialogueStyle,
    description:fields.description,
    notes:''
  };
}
