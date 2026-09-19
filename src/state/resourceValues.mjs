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


export function strictResourcePair(value, resource = 'resource') {
  let current;
  let maximum;
  if(Array.isArray(value) && value.length >= 2) {
    [current, maximum] = value;
  } else if(value && typeof value === 'object') {
    current = value.current ?? value.value;
    maximum = value.maximum ?? value.max;
  } else {
    throw new Error(`${String(resource).toUpperCase()} data is missing or invalid. Refresh before trying again.`);
  }
  current = Number(current);
  maximum = Number(maximum);
  if(!Number.isFinite(current) || !Number.isFinite(maximum) || maximum < 0) {
    throw new Error(`${String(resource).toUpperCase()} data is missing or invalid. Refresh before trying again.`);
  }
  return [Math.max(0, current), maximum];
}
