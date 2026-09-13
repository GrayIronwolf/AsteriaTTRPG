import { talentMeta, talentKey, plainTalentText as plain, rankEffects, rankDefined, talentRank } from './talentModel.mjs';
import { resourcePair, clampHpForSoulDamage } from './specialDamageModel.mjs';
import { strictResourcePair } from './characterIntegrityModel.mjs';
function numbers(text) {
  const aliases={mp:'mp',sp:'sp',hp:'hp',bp:'bp',mana:'mp',stamina:'sp',health:'hp',blood:'bp'};
  return [...plain(text).matchAll(/([+-]?\d+)\s*(Mana(?: Points?)?|Stamina(?: Points?)?|Health(?: Points?)?|Blood Points?|MP|SP|HP|BP)\b/gi)].map(m=>[aliases[m[2].split(' ')[0].toLowerCase()],Number(m[1])]);
}
// Reviewed exceptions: optional outcomes and sacrifices aren't general costs.
const tables={
  'bloodhunter:blood-rite':{hp:[5,8,12,16,20],bpGain:[5,6,8,10,15]},
  'bloodhunter:blood-tithe':{hp:[10,15,20,25,30],bp:[5,10,15,20,25]},
  'bloodhunter:blood-control':{bpGain:[10,10,15,20,25]},
  'bloodhunter:blood-scent':{mp:[10,10,10,10,10],bpGain:[5,6,8,10,15]},
  'bloodhunter:hardened-soul':{bpGain:[5,10,15,20,25]},
  'bloodhunter:mark-of-the-quarry':{bpGain:[5,10,15,20,25]},
  'spellblade:arcane-pursuit':{mp:[20,25,30,35,40]},
  'spellblade:mana-infusion':{mp:[12,12,12,35,40],sp:[5,5,5,0,0]}
};
export function talentRules(talent,rank=1) {
  const body=talent.ranks?.[rank] || '', effects=rankEffects(body), text=plain(effects), costs={};
  const passive=/^passive(?:\s*\(|$)/i.test(talent.type) || /^passive$/i.test(talentMeta(talent,'cooldown'));
  let variable=false,bpGain=0;
  for(const [field,key] of [['manaCost','mp'],['staminaCost','sp'],['hpCost','hp'],['bloodPointCost','bp']]) {
    const value=plain(talentMeta(talent,field));
    if(/variable|varies|GM-defined/i.test(value)) variable=true;
    const amount=/^\d+$/.test(value)?Number(value):numbers(value).find(([resource])=>resource===key)?.[1];
    if(key==='bp' && /^\+/.test(value)) bpGain=Math.abs(amount || 0);
    else if(amount) costs[key]=Math.abs(amount);
  }
  for(let level=1;level<=rank;level++) for(const line of plain(rankEffects(talent.ranks?.[level])).split('\n')) {
    // Conditional hit rewards, failed attacks and examples must never replace
    // the activation's payment. They use explicit options below when supported.
    if(/(?:^|[-\s])(?:If |When |On a |For example)/i.test(line)) continue;
    const spend=line.match(/(?:\bspend\b|\bexpend\b|\bsacrific(?:e|ing)\b)(.*?)(?=\b(?:to restore|and gain|to regain)\b|$)/i);
    const labelled=line.match(/^(?:-\s*)?(?:Mana|Stamina|HP|Mana and Stamina) Cost:\s*(.*)/i);
    if(spend || labelled) for(const [key,amount] of numbers((spend || labelled)[1])) if(amount>=0) costs[key]=amount;
    const change=line.match(/(?:increase|reduce) (?:the |its |your )?(Mana|Stamina|HP) Cost to\s*(\d+)/i);
    if(change) costs[{mana:'mp',stamina:'sp',hp:'hp'}[change[1].toLowerCase()]]=Number(change[2]);
    const gain=line.match(/(?:gain|generates?)\s+(\d+)\s+(?:Blood Points?|BP)/i);
    if(gain) bpGain=Number(gain[1]);
  }
  for(const [key,values] of Object.entries(tables[talent.id] || {})) {if(key==='bpGain')bpGain=values[rank-1];else costs[key]=values[rank-1];}
  let choices=[];
  if(talent.id==='bloodhunter:blood-tithe') choices=['mp','sp'].map(key=>({id:key,label:`Restore ${[15,25,40,60,80][rank-1]} ${key.toUpperCase()}`,costs,restore:{[key]:[15,25,40,60,80][rank-1]}}));
  if(talent.id==='spellblade:arcane-pursuit') choices=[{id:'success',label:'Pursuit succeeds',costs},{id:'failure',label:'Pursuit fails · half MP (rounded down)',costs:{mp:Math.floor(costs.mp/2)}}];
  if(talent.id==='bloodhunter:hardened-soul' && rank===5) choices=[{id:'embrace',label:'Embrace the Darkness · gain 25 BP',costs:{},bpGain:25},{id:'stand-firm',label:'Stand Firm · no BP gain',costs:{},bpGain:0}];
  if(talent.id==='spellblade:mystic-recovery') {
    const paid=[3,2,1,1,1][rank-1], gained=[1,1,1,2,3][rank-1];
    choices=[['hp','mp'],['mp','sp'],['sp','hp']].map(([from,to])=>({id:`${from}-${to}`,label:`${paid} ${from.toUpperCase()} → ${gained} ${to.toUpperCase()}`,costs:{[from]:paid},restore:{[to]:gained}}));
  }
  if(talent.id==='ranger:hunting-shots') for(let level=1;level<=rank;level++) for(const m of (talent.ranks[level] || '').matchAll(/^#### (?:Hunting Shot|Trick Shot)\s*[—–-]\s*([^\n]+)\n([\s\S]*?)(?=^#### |^### |$(?![\s\S]))/gm)) {
    const amount=numbers(m[2]).find(([key])=>key==='sp')?.[1];
    if(Number.isFinite(amount)) choices.push({id:talentKey(m[1]),label:`${m[1]} · ${amount} SP`,costs:{sp:amount}});
  }
  if(choices.length) variable=false;
  const cooldown=String(talentMeta(talent,'cooldown') || 'None'), duration=String(talentMeta(talent,'duration') || 'Instant');
  const roundMatch=text.match(/(?:lasts?(?: for)?|empowered[^\n]*?for|increase the duration to)\s+(\d+)\s+(?:Combat )?(?:Rounds?|Turns?)/i) || plain(duration).match(/(\d+)\s+(?:Combat )?(?:Rounds?|Turns?)/i);
  const minuteMatch=text.match(/(?:lasts?(?: for)?|increase the duration to)\s+(\d+)\s*Min/i) || plain(duration).match(/(\d+)\s*Min/i);
  const cooldownRounds=talent.id==='spellblade:mystic-recovery'?1:Number(text.match(/Cooldown:\s*(\d+)\s+(?:Combat )?(?:Rounds?|Turns?)/i)?.[1] || cooldown.match(/(\d+)\s+(?:Combat )?(?:Rounds?|Turns?)/i)?.[1] || (/once per (?:round|turn)/i.test(cooldown)?1:0));
  const limit=text.match(/(\d+|once|twice)\s*(?:Uses?|times)?\s*per\s*(Short Rest|Long Rest|Combat|Session)/i) || cooldown.match(/(?:(\d+|once|twice)\s*(?:Uses?|times)?\s*(?:per|\/)\s*)?(Short Rest|Long Rest|Session)/i);
  const uses=limit?(Number(limit[1]) || {once:1,twice:2}[limit[1]?.toLowerCase()] || Number(cooldown.match(/\((\d+) Uses?\)/i)?.[1] || 1)):0;
  return {body,effects,defined:rankDefined(talent,rank),passive,costs,bpGain,choices,cooldown,duration,
    activation:!passive || bpGain>0 || Object.values(costs).some(n=>n>0),needsSpell:talent.id==='spellblade:spell-weaving',
    blocked:!rankDefined(talent,rank)?'This rank has not been written yet.':variable || /GM-defined|Depends on/i.test(cooldown) || talent.id==='paladin:sacred-covenant'?'The source requires a variable or GM-defined cost. Resolve it with your GM.':'',
    cooldownRounds,cooldownMs:Number(cooldown.match(/(\d+)\s*Min/i)?.[1] || 0)*60000,durationRounds:Number(roundMatch?.[1] || 0),durationMs:Number(minuteMatch?.[1] || 0)*60000,
    uses,reset:limit?talentKey(limit[2]):'',requiresTrigger:['bloodhunter:hardened-soul','bloodhunter:blood-control'].includes(talent.id),
    selfAC:talent.id==='bloodhunter:blood-shield'?[2,2,3,4,5][rank-1]:talent.id==='cleric:sacred-aegis'?rank+1:0,targetChoice:talent.id==='cleric:sacred-aegis'};
}

export function useLearnedTalent(character,talent,selection={},clock={}) {
  const rank=talentRank(character,talent,clock.catalog || [talent]);
  if(!rank) throw new Error('Learn this talent before using it.');
  const rules=talentRules(talent,rank);
  if(rules.blocked) throw new Error(rules.blocked);
  if(!rules.activation) throw new Error('This passive talent applies automatically.');
  if(rules.requiresTrigger && !selection.triggerConfirmed) throw new Error('Confirm an eligible trigger with your GM.');
  const choice=rules.choices.find(row=>row.id===selection.choice);
  if(rules.choices.length && !choice) throw new Error('Choose a talent option.');
  const costs={...(choice?.costs || rules.costs)}, restored={...choice?.restore},bpGain=choice?.bpGain ?? rules.bpGain;
  if(rules.needsSpell) {
    if(!clock.spellCosts) throw new Error('Choose a known spell to weave.');
    for(const [key,value] of Object.entries(clock.spellCosts)) costs[key]=(costs[key] || 0)+value;
  }
  const now=clock.now || Date.now(), encounter=clock.encounter?.status==='active'?clock.encounter:null,combatId=encounter?(encounter.combatId || 'legacy-combat'):'';
  const previous=character.talentUsage?.[talent.id], scope=rules.reset==='combat'?combatId:rules.reset==='session'?String(clock.sessionId || 'current'):rules.reset;
  if(rules.reset==='combat' && !combatId) throw new Error('Start an encounter before using this talent.');
  const count=previous?.scope===scope?previous.count || 0:0;
  if(rules.uses && count>=rules.uses) throw new Error(`No uses remaining until the next ${rules.reset.replaceAll('-',' ')}.`);
  if(previous?.encounterId && previous.encounterId===combatId && Number(encounter?.round)<previous.readyRound) throw new Error(`Available in round ${previous.readyRound}.`);
  if(!previous?.encounterId && now<Number(previous?.readyAt || 0)) throw new Error('This talent is cooling down.');
  const next=JSON.parse(JSON.stringify(character));
  for(const [key,amount] of Object.entries(costs)) {
    if(!['hp','mp','sp','bp'].includes(key) || !Number.isFinite(amount) || amount<0) throw new Error('Invalid talent cost.');
    if(!amount) continue;
    const pair=key==='bp'?resourcePair(character.bp):strictResourcePair(character[key],key);
    if(pair[0]<amount || key==='hp' && pair[0]-amount<1) throw new Error(`Not enough ${key.toUpperCase()}${key==='hp'?'; sacrifices must leave at least 1 HP':''}.`);
    next[key]=[pair[0]-amount,pair[1]];
  }
  if(bpGain) {
    if(character.bp===undefined) throw new Error('BP is missing from the character sheet.');
    const [current,max]=resourcePair(next.bp);next.bp=[current+bpGain,max];
  }
  for(const [key,amount] of Object.entries(restored)) {
    const [current,max]=strictResourcePair(next[key],key);next[key]=[key==='hp'?clampHpForSoulDamage(next,current+amount):Math.min(max,current+amount),max];
  }
  next.talentUsage={...next.talentUsage,[talent.id]:{count:count+1,scope,reset:rules.reset,encounterId:combatId,readyRound:encounter?Number(encounter.round || 1)+Math.max(rules.cooldownRounds,Math.ceil(rules.cooldownMs/6000)):0,readyAt:now+Math.max(rules.cooldownMs,rules.cooldownRounds*6000),usedAt:now}};
  const durationMs=Math.max(rules.durationMs,rules.durationRounds*6000), sustained=durationMs || !/^(instant|none|n\/a|passive)$/i.test(rules.duration);
  const effect=sustained?{id:talent.id,talentId:talent.id,name:talent.name,rank,description:rules.effects,ac:rules.selfAC,encounterId:combatId,untilRound:encounter && durationMs?Number(encounter.round || 1)+Math.ceil(durationMs/6000):0,expiresAt:!encounter && durationMs?now+durationMs:0,ended:false,expired:false}:null;
  if(effect) next.talentEffects=[...(next.talentEffects || []).filter(row=>row.id!==effect.id),effect];
  return {character:next,costs,bpGain,restored,effect,rank};
}
