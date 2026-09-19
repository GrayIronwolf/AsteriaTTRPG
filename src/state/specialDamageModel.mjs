import { resourcePair, soulDamageValue, clampHpForSoulDamage } from './resourceValues.mjs';
import { recoverRestResources } from './resourceEngine.mjs';
export { resourcePair, soulDamageValue, soulHealingCap, clampHpForSoulDamage } from './resourceValues.mjs';

function withSoulDamage(entity = {}, amount, source = 'Soul Damage') {
  const value = Math.max(0, Math.min(resourcePair(entity.hp)[1], number(amount)));
  return {
    ...entity,
    specialDamage: {
      ...(entity.specialDamage || {}),
      soul: {
        type: 'Soul Damage',
        value,
        recovery: 'time-only',
        source,
        updatedAt: new Date().toISOString()
      }
    }
  };
}

export function applySoulDamage(entity = {}, amount, source = 'Soul Damage') {
  const requested = Math.max(0, number(amount));
  const before = soulDamageValue(entity);
  const maximum = resourcePair(entity.hp)[1];
  const applied = Math.min(requested, Math.max(0, maximum - before));
  const next = withSoulDamage(entity, before + applied, source);
  const hp = resourcePair(entity.hp);
  next.hp = [Math.max(0, hp[0] - applied), hp[1]];
  return { entity:next, applied, soulDamage:before + applied };
}

export function recoverSoulDamage(entity = {}, amount, source = 'Long Rest') {
  const requested = Math.max(0, number(amount));
  const before = soulDamageValue(entity);
  const recovered = Math.min(before, requested);
  const next = withSoulDamage(entity, before - recovered, source);
  const hp = resourcePair(entity.hp);
  next.hp = [clampHpForSoulDamage(next, hp[0]), hp[1]];
  return { entity:next, recovered, soulDamage:before - recovered };
}

export function applyRest(entity = {}, type = 'short', soulRecovery = 0) {
  const restType = String(type || '').toLowerCase();
  if(!['short', 'long'].includes(restType)) throw new Error('Unsupported rest type.');
  let next = { ...entity };
  let recoveredSoul = 0;
  if(restType === 'long' && Number(soulRecovery) > 0 && soulDamageValue(next) > 0) {
    const recovery = recoverSoulDamage(next, soulRecovery, 'Long Rest');
    next = recovery.entity;
    recoveredSoul = recovery.recovered;
  }
  next = recoverRestResources(next, restType);
  return { entity:next, type:restType, recoveredSoul, soulDamage:soulDamageValue(next) };
}
