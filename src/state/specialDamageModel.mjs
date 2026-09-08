function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resourcePair(value) {
  if(Array.isArray(value)) return [Math.max(0, number(value[0])), Math.max(0, number(value[1]))];
  if(value && typeof value === 'object') {
    return [
      Math.max(0, number(value.current ?? value.value)),
      Math.max(0, number(value.maximum ?? value.max))
    ];
  }
  const amount = Math.max(0, number(value));
  return [amount, amount];
}

function existingResourcePair(value) {
  if(Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) return resourcePair(value);
  if(value && typeof value === 'object') {
    const current=value.current ?? value.value;
    const maximum=value.maximum ?? value.max;
    if(Number.isFinite(Number(current)) && Number.isFinite(Number(maximum))) return resourcePair(value);
  }
  return null;
}

export function soulDamageValue(entity = {}) {
  const soul = entity.specialDamage?.soul;
  const raw = soul && typeof soul === 'object'
    ? soul.current ?? soul.value ?? soul.amount
    : soul ?? entity.soulDamage;
  const maximum = resourcePair(entity.hp)[1];
  return Math.max(0, Math.min(maximum || Number.MAX_SAFE_INTEGER, number(raw)));
}

export function soulHealingCap(entity = {}) {
  const maximum = resourcePair(entity.hp)[1];
  return Math.max(0, maximum - soulDamageValue(entity));
}

export function clampHpForSoulDamage(entity = {}, requestedCurrent) {
  return Math.max(0, Math.min(soulHealingCap(entity), number(requestedCurrent)));
}

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
  const hp = existingResourcePair(next.hp);
  const sp = existingResourcePair(next.sp);
  const mp = existingResourcePair(next.mp);
  if(restType === 'short') {
    if(sp) next.sp = [Math.min(sp[1], sp[0] + Math.ceil(sp[1] * 0.35)), sp[1]];
  } else {
    if(hp) next.hp = [clampHpForSoulDamage(next, hp[0] + Math.ceil(hp[1] * 0.5)), hp[1]];
    if(sp) next.sp = [sp[1], sp[1]];
    if(mp) next.mp = [Math.min(mp[1], mp[0] + Math.ceil(mp[1] * 0.5)), mp[1]];
  }
  return { entity:next, type:restType, recoveredSoul, soulDamage:soulDamageValue(next) };
}
