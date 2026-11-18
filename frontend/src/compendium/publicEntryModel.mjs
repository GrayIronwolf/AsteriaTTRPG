import { PUBLIC_DOMAINS } from './compendiumModel.mjs';

export const PUBLIC_DOMAIN_IDS = Object.freeze(PUBLIC_DOMAINS.map(row => row.id));
const allowed = new Set(PUBLIC_DOMAIN_IDS);

export function isValidPublicEntryRoute(domain, slug) {
  return typeof domain === 'string' && allowed.has(domain) &&
    typeof slug === 'string' && slug.length > 0 && slug.length <= 180 &&
    /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

export function resolvePublicEntry(entries, slug) {
  if (!Array.isArray(entries)) return { state: 'missing', entry: null };
  const matches = entries.filter(row => row && row.slug === slug);
  if (matches.length === 0) return { state: 'missing', entry: null };
  if (matches.length !== 1) return { state: 'ambiguous', entry: null };
  return { state: 'ready', entry: matches[0] };
}

export function createPublicSectionHref(domain, slug, sectionName) {
  if (!isValidPublicEntryRoute(domain, slug)) return '#/compendium';
  const params = new URLSearchParams();
  if (typeof sectionName === 'string' && sectionName.trim()) params.set('tab', sectionName);
  const suffix = params.toString();
  return '#/compendium/' + encodeURIComponent(domain) + '/' + encodeURIComponent(slug) +
    (suffix ? '?' + suffix : '');
}

export function resolveSelectedSection(sections, query) {
  if (!Array.isArray(sections) || sections.length === 0) return '';
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query || '');
  const preferred = params.get('tab');
  return sections.some(section => section.title === preferred) ? preferred : sections[0].title;
}

export function getSafePublicHref(candidate) {
  const href = String(candidate ?? '').trim();
  if (!href || href.length > 1800) return null;
  if (/^https:\/\//i.test(href)) {
    try { const u = new URL(href); return u.username || u.password ? null : u.href; }
    catch { return null; }
  }
  if (/^#\/compendium(?:\/[a-z0-9-]+){0,2}(?:\?[^#]*)?$/i.test(href)) return href;
  return null;
}
