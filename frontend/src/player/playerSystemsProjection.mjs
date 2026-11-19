import {activeConditions,conditionDurationLabel} from '../../../src/state/conditionModel.mjs';
import {collectCharacterEffects,characterCheck,effectIsActive} from '../../../src/state/effectsEngine.mjs';
import {soulDamageValue,soulHealingCap} from '../../../src/state/specialDamageModel.mjs';
import {ASTERIA_CURRENCIES,currencyDefinitionFor,compactCurrencyKey} from '../../../src/systems/currency/currencyConfig.mjs';

// Project the ORIGINAL character-system results instead of simulating their
// mechanics in the Vite UI. The output is deliberately read-only, bounded and
// free of raw Firestore documents, callbacks or GM-only campaign records.
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value,size=160)=>typeof value==='string'?value.slice(0,size):'';
const finite=value=>Number.isFinite(Number(value))?Number(value):null;
const excluded=new Set(['hp','sp','mp','bp','xp','level','cp','tp','asterium',
  'asteriumshards','arcanite','arcanitecrystals']);

function currencyRows(character){
  const found=new Map(),extra=new Map();
  for(const source of [character.coins,character.coinPouch,character.currency,character.currencies]){
    if(!object(source))continue;
    for(const [key,raw] of Object.entries(source)){
      const value=object(raw)?raw.value??raw.amount??raw.total:raw;
      const amount=finite(value);
      if(amount===null||amount<0||excluded.has(compactCurrencyKey(key)))continue;
      const definition=currencyDefinitionFor(key);
      if(definition){if(!found.has(definition.id))found.set(definition.id,amount);}
      else if(extra.size<12&&!extra.has(key))extra.set(key,amount);
    }
  }
  const directGold=finite(character.gold);
  if(!found.has('gold')&&directGold!==null&&directGold>0)found.set('gold',directGold);
  return Object.freeze([
    ...ASTERIA_CURRENCIES.map(definition=>Object.freeze({
      id:definition.id,label:definition.label,image:'/'+definition.image,
      amount:found.get(definition.id)??0,recorded:found.has(definition.id)
    })),
    ...[...extra].sort(([a],[b])=>a.localeCompare(b)).map(([key,amount])=>
      Object.freeze({id:'extra:'+key,label:text(key.replaceAll('_',' '),80),
        image:'',amount,recorded:true}))
  ]);
}
function conditions(character,clock){
  return Object.freeze(activeConditions(character,clock).slice(0,100).map((row,index)=>
    Object.freeze({
      id:text(row.id,120)||'condition-'+index,
      name:text(row.name,100)||'Condition',
      description:text(row.description,1200),
      source:text(row.source,160),
      duration:text(conditionDurationLabel(row,clock),100),
      allowPlayerRemoval:row.allowPlayerRemoval===true,
      effects:Object.freeze((Array.isArray(row.effects)?row.effects:[]).slice(0,20)
        .map(effect=>Object.freeze({
          target:text(effect.target,100),operation:text(effect.operation,32),
          value:finite(effect.value)??0
        })))
    })));
}
function effects(character,clock){
  return Object.freeze(collectCharacterEffects(character,clock)
    .filter(row=>effectIsActive(row,clock)&&
      (row.value!==0||['SET','ADVANTAGE','DISADVANTAGE'].includes(row.operation))&&
      !(row.operation==='MULTIPLY'&&row.value===1))
    .slice(0,80).map((row,index)=>Object.freeze({
      id:text(row.id,120)||'effect-'+index,
      name:text(row.name,100)||'Effect',
      target:text(row.target,100),operation:text(row.operation,32),
      value:finite(row.value)??0,conditional:row.conditional===true
    })));
}
export function projectPlayerSystems(character={},clock={}){
  const check=characterCheck(character,'skills',0,clock);
  const request=object(character.restState?.request)?character.restState.request:null;
  const status=text(request?.status,30);
  return Object.freeze({
    restSequence:Number.isSafeInteger(Number(character.restState?.sequence))?Math.max(0,Number(character.restState.sequence)):0,
    currencies:currencyRows(character),
    conditionDetails:conditions(character,clock),
    activeEffects:effects(character,clock),
    skillCheck:Object.freeze({
      value:finite(check.value)??0,advantage:check.advantage===true,
      disadvantage:check.disadvantage===true
    }),
    soulDamage:soulDamageValue(character),
    soulHealingCap:soulHealingCap(character),
    restRequest:request&&['pending','approved','denied','cancelled'].includes(status)
      ?Object.freeze({id:text(request.id,120),status,note:text(request.note,400),
        soulRecovery:Math.max(0,finite(request.soulRecovery)??0)})
      :null
  });
}
