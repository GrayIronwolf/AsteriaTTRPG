// Universal Check Requests: frozen, auditable modifiers for the approved eight-rank system.
// Does not reinterpret the older seven-rank numeric progression used by combat.
import {CHARACTERISTIC_ALIASES,baseCharacteristicValue,effectiveCharacteristicValue,characterCheck} from './effectsEngine.mjs';

export const UNIVERSAL_CHECK_RANKS=Object.freeze({
  Untrained:-2,Novice:-1,Apprentice:0,Journeyman:1,
  Adept:2,Expert:3,Master:4,Grandmaster:5
});
export const UNIVERSAL_CHECK_TYPES=Object.freeze(['skill','characteristic','social','saving','opposed','crafting','group']);
export const UNIVERSAL_CHARACTERISTICS=Object.freeze(Object.keys(CHARACTERISTIC_ALIASES));
const slug=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const approvedRank=rank=>Object.keys(UNIVERSAL_CHECK_RANKS).find(key=>key.toLowerCase()===String(rank??'').trim().toLowerCase());

export function universalSkillRankModifier(rank){
  const key=approvedRank(rank);
  if(!key)throw new Error('A named approved skill rank is required; legacy numeric ranks need conversion.');
  return UNIVERSAL_CHECK_RANKS[key];
}
export function universalSkillProgress(character={},skill=''){
  const key=slug(skill);
  const matches=row=>slug(row?.name||row?.title||row?.skill||row?.id)===key;
  let owned=null;
  for(const source of [character.skills,character.selectedSkills]){
    if(Array.isArray(source)){owned=source.find(matches);if(owned)break;}
    else if(source&&typeof source==='object'){
      const entry=Object.entries(source).find(([name,value])=>slug(name)===key||matches(value));
      if(entry){owned=typeof entry[1]==='object'?entry[1]:{rank:entry[1]};break;}
    }
  }
  const progress=Object.entries(character.skillProgress||{}).find(([name])=>slug(name)===key)?.[1]||{};
  const choices=[progress?.rankName,owned?.rankName,progress?.rank,owned?.rank];
  const named=choices.find(value=>approvedRank(value));
  const legacy=choices.some(value=>value!==undefined&&value!==null&&value!==''&&!approvedRank(value));
  return {rank:named?approvedRank(named):null,legacy,owned:owned||{},progress};
}
export function universalCharacteristicName(input){
  const normalized=String(input??'').trim().toLowerCase();
  return UNIVERSAL_CHARACTERISTICS.find(name=>CHARACTERISTIC_ALIASES[name].includes(normalized))||'';
}
export function universalCharacteristicTier(score){
  if(!Number.isFinite(score)||score<0)throw new Error('Invalid characteristic score.');
  return Math.min(5,Math.max(0,Math.floor(score/20)));
}
export function universalCheckModifierBreakdown(parts=[]){
  if(!Array.isArray(parts)||parts.length>30)throw new Error('Invalid modifier breakdown.');
  const entries=parts.map(row=>{
    const value=row?.value,label=String(row?.label??'').trim();
    if(!Number.isSafeInteger(value)||Math.abs(value)>100||!label||label.length>120)
      throw new Error('Invalid modifier entry.');
    return {label,value};
  });
  const total=entries.reduce((sum,row)=>sum+row.value,0);
  if(Math.abs(total)>500)throw new Error('Total modifier out of range.');
  return {entries,total};
}
export function universalAutomaticModifiers(character,{type='skill',skill='',characteristic='',rankOverride='',modifiers=[],advantage=false,disadvantage=false}={},clock={}){
  if(!UNIVERSAL_CHECK_TYPES.includes(type))throw new Error('Invalid check type.');
  const skillName=String(skill||'').trim().slice(0,100);
  const record=universalSkillProgress(character,skillName);
  const requested=characteristic||record.owned.primaryStat||record.owned.characteristic||record.owned.stat||record.progress.primaryStat;
  const stat=universalCharacteristicName(requested);
  if(requested&&!stat)throw new Error('Unknown governing characteristic.');
  if(!stat)throw new Error('Choose a governing characteristic.');
  if(!skillName&&['skill','social','crafting','group','opposed'].includes(type))throw new Error('Choose a skill or check name.');
  const entries=[];
  const effective=effectiveCharacteristicValue(character,stat,clock);
  const base=baseCharacteristicValue(character,stat);
  const tier=universalCharacteristicTier(effective);
  entries.push({label:'Characteristic ('+stat+', tier '+tier+')',value:tier});
  if(skillName&&type!=='characteristic'&&type!=='saving'){
    const rank=rankOverride?approvedRank(rankOverride):record.rank;
    if(rankOverride&&!rank)throw new Error('Invalid approved skill rank override.');
    if(!rank&&record.legacy)throw new Error('This skill has a legacy numeric rank. GM must select its approved rank.');
    const selected=rank||'Untrained';
    entries.push({label:'Skill rank ('+selected+')',value:universalSkillRankModifier(selected)});
  }
  const effect=characterCheck(character,skillName?'skills.'+slug(skillName):'checks',0,clock);
  const numeric=effect.effects.filter(row=>['ADD','SUBTRACT'].includes(row.operation));
  const complex=effect.effects.some(row=>['SET','MULTIPLY','MIN','MAX'].includes(row.operation));
  if(complex){
    if(effect.value)entries.push({label:'Active equipment, talent and condition effects',value:effect.value});
  }else{
    for(const row of numeric){
      const value=row.operation==='SUBTRACT'?-row.value:row.value;
      if(value)entries.push({label:(row.sourceType||'Effect')+': '+(row.name||row.id||'Modifier'),value});
    }
  }
  const situational=universalCheckModifierBreakdown(modifiers).entries;
  for(const row of situational)if(row.value)entries.push({label:'GM: '+row.label,value:row.value});
  // Two sources of opposite advantage cancel, including GM/condition conflicts.
  const sourceAdvantage=effect.effects.some(row=>row.operation==='ADVANTAGE');
  const sourceDisadvantage=effect.effects.some(row=>row.operation==='DISADVANTAGE');
  const physical=['strength','dexterity','agility','constitution','endurance'].includes(stat);
  const sp=Array.isArray(character.sp)?Number(character.sp[0]):Number(character.sp?.current??NaN);
  const exhausted=physical&&sp===0;
  const hasAdvantage=Boolean(advantage)||sourceAdvantage;
  const hasDisadvantage=Boolean(disadvantage)||sourceDisadvantage||exhausted;
  const breakdown=universalCheckModifierBreakdown(entries);
  return {...breakdown,skill:skillName,characteristic:stat,baseCharacteristic:base,effectiveCharacteristic:effective,
    advantage:hasAdvantage&&!hasDisadvantage,disadvantage:hasDisadvantage&&!hasAdvantage,
    advantageSources:effect.effects.filter(row=>['ADVANTAGE','DISADVANTAGE'].includes(row.operation)).map(row=>({
      label:(row.sourceType||'Effect')+': '+(row.name||'Check effect'),operation:row.operation
    })).concat(advantage?[{label:'GM choice',operation:'ADVANTAGE'}]:[],disadvantage?[{label:'GM choice',operation:'DISADVANTAGE'}]:[],
      exhausted?[{label:'Exhausted (0 SP)',operation:'DISADVANTAGE'}]:[])};
}
export function universalDiceChoice(first,second,advantage=false,disadvantage=false){
  if(!Number.isInteger(first)||first<1||first>20)throw new Error('Enter a valid first d20 result.');
  const double=Boolean(advantage)!==Boolean(disadvantage);
  if(double&&(!Number.isInteger(second)||second<1||second>20))throw new Error('Both d20 results are required.');
  const die=!double?first:advantage?Math.max(first,second):Math.min(first,second);
  return {first,second:double?second:null,die};
}
export function universalCheckOutcome(die,modifier,dc,{opposed=false}={}){
  if(!Number.isInteger(die)||die<1||die>20)throw new Error('A d20 result from 1 to 20 is required.');
  if(!Number.isFinite(modifier)||(!opposed&&!Number.isFinite(dc))||Math.abs(modifier)>500||(!opposed&&Math.abs(dc)>1000))
    throw new Error('Invalid check modifier or DC.');
  const total=die+modifier;
  const success=opposed?null:die===1?false:die===20?true:total>=dc;
  return {die,modifier,dc:opposed?null:dc,total,success,
    outcome:opposed?'awaiting-opponent':die===1?'critical-failure':die===20?'critical-success':success?'success':'failure'};
}
export function universalGroupAdjudication(type,rows,requiredSuccesses=0){
  if(!['group','opposed'].includes(type)||!Array.isArray(rows)||rows.length<2||rows.length>10||
    rows.some(row=>!row?.result))throw new Error('All participants must submit before adjudication.');
  if(type==='group'){
    const required=requiredSuccesses||Math.ceil(rows.length/2);
    if(!Number.isInteger(required)||required<1||required>rows.length)throw new Error('Invalid group success threshold.');
    const successes=rows.filter(row=>row.result.success===true).length;
    return {status:'resolved',outcome:successes>=required?'success':'failure',successes,required,participants:rows.length};
  }
  if(rows.length!==2||rows.some(row=>!Number.isFinite(row.result.total)))throw new Error('Opposed checks require two numeric rolls.');
  const [a,b]=rows;
  let winnerId=null;
  if(a.result.die===20&&b.result.die!==20)winnerId=a.id;
  else if(b.result.die===20&&a.result.die!==20)winnerId=b.id;
  else if(a.result.die===1&&b.result.die!==1)winnerId=b.id;
  else if(b.result.die===1&&a.result.die!==1)winnerId=a.id;
  else if(a.result.total!==b.result.total)winnerId=a.result.total>b.result.total?a.id:b.id;
  return {status:'resolved',outcome:winnerId?'winner':'tie',winnerId,participants:2,
    tie:!winnerId};
}
