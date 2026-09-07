export const MAGIC_ELEMENT_SYMBOL_SLUGS = Object.freeze([
  'air',
  'blood',
  'celestial',
  'chaos',
  'dark',
  'death',
  'earth',
  'eldritch',
  'fae',
  'fate',
  'fire',
  'infernal',
  'life',
  'light',
  'space',
  'spirit',
  'time',
  'water'
]);

const symbolSlugs = new Set(MAGIC_ELEMENT_SYMBOL_SLUGS);

export function magicElementSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+magic$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function magicElementImage(value = '') {
  const element = magicElementSlug(value);
  return symbolSlugs.has(element) ? `assets/magic-elements/${element}-spells.png` : '';
}
