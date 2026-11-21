import { PUBLIC_DOMAINS } from './compendiumModel.mjs';

export const PUBLIC_DOMAIN_IDS = Object.freeze(PUBLIC_DOMAINS.map(row => row.id));
const allowed = new Set(PUBLIC_DOMAIN_IDS);

export function isValidPublicEntryRoute(domain, slug) {
  return typeof domain === 'string' && allowed.has(domain) &&
    typeof slug === 'string' && slug.length > 0 && slug.length <= 180 &&
    /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

// These tokens are keys in a published index. They are never fetched as URLs.
export function isSafePublicReference(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 330 &&
    /^[\p{L}\p{N} /:._'’&(),–—+-]+$/u.test(value) &&
    !value.startsWith('//') && !value.includes('://') &&
    !value.split('/').some(part => part === '.' || part === '..');
}

export function normalizePublicSourceReference(value) {
  if(!isSafePublicReference(value)||!/\.md$/i.test(value)||value.includes(':'))return '';
  return value.trim().replace(/^\//,'').normalize('NFC').toLowerCase();
}

const normalReference = value => value.trim().normalize('NFKC').replace(/\s+/g,' ').toLowerCase();

function referenceKeys(value, domain) {
  const key = normalReference(value);
  const prefix = '/compendium/' + domain + '/';
  if (key.startsWith(prefix)) return [key,key.slice(prefix.length)];
  if (key.startsWith('/')) return [key,key.slice(1)];
  return [key,'/' + key];
}

export function publicEntryTarget(row) {
  return {domain:row.domain,slug:row.slug,title:row.title,categoryPath:row.categoryPath||[]};
}

export function resolvePublicEntry(entries, reference) {
  if (!Array.isArray(entries) || !isSafePublicReference(reference)) return {state:'missing',entry:null};
  const value=reference.trim();
  const matchesKey=entries.filter(row=>row && (row.slug===value ||
    value==='/compendium/'+row.domain+'/'+row.slug));
  const exact=matchesKey.length?matchesKey:entries.filter(row=>row?.id===value);
  const matches=exact.length?exact:entries.filter(row=>{
    if(!row)return false;
    const keys=referenceKeys(value,row.domain);
    return [row.title,row.indexCode,...(row.aliases||[])].some(alias=>isSafePublicReference(alias)&&
      referenceKeys(alias,row.domain).some(key=>keys.includes(key)));
  });
  if (matches.length===0) return {state:'missing',entry:null};
  if (matches.length!==1) return {state:'ambiguous',entry:null,choices:matches.map(publicEntryTarget)};
  return {state:'ready',entry:matches[0]};
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
