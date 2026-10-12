import { characterCheck, effectiveCharacteristicValue, collectCharacterEffects, evaluateEffects } from './effectsEngine.mjs';
import { activeConditions } from './conditionModel.mjs';
import { applyResourceChanges, parseResourceCosts, resourceSnapshot, writeResource } from './resourceEngine.mjs';
import { resourcePair } from './resourceValues.mjs';
import { buildTalentCatalog, ownedTalents, talentMeta } from './talentModel.mjs';
import { talentRules } from './talentMechanics.mjs';
import { characterClasses } from './characterClasses.mjs';
import { skillRankNumber, slug } from './liveWorkspaceModel.mjs';

export const SPELL_RANKS=['Weak','Minor','Greater','Strengthened','Enhanced','Superior','Grand','World'];
export const SPELL_SKILL_ACCESS=['Novice','Apprentice','Journeyman','Adept','Expert','Master','Grandmaster','Grandmaster'];
const copy=value=>JSON.parse(JSON.stringify(value));
export const rows=value=>Array.isArray(value)?value.map(row=>typeof row==='string'?{name:row}:row):Object.entries(value||{}).map(([name,row])=>typeof row==='object'?{name,...row}:{name,rank:row});
export const tierBonus=value=>Math.min(4,Math.max(0,Math.floor(Math.min(100,Number(value)||0)/20)));
export const currentCombatant=encounter=>(encounter?.combatants||[])[Number(encounter?.turnIndex||0)];
export const participantFor=(encounter,characterId)=>(encounter?.combatants||[]).find(row=>row.characterId===characterId);
export const combatActive=(encounter,characterId)=>encounter?.status==='active'&&Boolean(participantFor(encounter,characterId));
export const apState=(encounter,id)=>({ap:0,bonus:false,turns:0,...encounter?.combat?.participants?.[id]});
export const spellAP=rank=>{const index=SPELL_RANKS.findIndex(row=>slug(row)===slug(rank));if(index<0)throw new Error('Spell rank is not recorded.');return index<4?1:index<6?2:3;};
export function combatRestriction(character,clock={}) {
  if(character.downed?.dead) return 'Dead';
  if(character.hp!==undefined&&resourcePair(character.hp)[0]<=0) return 'Downed';
  const condition=activeConditions(character,clock).find(row=>row.preventActions || /^(unconscious|stunned|paralyzed|paralysed)$/i.test(row.name));
  return condition?.name || '';
}
export function initiativeResult(character,die,rollOff=0,clock={}) {
  const agility=Math.min(100,effectiveCharacteristicValue(character,'agility',clock));
  const modifier=evaluateEffects(Number(character.initiativeModifier||0),'initiative',collectCharacterEffects(character,clock),clock).value;
  return {die,agility,modifier,tier:tierBonus(agility),total:die+tierBonus(agility)+modifier,rollOff};
}
export const initiativeOrder=(a,b)=>Number(b.initiative)-Number(a.initiative)||Number(b.initiativeRoll?.agility||0)-Number(a.initiativeRoll?.agility||0)||Number(b.initiativeRoll?.rollOff||0)-Number(a.initiativeRoll?.rollOff||0);
export function rollD20({advantage=false,disadvantage=false}={},random=Math.random) {
  const dice=[1+Math.floor(random()*20)];
  if(Boolean(advantage)!==Boolean(disadvantage)) dice.push(1+Math.floor(random()*20));
  return {dice,die:dice.length===1?dice[0]:advantage?Math.max(...dice):Math.min(...dice)};
}
export function skillCheck(character,skillName,{catalog=[],characteristic,secondaryApproved=false,modifier=0,advantage=false,disadvantage=false,clock={}}={}) {
  const source=catalog.find(row=>row.type?.toLowerCase()==='skill'&&slug(row.title)===slug(skillName));
  const owned=rows(character.skills||character.selectedSkills).find(row=>slug(row.name||row.title)===slug(skillName));
  const primary=source?.metadata?.primaryStat || owned?.primaryStat;
  if(!primary) throw new Error(`Choose the governing characteristic for ${skillName} with the GM.`);
  if(characteristic&&slug(characteristic)!==slug(primary)&&(!secondaryApproved||slug(characteristic)!==slug(source?.metadata?.secondaryStat||owned?.secondaryStat))) throw new Error('A secondary characteristic needs a justified GM approval.');
  const stat=characteristic||primary,progress=character.skillProgress?.[slug(skillName)]||{};
  const rank=skillRankNumber(progress.rank||progress.rankName||owned?.rank||owned?.rankName||1);
  const rankModifier=rank-3; // The existing canonical skill rank table: Novice −2 … Grandmaster +4.
  const tier=tierBonus(effectiveCharacteristicValue(character,stat,clock));
  const check=characterCheck(character,`skills.${slug(skillName)}`,rankModifier+tier+Number(modifier||0),clock);
  const effects=check.effects||[];
  const physical=/^(strength|dexterity|agility|constitution|endurance|str|dex|agi|con|end)$/i.test(stat);
  const exhausted=physical&&character.sp!==undefined&&resourcePair(character.sp)[0]===0;
  const hasAdvantage=advantage||effects.some(row=>row.operation==='ADVANTAGE');
  const hasDisadvantage=disadvantage||exhausted||effects.some(row=>row.operation==='DISADVANTAGE');
  return {skill:skillName,characteristic:stat,rankModifier,tier,modifier:check.value,advantage:hasAdvantage&&!hasDisadvantage,disadvantage:hasDisadvantage&&!hasAdvantage};
}
export function checkResult(roll,dc,{opposed=false}={}) {
  if(!Number.isFinite(Number(dc))) throw new Error('A numeric DC or opposing total is required.');
  return opposed?roll.total>Number(dc):roll.die===1?false:roll.die===20?true:roll.total>=Number(dc);
}
export function attackResult(attack,ac,defence) {
  const hit=attack.die!==1&&(attack.die===20||attack.total>=ac);
  const defended=hit&&Boolean(defence)&&defence.die!==1&&defence.total>attack.total;
  return {hit:hit&&!defended,defended,critical:attack.die===20&&!defended,defenceRequired:hit};
}
export function counterspellResult(incoming,counter,incomingRank,counterRank,elementModifier=0) {
  const a=SPELL_RANKS.indexOf(incomingRank),b=SPELL_RANKS.indexOf(counterRank);
  if(a<0||b<0||a>b+1) throw new Error('Incoming spell exceeds the actual Counterspell rank limit.');
  if(incoming.die===1||counter.die===1) return {incomingSurvives:incoming.die!==1,counterWins:counter.die!==1,incomingFeedback:incoming.die===1,counterFeedback:counter.die===1,reroll:false};
  const counterTotal=counter.total+2*(b-a)+elementModifier;
  if(incoming.die===20&&counter.die!==20)return {incomingSurvives:true,counterWins:false};
  if(counter.die===20&&incoming.die!==20)return {incomingSurvives:false,counterWins:true};
  return {incomingSurvives:incoming.total>counterTotal,counterWins:counterTotal>incoming.total,reroll:incoming.total===counterTotal};
}

export const DEFAULT_COMBAT_ACTIONS=[
  ['command','Quick command',0,{},true],['drop','Drop held item',0],['receive','Receive handed item',0],
  ['attack','Weapon attack',1],['walk','Move',1],['swim','Swim',1],['fly','Fly',1],['climb','Climb',1,{sp:10}],
  ['jump','Meaningful jump within paid movement',0,{sp:10}],['mount-move','Move controlled mount',1],['drag','Drag held target',1,{sp:10}],
  ['grapple','Grapple',1,{sp:10}],['escape','Escape grapple',1,{sp:10}],['shove','Shove / knock prone',1,{sp:10}],['disarm','Disarm',1,{sp:10}],
  ['disengage','Disengage',1],['hide','Hide',1],['first-aid','First aid',1],['stand','Stand from prone',1],
  ['draw','Draw / ready',1],['stow','Stow item / shield',1],['swap','Swap accessible weapons',1],['retrieve','Retrieve from storage',1],['pickup','Pick up item',1],['hand','Hand item',1],
  ['accessory','Change simple accessory',1],['mount','Mount',1],['dismount','Safe dismount',1],
  ['dash','Dash',2],['climb-dash','Climbing dash',2,{sp:20}]
].map(([id,name,ap,costs={},bonus=false])=>({id:`basic:${id}`,key:id,name,kind:'basic',ap,costs,bonus}));
const manoeuvres={grapple:['Grappling','Grappling / Acrobatics'],escape:['Grappling / Acrobatics','Grappling'],shove:['Athletics','Athletics / Acrobatics'],disarm:['Relevant weapon skill / Grappling','Relevant weapon skill / Athletics'],hide:['Stealth','Perception'],drag:['Grappling','Grappling / Acrobatics']};
export const REACTIONS=['dodge','block','parry','opportunity','counterspell','prepared'];
export function spellFields(entry={}) {
  const fields={...entry.metadata,...entry.combat};
  // Parse only explicitly labelled fields in Properties/Description, before Enchantment/Lore.
  const body=String(entry.body||entry.content||'').split(/^#{1,3}\s+(?:Enchantment|Lore|Class Casting Requirements)\b/im)[0];
  const labels={'mana cost':'manaCost','base mp':'manaCost','spell rank':'spellRank','range':'range','target':'target','targets':'target','area of effect':'area','saving throw / check':'check','healing':'healing','damage':'damage','casting time':'castingTime','duration':'duration','action points':'apCost','ap cost':'apCost'};
  for(const match of body.matchAll(/^\s*(?:-\s*)?\*\*([^*]+):\*\*\s*(.+)$/gm)) {const key=labels[match[1].trim().toLowerCase()];if(key&&fields[key]===undefined)fields[key]=match[2].trim();}
  return fields;
}
const sourceFor=(catalog,type,record)=>catalog.find(entry=>entry.type?.toLowerCase()===type&&(entry.id===record.id||entry.slug===record.slug||slug(entry.title)===slug(record.name||record.title)));
export function combatOptions(character,catalog=[]) {
  const result=DEFAULT_COMBAT_ACTIONS.map(row=>({...row,checks:manoeuvres[row.key]?.join(' vs ')||'None / GM-defined task'}));
  const talents=ownedTalents(character,buildTalentCatalog(character,catalog));
  for(const talent of talents) {
    const rules=talentRules(talent,talent.rank);
    if(!rules.activation) continue;
    const choices=rules.choices.length?rules.choices:[null];
    for(const choice of choices) {
      const explicit=talentMeta(talent,'apCost')??talentMeta(talent,'actionPoints');
      const bonus=/bonus action/i.test(String(talentMeta(talent,'actionType')||''));
      const reaction=/reaction/i.test(String(talentMeta(talent,'actionType')||talent.type||''));
      const ap=explicit!==undefined?Number(explicit):bonus?0:/ultimate/i.test(String(talent.type))?3:2;
      result.push({id:`talent:${talent.id}${choice?`:${choice.id}`:''}`,kind:'talent',sourceId:talent.id,name:`${talent.name} · Rank ${talent.rank}${choice?` · ${choice.label}`:''}`,rank:talent.rank,ap,bonus,reaction,costs:choice?.costs||rules.costs,choice:choice?.id||'',blocked:rules.blocked,description:choice?.description||rules.effects,talent,rules});
    }
  }
  for(const owned of rows(character.spells||character.activeSpells||character.knownSpells)) {
    const source=sourceFor(catalog,'spell',owned),fields=spellFields(source||owned),rank=owned.rank||fields.spellRank||fields.rank;
    let costs={},blocked='',ap=1;try{costs=parseResourceCosts(fields.manaCost??owned.costs??owned.resourceCosts??owned.cost??owned.manaCost,'mp',true);if(fields.manaCost===undefined&&owned.costs===undefined&&owned.cost===undefined&&owned.manaCost===undefined)throw new Error('Printed Base MP is missing.');ap=fields.apCost===undefined?spellAP(rank):Number(fields.apCost);}catch(error){blocked=error.message;}
    result.push({id:`spell:${owned.id||owned.slug||slug(owned.name||owned.title)}:${slug(rank)}`,kind:'spell',sourceId:owned.id||owned.slug||slug(owned.name||owned.title),name:owned.name||owned.title,rank,element:owned.element||fields.magicalElement||fields.element,ap,costs,baseMP:costs.mp||0,description:source?.summary||owned.summary||'',fields,owned,blocked,reaction:fields.reaction===true||fields.spellType==='Counterspell'});
  }
  for(const skill of rows(character.skills||character.selectedSkills)) {
    const source=sourceFor(catalog,'skill',skill);
    result.push({id:`skill:${slug(skill.name||skill.title)}`,kind:'skill',name:skill.name||skill.title,ap:1,costs:{},fields:source?.metadata||{},description:source?.summary||''});
    // Techniques are owned records, not invented from a heading or a skill's name.
    for(const technique of rows(skill.techniques).filter(row=>row.learned!==false)) result.push({id:`technique:${slug(skill.name)}:${technique.id||slug(technique.name)}`,kind:'technique',name:technique.name,ap:Number(technique.apCost??2),costs:parseResourceCosts(technique.resourceCosts||{}),fields:technique,description:technique.description||'',reaction:technique.reaction===true,bonus:technique.bonusAction===true,blocked:technique.defined===false?'Technique rules are not defined.':''});
  }
  for(const item of rows(character.inventory).filter(row=>Number(row.qty??row.quantity??1)>0)) {
    const type=String(item.type||item.itemType||item.category||''),scroll=/scroll/i.test(type),potion=/potion/i.test(type);
    if(!scroll&&!potion&&!item.effect&&!item.effects&&!item.activationCost&&!item.enchantments)continue;
    const bonus=potion&&item.accessible===true&&item.location==='potion-belt'||item.bonusAction===true;
    let ap=Number(item.apCost??(bonus?0:1)),blocked='';
    if(scroll){try{ap=spellAP(item.spell?.rank);}catch(error){blocked=error.message;}}
    result.push({id:`item:${item.id}`,kind:scroll?'scroll':'item',itemId:item.id,name:item.name,ap,bonus,costs:scroll?{}:parseResourceCosts(item.activationCost||{}),item,rank:item.spell?.rank,baseMP:0,blocked,description:item.description||'',fields:item.spell||item});
  }
  return result;
}
export function optionProblem(option,character,encounter,actorId,{reaction=false}={}) {
  if(option.blocked)return option.blocked;
  const restriction=combatRestriction(character,{encounter});if(restriction)return restriction;
  if(encounter?.status!=='active')return 'Combat is not active.';
  if(!reaction&&currentCombatant(encounter)?.id!==actorId)return 'Wait for your turn.';
  if(reaction&&!encounter.combat?.pending?.reactionWindow)return 'No eligible reaction window.';
  const state=apState(encounter,actorId);
  if(option.key==='stand'&&!activeConditions(character,{encounter}).some(row=>/prone/i.test(row.name)))return 'Not prone.';
  if(option.key==='escape'&&!state.grappledBy)return 'Not grappled.';
  if(option.key==='drag'&&!state.grappleTarget)return 'No established hold.';
  if(option.key==='jump'&&!state.movement)return 'Pay for movement first.';
  if(option.key==='attack'&&!wieldedItems(character).length)return 'No intact wielded weapon.';
  if(option.ap>state.ap)return 'Not enough held AP.';
  if(option.bonus&&!state.bonus)return 'Bonus action already used.';
  if(state.pendingDeathSave)return 'Resolve the turn-start death save.';
  try{applyResourceChanges(character,{costs:option.costs});}catch(error){return error.message;}
  return '';
}
export function wieldedItems(character) {
  const map=new Map();
  for(const item of [...rows(character.inventory).filter(row=>row.equipped),...Object.values(character.equipment||{})]) if(item&&typeof item==='object'&&!item.destroyed&&!(item.durability!==undefined&&resourcePair(item.durability)[0]<=0))map.set(item.id,item);
  return [...map.values()];
}
export function validateReactionEquipment(character,key) {
  const items=wieldedItems(character);
  if(key==='block') {
    if(!characterClasses(character).some(name=>['warrior','fighter','guardian','barbarian','warden','paladin'].includes(slug(name))))throw new Error('This class cannot actively block with a shield.');
    if(!items.some(row=>/shield/i.test(row.type||row.name||'')))throw new Error('Block requires a wielded, intact shield.');
  }
  if(['parry','opportunity'].includes(key)&&!items.some(row=>/weapon|sword|axe|spear|mace|dagger|hammer|staff/i.test(row.type||row.name||'')))throw new Error('A suitable intact wielded weapon is required.');
}
export function payCombatCosts(character,costs,approvedHP=false) {
  const paid={...costs};let hp=0;
  for(const key of ['sp','mp'])if(paid[key]){const available=resourceSnapshot(character,key).current;if(paid[key]>available){if(!approvedHP)throw new Error(`Not enough ${key.toUpperCase()}.`);hp+=2*(paid[key]-available);paid[key]=available;}}
  if(hp)paid.hp=(paid.hp||0)+hp;
  return {character:applyResourceChanges(character,{costs:paid}),paid};
}
export function mixedDamage(components,defences={}) {
  return Math.max(0,Math.floor(components.reduce((total,{type,amount})=>{
    if(!Number.isFinite(Number(amount))||amount<0)throw new Error('Damage must be nonnegative.');
    if((defences.immunities||[]).includes(type))return total;
    const resistance=Math.max(0,...(defences.resistances||[]).filter(row=>row.type===type).map(row=>Math.min(1,Number(row.fraction)||0)));
    return total+amount*(1-resistance)*((defences.vulnerabilities||[]).includes(type)?1.5:1);
  },0)));
}
export function changeCombatHP(character,amount,{damage=false,nonlethal=false,now=Date.now()}={}) {
  let next=copy(character);const [before,maximum]=resourcePair(next.hp);
  if(!damage&&amount>0&&character.downed?.dead)throw new Error('Ordinary healing cannot resurrect a dead character.');
  if(damage&&amount>0&&before<=0){next.downed={successes:0,failures:0,...next.downed};next.downed.failures++;next.downed.dead=next.downed.failures>=3;return next;}
  next=applyResourceChanges(next,damage?{delta:{hp:-amount}}:{restore:{hp:amount}});
  if(nonlethal&&damage&&before>0&&resourcePair(next.hp)[0]===0){writeResource(next,'hp',1,maximum);next.conditions=[...(next.conditions||[]),{id:'combat-nonlethal',name:'Unconscious',source:'Nonlethal attack',active:true,expiresAt:now+600000,effects:[]}];}
  if(resourcePair(next.hp)[0]<=0){if(before>0||!next.downed)next.downed={successes:0,failures:0,dead:false};next.activeEffects=rows(next.activeEffects).map(effect=>effect.concentration&&!effect.downedExempt?{...effect,ended:true}:effect);next.talentEffects=rows(next.talentEffects).map(effect=>effect.concentration&&!effect.downedExempt?{...effect,ended:true}:effect);}
  else {delete next.downed;if(!damage&&resourcePair(next.hp)[0]>before)next.conditions=rows(next.conditions).map(row=>row.id==='combat-nonlethal'?{...row,active:false}:row);}
  return next;
}
export function deathSave(character,die,{firstAid=false}={}) {
  if(resourcePair(character.hp)[0]>0||character.downed?.dead)throw new Error('The target is not eligible for a death save.');
  let next=copy(character);next.downed={successes:0,failures:0,...next.downed};
  if(!firstAid&&die===20)return changeCombatHP(next,1);
  if(firstAid||die>=10)next.downed.successes++;else next.downed.failures+=die===1?2:1;
  if(next.downed.successes>=3)return changeCombatHP(next,1);
  next.downed.dead=next.downed.failures>=3;return next;
}
export function feedback(character,rank,turns=0,now=Date.now()) {
  const index=SPELL_RANKS.indexOf(rank);if(index<0)throw new Error('A recorded spell rank is required for Feedback.');
  const start=[1,2,3,4,5,5,6,6][index],existing=rows(character.conditions).find(row=>row.id==='combat-feedback'&&row.active!==false&&!row.expired);
  const resulting=Math.min(6,Math.max(start,existing?Number(existing.rank)+1:0));
  let next=changeCombatHP(character,mixedDamage([{type:'psychic',amount:20*resulting}],character.damageDefences),{damage:true,now});
  next.conditions=rows(next.conditions).filter(row=>!['combat-feedback','combat-feedback-stun'].includes(row.id));
  next.conditions.push({id:'combat-feedback',name:'Spell Feedback',rank:resulting,source:`${rank} spell`,active:true,throughOwnTurn:turns+(resulting<=3?2:3),boundary:'end',effects:['focus','willpower'].map(skill=>({target:`skills.${skill}`,operation:'DISADVANTAGE'}))},{id:'combat-feedback-stun',name:'Stunned',source:'Spell Feedback',active:true,throughOwnTurn:turns+1,boundary:'end',effects:[]});
  return next;
}
