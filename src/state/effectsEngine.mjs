// Pure shared mechanics. Authored prose is never evaluated as executable rules.
export const CHARACTERISTIC_ALIASES = {
  strength:['strength','str'], dexterity:['dexterity','dex'], agility:['agility','agi'],
  constitution:['constitution','con'], endurance:['endurance','end'], intelligence:['intelligence','int'],
  wisdom:['wisdom','wis'], charisma:['charisma','cha'], luck:['luck','lck']
};
const operations = new Set(['ADD','SUBTRACT','MULTIPLY','SET','MIN','MAX','ADVANTAGE','DISADVANTAGE']);
const finite = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export function effectRows(value) {
  if(Array.isArray(value)) return value;
  if(!value || typeof value !== 'object') return [];
  return value.target || value.type?.startsWith('AC_MODIFIER') ? [value] : Object.entries(value).map(([name,row])=>typeof row==='object' && row ? {name,...row} : {name:typeof row==='string'?row:name});
}
export function effectTimeMs(value) {
  if(typeof value?.toMillis==='function') return value.toMillis();
  if(value?.seconds!==undefined) return finite(value.seconds)*1000+finite(value.nanoseconds)/1e6;
  if(typeof value==='number') return value;
  return value ? new Date(value).getTime() || 0 : 0;
}
export function effectIsActive(effect={}, clock={}) {
  if(effect.active===false || effect.ended || effect.expired || effect.removedAt) return false;
  if(effect.expiresAt && effectTimeMs(effect.expiresAt)<=(clock.now ?? Date.now())) return false;
  if(effect.encounterId && clock.encounter) {
    if(clock.encounter.status!=='active' || (clock.encounter.combatId || 'legacy-combat')!==effect.encounterId) return false;
    if(effect.untilRound && Number(clock.encounter.round)>=effect.untilRound) return false;
  }
  return true;
}
export function normalizeTarget(value) {
  const key=String(value || '').trim().toLowerCase().replace(/\s+/g,'-');
  for(const [name,aliases] of Object.entries(CHARACTERISTIC_ALIASES)) if(aliases.includes(key) || aliases.some(alias=>key===`characteristics.${alias}`)) return `characteristics.${name}`;
  const resource=key.match(/^(?:resources\.)?(hp|sp|mp|bp|zp)(?:[.-](?:max|maximum))?$/);
  if(resource) return `${resource[1]}.maximum`;
  return key.replace(/^resources\./,'').replace(/\.max$/,'.maximum');
}
export function normalizeEffect(effect, defaults={}) {
  if(!effect || typeof effect!=='object') return null;
  const type=String(effect.type || effect.effectType || '').toUpperCase();
  const target=normalizeTarget(effect.target || (type.startsWith('AC_MODIFIER')?'ac':''));
  const operation=String(effect.operation || 'ADD').toUpperCase();
  if(!target || !operations.has(operation)) return null;
  if(!['ADVANTAGE','DISADVANTAGE'].includes(operation) && !Number.isFinite(Number(effect.value))) return null;
  return {...defaults,...effect,target,operation,value:finite(effect.value),id:String(effect.id || defaults.id || ''),
    name:String(effect.name || effect.source || defaults.name || 'Effect'),sourceType:effect.sourceType || defaults.sourceType || 'other',
    conditional:type==='AC_MODIFIER_CONDITIONAL' || Boolean(effect.condition || effect.conditional),priority:finite(effect.priority)};
}
export function collectCharacterEffects(character={},clock={}) {
  const result=[],seen=new Set();
  const visit=(source,sourceType,prefix=sourceType,parent={})=>effectRows(source).forEach((row,index)=>{
    if(!row || typeof row!=='object') return;
    const id=String(row.id || `${prefix}:${index}`), active=effectIsActive(parent,clock)&&effectIsActive(row,clock);
    const defaults={id,name:row.name || parent.name,sourceId:row.sourceId || parent.id || id,sourceType,active};
    const normalized=normalizeEffect({...row,active},defaults);
    if(normalized && !seen.has(normalized.id)){seen.add(normalized.id);result.push(normalized);}
    const inherited={...row,id,active};
    visit(row.effects, row.sourceType || sourceType, `${id}:effect`,inherited);
    visit(row.modifiers, row.sourceType || sourceType, `${id}:modifier`,inherited);
  });
  visit(character.acModifiers || character.armourModifiers || character.armorModifiers,'other');
  visit(character.activeEffects || character.effects,'effect');
  visit(character.talentResourceEffects,'talent');
  visit(character.talentEffects,'talent','talent-active');
  visit(character.talents || character.unlockedTalents,'talent','talent-owned');
  visit(character.racialTraits || character.raceTraits,'race');
  visit(character.race?.effects,'race','race-effects');
  visit(character.classEffects,'class');
  visit(character.enchantments,'enchantment');
  visit(character.activeSpells,'spell');
  visit(effectRows(character.spells).filter(row=>row.active===true),'spell','cast-spell');
  visit(character.conditions || character.statusEffects,'condition');
  visit(character.patronEffects,'patron');
  visit(character.campaignEffects,'campaign');
  const equipment=new Map();
  for(const [index,item] of effectRows(character.inventory).entries()) if(item?.equipped) equipment.set(String(item.id || item.instanceId || `${item.name}:${item.equippedSlot || index}`),item);
  for(const [slot,item] of Object.entries(character.equipment || {})) if(item && typeof item==='object') equipment.set(String(item.id || item.instanceId || `${item.name}:${slot}`),item);
  for(const [id,item] of equipment) {
    visit(item.effects,'equipment',`item:${id}`,item);
    visit(item.enchantments,'enchantment',`enchantment:${id}`,item);
  }
  return result;
}
export function evaluateEffects(base,target,effects=[],clock={}) {
  const normalizedTarget=normalizeTarget(target), groups=new Map(), rows=[];
  for(const raw of effects) {
    const effect=normalizeEffect(raw);
    if(!effect || effect.target!==normalizedTarget || !effectIsActive(effect,clock) || effect.conditional) continue;
    if(effect.stacking==='strongest' && effect.stackGroup) {
      const old=groups.get(effect.stackGroup);
      if(!old || Math.abs(effect.value)>Math.abs(old.value)) groups.set(effect.stackGroup,effect);
    } else rows.push(effect);
  }
  rows.push(...groups.values());
  rows.sort((a,b)=>a.priority-b.priority || a.id.localeCompare(b.id));
  // Set the base, then add modifiers, multiply, and finally apply bounds.
  let value=finite(base);
  for(const row of rows.filter(row=>row.operation==='SET')) value=row.value;
  for(const row of rows) if(row.operation==='ADD') value+=row.value; else if(row.operation==='SUBTRACT') value-=row.value;
  for(const row of rows.filter(row=>row.operation==='MULTIPLY')) value*=row.value;
  for(const row of rows) if(row.operation==='MIN') value=Math.min(value,row.value); else if(row.operation==='MAX') value=Math.max(value,row.value);
  const advantage=rows.some(row=>row.operation==='ADVANTAGE'), disadvantage=rows.some(row=>row.operation==='DISADVANTAGE');
  return {value,advantage:advantage&&!disadvantage,disadvantage:disadvantage&&!advantage,effects:rows};
}
export function baseCharacteristicValue(character={},key) {
  const name=normalizeTarget(key).replace('characteristics.','');
  const source=character.characteristics || {};
  const raw=(CHARACTERISTIC_ALIASES[name] || [name]).flatMap(alias=>[source[alias],source[alias.toUpperCase()]]).find(value=>value!==undefined);
  return finite(raw?.value ?? raw);
}
export function effectiveCharacteristicValue(character,key,clock={}) {
  return evaluateEffects(baseCharacteristicValue(character,key),normalizeTarget(key),collectCharacterEffects(character,clock),clock).value;
}
export function characterCheck(character,target='checks',base=0,clock={}) {
  const effects=collectCharacterEffects(character,clock), normalized=normalizeTarget(target);
  const applicable=effects.filter(effect=>effect.target===normalized || effect.target==='checks' || normalized.startsWith('skills.') && effect.target==='skills').map(effect=>({...effect,target:normalized}));
  return evaluateEffects(base,normalized,applicable,clock);
}
export function validateEffectInput(input={}) {
  const effect=normalizeEffect(input);
  if(!effect || !/^[a-z][a-z0-9_.-]{0,100}$/.test(effect.target) || Math.abs(effect.value)>1e6 || effect.operation==='MULTIPLY' && effect.value<0) throw new Error('Choose a valid effect target, operation, and value.');
  return effect;
}
