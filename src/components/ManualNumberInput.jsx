import React from 'react';

// Keep draft text (including an empty field or an unfinished decimal) in the
// caller's state. Conversion and range checks belong at the action boundary.
export function ManualNumberInput({ value, onChange, min, max, step = '1', ...props }) {
  const signed = min == null || Number(min) < 0;
  const decimal = step === 'any' || !Number.isInteger(Number(step));
  const pattern = signed
    ? (decimal ? /^-?\d*(?:\.\d*)?$/ : /^-?\d*$/)
    : (decimal ? /^\d*(?:\.\d*)?$/ : /^\d*$/);
  return <input {...props} type="text" inputMode={signed ? 'text' : decimal ? 'decimal' : 'numeric'}
    autoComplete="off" value={value ?? ''} onChange={event => {
      // Mobile decimal keyboards may use a comma for the decimal separator.
      const text = decimal ? event.target.value.replace(',', '.') : event.target.value;
      if(!pattern.test(text)) return;
      if(text !== event.target.value) event.target.value = text;
      onChange?.(event);
    }} />;
}
