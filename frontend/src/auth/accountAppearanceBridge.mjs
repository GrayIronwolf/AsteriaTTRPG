import { FONT_OPTIONS, normalizeAppearance } from '../appearance/appearanceModel.mjs';

// Preserve the existing users/{uid}/settings/appearance schema and revision
// protocol. React only saves when a user explicitly requests cloud sync.
const TO_CLOUD_BACKGROUND = Object.freeze({
  black:'dark', 'dark-gray':'gray', 'light-gray':'light',
  'dark-blue':'darkBlue', forest:'darkGreen'
});
const FROM_CLOUD_BACKGROUND = Object.freeze({
  dark:'black', gray:'dark-gray', light:'light-gray',
  darkBlue:'dark-blue', darkGreen:'forest'
});
const FONT_LABELS = Object.freeze(Object.fromEntries(FONT_OPTIONS.map(item => [item.id,item.label])));
const FROM_CLOUD_FONT = Object.freeze(Object.fromEntries(
  FONT_OPTIONS.map(item => [item.label.toLowerCase(),item.id])
));
const TO_CLOUD_SIZE = Object.freeze({compact:90,normal:100,large:110,'extra-large':115});
function revision(section) {
  const value = section?.revision;
  if (!Number.isSafeInteger(value) || value < 0) return 0;
  return value;
}
function mappedFont(value) {
  return FROM_CLOUD_FONT[String(value || '').trim().toLowerCase()] || null;
}
export function readCloudAppearance(data) {
  const theme = data?.theme?.value;
  const typography = data?.typography?.value;
  const patch = {};
  if (typeof theme?.background === 'string' && FROM_CLOUD_BACKGROUND[theme.background])
    patch.background = FROM_CLOUD_BACKGROUND[theme.background];
  if (mappedFont(typography?.reading)) patch.bodyFont = mappedFont(typography.reading);
  if (mappedFont(typography?.heading)) patch.displayFont = mappedFont(typography.heading);
  if (typeof typography?.size === 'number') {
    patch.textSize = typography.size <= 93 ? 'compact'
      : typography.size <= 104 ? 'normal' : typography.size <= 112 ? 'large' : 'extra-large';
  }
  return Object.freeze({
    exists: Boolean(data?.theme || data?.typography),
    appearance: normalizeAppearance(patch),
    themeRevision: revision(data?.theme),
    typographyRevision: revision(data?.typography)
  });
}
export function cloudAppearancePatch(local, current = {}) {
  const appearance = normalizeAppearance(local);
  const themeValue = current?.theme?.value && typeof current.theme.value === 'object'
    ? current.theme.value : {};
  const typeValue = current?.typography?.value && typeof current.typography.value === 'object'
    ? current.typography.value : {};
  return {
    theme: {
      value: { ...themeValue, background: TO_CLOUD_BACKGROUND[appearance.background],
        // Keep legacy colour, transparency, panel and motion fields unmodified.
        theme:themeValue.theme || 'spellblade' },
      revision: revision(current?.theme) + 1
    },
    typography: {
      value: { ...typeValue, heading: FONT_LABELS[appearance.displayFont],
        reading: FONT_LABELS[appearance.bodyFont], size: TO_CLOUD_SIZE[appearance.textSize] },
      revision: revision(current?.typography) + 1
    }
  };
}
export function appearanceRevisionsMatch(current, expected) {
  return expected && revision(current?.theme) === expected.themeRevision &&
    revision(current?.typography) === expected.typographyRevision;
}
