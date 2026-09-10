export function isManualNumber(value, { min = -Infinity, max = Infinity, integer = true, optional = false } = {}) {
  if(value == null || String(value).trim() === '') return optional;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER
    && (!integer || Number.isInteger(number)) && number >= min && number <= max;
}

// Only call after validation. Optional, untouched amounts explicitly mean zero.
export const manualNumber = value => Number(value === '' || value == null ? 0 : value);
