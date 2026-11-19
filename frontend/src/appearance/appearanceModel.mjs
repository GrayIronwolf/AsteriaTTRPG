/**
 * React/Vite preview-only appearance settings. No account or Firebase data.
 * All customisable values come from fixed allowlists, never stored CSS strings.
 */
export const APPEARANCE_STORAGE_KEY = 'asteria.react.appearance.v1';
export const APPEARANCE_SCHEMA_VERSION = 1;

export const BACKGROUND_OPTIONS = Object.freeze([
  { id: 'black', label: 'Black', swatch: '--ast-swatch-black' },
  { id: 'dark-gray', label: 'Dark Gray', swatch: '--ast-swatch-dark-gray' },
  { id: 'light-gray', label: 'Light Gray', swatch: '--ast-swatch-light-gray' },
  { id: 'dark-blue', label: 'Dark Blue', swatch: '--ast-swatch-dark-blue' },
  { id: 'forest', label: 'Forest Green', swatch: '--ast-swatch-forest' }
]);

// CSS font stacks are defined only in tokens.css; no remote font downloads.
export const FONT_OPTIONS = Object.freeze([
  { id: 'system', label: 'Asteria Default' },
  { id: 'aptos', label: 'Aptos' },
  { id: 'arial', label: 'Arial' },
  { id: 'calibri', label: 'Calibri' },
  { id: 'times', label: 'Times New Roman' },
  { id: 'georgia', label: 'Georgia' },
  { id: 'baskerville', label: 'Baskerville' },
  { id: 'garamond', label: 'Garamond' },
  { id: 'century', label: 'Century' },
  { id: 'lucida', label: 'Lucida' },
  { id: 'castellar', label: 'Castellar' },
  { id: 'kunstler', label: 'Kunstler Script' }
]);

export const TEXT_SIZE_OPTIONS = Object.freeze([
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Standard' },
  { id: 'large', label: 'Large' },
  { id: 'extra-large', label: 'Extra Large' }
]);

export const BUTTON_THEME_OPTIONS = Object.freeze([
  { id: 'asteria-crystal', label: 'Asteria Crystal', description: 'Original crystal and metallic bezel' }
]);

export const DEFAULT_APPEARANCE = Object.freeze({
  background: 'black',
  bodyFont: 'system',
  displayFont: 'system',
  textSize: 'normal',
  buttonTheme: 'asteria-crystal',
  crystalColor: '#1f7dff'
});

function allow(value, options, fallback) {
  return typeof value === 'string' && options.some(item => item.id === value)
    ? value : fallback;
}

export function normalizeAppearance(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    background: allow(source.background, BACKGROUND_OPTIONS, DEFAULT_APPEARANCE.background),
    bodyFont: allow(source.bodyFont, FONT_OPTIONS, DEFAULT_APPEARANCE.bodyFont),
    displayFont: allow(source.displayFont, FONT_OPTIONS, DEFAULT_APPEARANCE.displayFont),
    textSize: allow(source.textSize, TEXT_SIZE_OPTIONS, DEFAULT_APPEARANCE.textSize),
    buttonTheme: allow(source.buttonTheme, BUTTON_THEME_OPTIONS, DEFAULT_APPEARANCE.buttonTheme),
    crystalColor: typeof source.crystalColor === 'string' && /^#[0-9a-f]{6}$/i.test(source.crystalColor)
      ? source.crystalColor.toLowerCase() : DEFAULT_APPEARANCE.crystalColor
  };
}

export function decodeAppearance(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return { ...DEFAULT_APPEARANCE };
  try {
    const decoded = JSON.parse(raw);
    return decoded && decoded.version === APPEARANCE_SCHEMA_VERSION
      ? normalizeAppearance(decoded) : { ...DEFAULT_APPEARANCE };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function encodeAppearance(value) {
  return JSON.stringify({ version: APPEARANCE_SCHEMA_VERSION, ...normalizeAppearance(value) });
}
