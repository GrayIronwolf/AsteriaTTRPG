// Sources can be direct URLs or uploaded-media records stored by older Forge versions.
export function hudImageSource(...candidates) {
  for (const candidate of candidates) {
    const source = typeof candidate === 'string' ? candidate
      : candidate && typeof candidate === 'object'
        ? candidate.url || candidate.src || candidate.downloadURL || candidate.dataUrl || ''
        : '';
    if (typeof source === 'string' && source.trim()) return source.trim();
  }
  return '';
}

// Crop information is optional; reject arbitrary CSS so stored fields cannot break layout.
export function hudImagePosition(position, fallback = 'center') {
  if (typeof position !== 'string') return fallback;
  const value = position.trim().toLowerCase();
  const token = '(?:left|right|center|top|bottom|(?:100|[1-9]?\\d)%)';
  return new RegExp('^' + token + '(?:\\s+' + token + ')?$').test(value) ? value : fallback;
}
