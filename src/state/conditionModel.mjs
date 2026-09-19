import { effectRows, effectIsActive, effectTimeMs, validateEffectInput } from './effectsEngine.mjs';

export const CONDITION_TEMPLATES = {
  concussion:{name:'Concussion',description:'Skill checks −3; maximum MP reduced by 20%.',duration:{unit:'days',value:1},effects:[{target:'skills',operation:'SUBTRACT',value:3},{target:'mp.maximum',operation:'MULTIPLY',value:.8}]},
  blindness:{name:'Blindness',description:'Natural vision is unavailable. Resolve vision-dependent actions with the GM.',effects:[{target:'senses.natural-vision',operation:'SET',value:0}]},
  poison:{name:'Poison',description:'Use the poison’s authored mechanical effects and duration.',effects:[]}
};
export function normalizeConditions(character={}) {
  const source=character.conditions || character.statusEffects || [];
  return (Array.isArray(source)?source:effectRows(source)).map((row,index)=>typeof row==='string'?{id:`legacy-condition-${index}`,name:row,effects:[],duration:{unit:'until-removed'}}:{id:`legacy-condition-${index}`,...row});
}
export function activeConditions(character,clock={}) {return normalizeConditions(character).filter(row=>effectIsActive(row,clock));}
export function expireConditions(character,clock={},rest='') {
  return normalizeConditions(character).map(row=>{
    const unit=row.duration?.unit;
    const restExpired=rest && (unit==='short-rest' || rest==='long'&&unit==='long-rest');
    return !effectIsActive(row,clock)||restExpired?{...row,expired:true}:row;
  });
}
export function makeCondition(input,uid,clock={},id='condition') {
  const template=CONDITION_TEMPLATES[input.template] || {},row={...template,...input};
  const name=String(row.name || '').trim().slice(0,100);
  if(!name) throw new Error('Enter a condition name.');
  const duration={unit:'until-removed',...row.duration};
  if(!['rounds','minutes','hours','days','short-rest','long-rest','until-removed','permanent'].includes(duration.unit)) throw new Error('Choose a valid duration.');
  const timed=['rounds','minutes','hours','days'].includes(duration.unit),amount=Number(duration.value || 0);
  if(timed && (!Number.isSafeInteger(amount)||amount<1||amount>100000)) throw new Error('Enter a positive whole duration.');
  if(duration.unit==='rounds' && clock.encounter?.status!=='active') throw new Error('Start an encounter before applying a condition measured in rounds.');
  if(!['refresh','replace','stack','strongest'].includes(row.stacking || 'refresh')) throw new Error('Choose a stacking rule.');
  const now=clock.now ?? Date.now(),stackGroup=String(row.stackGroup || name.toLowerCase()).slice(0,100);
  const effects=effectRows(row.effects);
  if(effects.length>20) throw new Error('A condition supports at most 20 mechanical effects.');
  return {id,name,description:String(row.description || '').slice(0,4000),source:String(row.source || 'GM').slice(0,200),appliedBy:uid,appliedAt:now,active:true,
    duration:timed?{unit:duration.unit,value:amount}:{unit:duration.unit},stacking:row.stacking || 'refresh',stackGroup,allowPlayerRemoval:row.allowPlayerRemoval===true,
    effects:effects.map((effect,index)=>({...validateEffectInput(effect),id:`${id}:effect:${index}`,name,sourceType:'condition',sourceId:id,stacking:row.stacking || 'refresh',stackGroup:`${stackGroup}:${effect.target}`})),
    ...(duration.unit==='rounds'?{encounterId:clock.encounter.combatId || 'legacy-combat',untilRound:Number(clock.encounter.round || 1)+amount}:{}),
    ...(['minutes','hours','days'].includes(duration.unit)?{expiresAt:now+amount*({minutes:60000,hours:3600000,days:86400000}[duration.unit])}:{})};
}
export function applyCondition(character,condition,clock={}) {
  let rows=expireConditions(character,clock);
  const matching=row=>row.stackGroup===condition.stackGroup && effectIsActive(row,clock);
  const existing=rows.find(matching);
  if(condition.stacking==='refresh' && existing) {const id=existing.id;condition={...condition,id,effects:condition.effects.map((effect,index)=>({...effect,id:`${id}:effect:${index}`,sourceId:id}))};rows=rows.filter(row=>row.id!==id);}
  else if(condition.stacking==='replace') rows=rows.map(row=>matching(row)?{...row,expired:true}:row);
  if(rows.filter(row=>effectIsActive(row,clock)).length>=100) throw new Error('Remove an active condition before adding another.');
  return {...character,conditions:[...rows.slice(-199),condition]};
}
export function removeCondition(character,id,{isGM=false,uid,now=Date.now()}={}) {
  const rows=normalizeConditions(character),condition=rows.find(row=>row.id===id);
  if(!condition) throw new Error('Condition not found.');
  if(!isGM && !condition.allowPlayerRemoval) throw new Error('Only the GM can remove this condition.');
  return {...character,conditions:rows.map(row=>row.id===id?{...row,active:false,removedAt:now,removedBy:uid}:row)};
}
export function conditionDurationLabel(condition,clock={}) {
  if(condition.expiresAt) return `${Math.max(0,Math.ceil((effectTimeMs(condition.expiresAt)-(clock.now ?? Date.now()))/60000))} minutes remaining`;
  if(condition.untilRound) return `Until round ${condition.untilRound}`;
  return (condition.duration?.unit || 'until-removed').replaceAll('-',' ');
}
