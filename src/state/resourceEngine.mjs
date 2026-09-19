import { resourcePair, strictResourcePair, soulDamageValue } from './resourceValues.mjs';
import { collectCharacterEffects, evaluateEffects, baseCharacteristicValue, effectiveCharacteristicValue } from './effectsEngine.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const builtins={
  hp:{name:'HP',recovery:{long:{mode:'fraction',value:.5}}},
  sp:{name:'SP',recovery:{short:{mode:'fraction',value:.35},long:{mode:'full'}}},
  mp:{name:'MP',recovery:{long:{mode:'fraction',value:.5}}},
  bp:{name:'Blood Points',allowOverflow:true,recovery:{short:{mode:'reduce-fraction',value:.25},long:{mode:'set',value:0}}},
  zp:{name:'Zeal Points',recovery:{short:{mode:'set',value:0},long:{mode:'set',value:0}},reset:{'combat-start':0,'combat-end':0,unconscious:0}}
};
export function resourceId(value) {
  const key=String(value || '').trim().toLowerCase().replace(/\s+/g,'-');
  return ({health:'hp',stamina:'sp',mana:'mp','health-points':'hp','stamina-points':'sp','mana-points':'mp','blood-point':'bp','blood-points':'bp','zeal-point':'zp','zeal-points':'zp'})[key] || key;
}
export function resourceDefinitions(character={}) {
  const ids=new Set([...Object.keys(builtins).filter(id=>character[id]!==undefined),...Object.keys(character.resources || {}),...Object.keys(character.resourceDefinitions || {})]);
  return [...ids].filter(id=>/^[a-z][a-z0-9-]{0,39}$/.test(id) && !['constructor','prototype','__proto__'].includes(id)).map(id=>({minimum:0,allowOverflow:false,...builtins[id],...character.resourceDefinitions?.[id],id,name:character.resourceDefinitions?.[id]?.name || builtins[id]?.name || id}));
}
export const storedResource=(character,id)=>Object.hasOwn(builtins,id)?character[id]:character.resources?.[id];
export function writeResource(character,id,current,maximum) {
  const original=storedResource(character,id);
  const next=original && !Array.isArray(original) && typeof original==='object'?{...original,current,maximum,...(Object.hasOwn(original,'value')?{value:current}:{}),...(Object.hasOwn(original,'max')?{max:maximum}:{})}:[current,maximum];
  if(Object.hasOwn(builtins,id)) character[id]=next;
  else character.resources={...character.resources,[id]:next};
  return character;
}
export function resourceSnapshot(character,id) {
  id=resourceId(id);
  const definition=resourceDefinitions(character).find(row=>row.id===id);
  if(!definition) throw new Error(`Unknown resource: ${id}.`);
  const [current,maximum]=strictResourcePair(storedResource(character,id),id);
  const minimum=finite(definition.minimum),cap=id==='hp'?Math.max(minimum,maximum-soulDamageValue(character)):maximum;
  return {...definition,current,maximum,minimum,cap};
}
export function reconcileResources(character={},clock={}) {
  const next=clone(character),state={...next.resourceState},effects=collectCharacterEffects(next,clock),now=clock.now ?? Date.now();
  const combat=clock.encounter?.status==='active'?(clock.encounter.combatId || 'legacy-combat'):'';
  for(const definition of resourceDefinitions(next)) {
    const {id}=definition,stored=storedResource(next,id);
    if(stored===undefined) continue;
    let pair;try{pair=strictResourcePair(stored,id);}catch{continue;}
    const [current,oldMaximum]=pair,previous=state[id] || next.talentResourceState?.[id];
    const baseMaximum=Math.max(0,previous?finite(previous.baseMaximum)+oldMaximum-finite(previous.maximum):oldMaximum);
    const characteristic={hp:'constitution',sp:'endurance',mp:'wisdom'}[id];
    const characteristicDelta=characteristic?(effectiveCharacteristicValue(next,characteristic,clock)-baseCharacteristicValue(next,characteristic))*10:0;
    const minimum=finite(definition.minimum);
    const maximum=Math.max(minimum,Math.floor(evaluateEffects(baseMaximum+characteristicDelta,`${id}.maximum`,effects,clock).value));
    let value=current;
    const marker={...previous,baseMaximum,maximum};
    if(clock.encounter && previous?.combatId!==combat) {
      const reset=definition.reset?.[combat?'combat-start':'combat-end'];
      if(reset!==undefined) value=Number(reset);
      marker.combatId=combat;
      marker.recoveryAt=now;
    }
    const unconscious=resourcePair(next.hp)[0]<=0;
    if(definition.reset?.unconscious!==undefined && unconscious) value=Number(definition.reset.unconscious);
    const regen=definition.regeneration;
    if(regen?.intervalMs>0 && regen.amount>0) {
      const last=finite(marker.recoveryAt,now),steps=Math.max(0,Math.floor((now-last)/regen.intervalMs));
      if(!combat || regen.inCombat) {
        if(steps) {value+=steps*evaluateEffects(regen.amount,`${id}.regeneration`,effects,clock).value;marker.recoveryAt=last+steps*regen.intervalMs;}
        else marker.recoveryAt=last;
      } else if(steps || !marker.recoveryAt) marker.recoveryAt=now;
    }
    const cap=id==='hp'?Math.max(minimum,maximum-soulDamageValue({...next,hp:[value,maximum]})):maximum;
    value=Math.max(minimum,definition.allowOverflow?value:Math.min(cap,value));
    writeResource(next,id,value,maximum);state[id]=marker;
  }
  next.resourceState=state;
  return next;
}
export function parseResourceCosts(input,fallback='mp',strict=false) {
  const result={};
  const add=(key,value)=>{const id=resourceId(key),amount=Number(value);if(!Number.isFinite(amount)||amount<0||amount>1e9)throw new Error('Invalid resource cost.');if(amount)result[id]=(result[id] || 0)+amount;};
  if(input && typeof input==='object') {
    if(Array.isArray(input)) input.forEach(row=>add(row.resource || row.id,row.amount ?? row.value));
    else if(input.resource) add(input.resource,input.amount ?? input.value);
    else Object.entries(input).forEach(([key,value])=>add(key,value));
    return result;
  }
  const text=String(input ?? '').trim();
  if(!text || /^(none|free|passive|n\/a)$/i.test(text)) return result;
  if(Number.isFinite(Number(text))) {add(fallback,Number(text));return result;}
  const pattern=/(\d+(?:\.\d+)?)\s*(HP|SP|MP|BP|ZP|Health(?: Points?)?|Stamina(?: Points?)?|Mana(?: Points?)?|Blood Points?|Zeal Points?)\b/gi;
  for(const match of text.matchAll(pattern)) add(match[2],match[1]);
  if(strict && (!Object.keys(result).length || text.replace(pattern,'').replace(/[\s,+/&]/g,''))) throw new Error('This resource cost needs a structured rule from the GM.');
  return result;
}
export function applyResourceChanges(character,{costs={},restore={},delta={},keepAlive=false}={}) {
  const next=clone(character),normalizedCosts=parseResourceCosts(costs,'mp',true),normalizedRestore=parseResourceCosts(restore,'mp',true);
  const ids=new Set([...Object.keys(normalizedCosts),...Object.keys(normalizedRestore),...Object.keys(delta).map(resourceId)]);
  const changes=[];
  for(const id of ids) {
    const state=resourceSnapshot(next,id),cost=normalizedCosts[id] || 0;
    const floor=keepAlive&&id==='hp'?Math.max(1,state.minimum):state.minimum;
    if(state.current-cost<floor) throw new Error(`Not enough ${state.name}${keepAlive&&id==='hp'?'; sacrifices must leave at least 1 HP':''}.`);
    const adjustment=Number(delta[id] || 0);
    if(!Number.isFinite(adjustment)) throw new Error('Invalid resource change.');
    const requested=state.current-cost+(normalizedRestore[id] || 0)+adjustment;
    changes.push([id,Math.max(state.minimum,state.allowOverflow?requested:Math.min(state.cap,requested)),state.maximum]);
  }
  changes.forEach(([id,current,maximum])=>writeResource(next,id,current,maximum));
  return next;
}
export function recoverRestResources(character,type) {
  if(!['short','long'].includes(type)) throw new Error('Unsupported rest type.');
  const next=clone(character),bonus=1+Math.max(0,Math.min(.5,finite(character.talentRestBonus)));
  for(const definition of resourceDefinitions(next)) {
    const rule=definition.recovery?.[type];
    if(!rule || storedResource(next,definition.id)===undefined) continue;
    const state=resourceSnapshot(next,definition.id);let value=state.current;
    if(rule.mode==='full') value=state.maximum;
    else if(rule.mode==='set') value=finite(rule.value);
    else if(rule.mode==='amount') value+=finite(rule.value);
    else if(rule.mode==='fraction') value+=Math.ceil(state.maximum*finite(rule.value)*bonus);
    else if(rule.mode==='reduce-fraction') value-=Math.ceil(state.current*finite(rule.value));
    writeResource(next,definition.id,Math.max(state.minimum,state.allowOverflow?value:Math.min(state.cap,value)),state.maximum);
  }
  return next;
}
export function validateResourceDefinition(input={}) {
  const id=resourceId(input.id);
  if(!/^[a-z][a-z0-9-]{0,39}$/.test(id) || ['constructor','prototype','__proto__'].includes(id)) throw new Error('Choose a valid resource ID.');
  const minimum=Number(input.minimum ?? 0),maximum=Number(input.maximum);
  if(!Number.isFinite(minimum)||minimum<0||!Number.isFinite(maximum)||maximum<minimum||maximum>1e9) throw new Error('Resource maximum must be at least its nonnegative minimum.');
  const recovery={};
  for(const type of ['short','long']) if(input.recovery?.[type]) {
    const rule=input.recovery[type],value=Number(rule.value ?? 0);
    if(!['full','set','amount','fraction','reduce-fraction','none'].includes(rule.mode)||!Number.isFinite(value)||value<0||value>1e9 || ['fraction','reduce-fraction'].includes(rule.mode)&&value>1 || rule.mode==='set'&&(value<minimum||value>maximum)) throw new Error('Invalid rest recovery rule.');
    recovery[type]={mode:rule.mode,value};
  }
  const reset={};
  for(const [key,value] of Object.entries(input.reset || {})) {
    if(!['combat-start','combat-end','unconscious'].includes(key)||!Number.isFinite(Number(value))||value<minimum||value>maximum) throw new Error('Invalid resource reset rule.');
    reset[key]=Number(value);
  }
  let regeneration=null;
  if(input.regeneration) {
    const amount=Number(input.regeneration.amount),intervalMs=Number(input.regeneration.intervalMs);
    if(!Number.isFinite(amount)||amount<0||amount>1e9||!Number.isFinite(intervalMs)||intervalMs<1000) throw new Error('Invalid regeneration rule.');
    regeneration={amount,intervalMs,inCombat:input.regeneration.inCombat===true};
  }
  return {id,name:String(input.name || builtins[id]?.name || id).trim().slice(0,80),minimum,maximum,allowOverflow:input.allowOverflow===true,recovery,reset,regeneration};
}
