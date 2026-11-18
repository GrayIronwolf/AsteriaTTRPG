import { isRestrictedSectionTitle } from './publicSections.mjs';

/**
 * One publication rule for all three static React Compendium projections.
 * Client-visible assets are public downloads: a React-only role toggle can
 * NEVER authorise GM-only or private records.
 */
export function isPublishedDefinition(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      entry.visibility !== 'public' || entry.gmOnly === true ||
      entry.private === true || entry.secret === true) return false;
  const meta = entry.metadata;
  return !meta || (typeof meta === 'object' && !Array.isArray(meta) &&
    (meta.visibility === undefined || meta.visibility === 'public') &&
    meta.gmOnly !== true && meta.private !== true && meta.secret !== true);
}

const CATALOGUE_KEYS = Object.freeze([
  'id','title','slug','domain','href','categoryPath','category','summary','tags'
]);
const ENTRY_KEYS = Object.freeze([
  'id','title','slug','domain','summary','categoryPath','sections'
]);
const SEARCH_KEYS = Object.freeze(['id','text']);
function matchesKeys(record,expected) {
  return Boolean(record) && typeof record === 'object' && !Array.isArray(record) &&
    Object.keys(record).sort().join(',') === [...expected].sort().join(',');
}
const text = value => typeof value === 'string' && value.length > 0;
const words = value => Array.isArray(value) && value.every(item => typeof item === 'string');
// The canonical creature manifest retains an established legacy ID namespace.
const publishedId = (id,domain) => typeof id === 'string' &&
  (id.startsWith(domain+':') ||
   (domain === 'creature' && id.startsWith('creature-manifest:creature:')));
const identity = (row,domain) => publishedId(row.id,domain) &&
  text(row.title) && text(row.slug) &&
  /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && row.domain === domain;

/** Reject extra private fields, including fields copied into a JSON shard. */
export function validatePublishedCatalogue(row,domain) {
  if(!matchesKeys(row,CATALOGUE_KEYS) || !identity(row,domain) ||
     typeof row.href !== 'string' || !row.href.startsWith('#/compendium') ||
     !words(row.categoryPath) || !words(row.tags) ||
     typeof row.category !== 'string' || typeof row.summary !== 'string')
    throw new Error('Untrusted published Compendium catalogue.');
  return Object.freeze({...row});
}
export function validatePublishedEntry(row,domain) {
  if(!matchesKeys(row,ENTRY_KEYS) || !identity(row,domain) ||
     typeof row.summary !== 'string' || !words(row.categoryPath) ||
     !Array.isArray(row.sections) || row.sections.some(section =>
       !matchesKeys(section,['title','body']) ||
       !text(section.title) || typeof section.body !== 'string' ||
       isRestrictedSectionTitle(section.title)))
    throw new Error('Untrusted published Compendium entry.');
  return Object.freeze({...row,sections:Object.freeze(row.sections.map(section=>Object.freeze({...section})))});
}
export function validatePublishedSearch(row,domain) {
  if(!matchesKeys(row,SEARCH_KEYS) || typeof row.id !== 'string' ||
     !publishedId(row.id,domain) || typeof row.text !== 'string')
    throw new Error('Untrusted public Compendium search index.');
  return Object.freeze({...row});
}

/**
 * Restricted records require a future server-authorised reader and cannot be
 * bundled, fetched from public URLs, or unlocked by a browser role string.
 */
export function resolveCompendiumPublicationAccess(visibility) {
  return visibility === 'public'
    ? Object.freeze({visible:true,source:'published-static'})
    : Object.freeze({visible:false,source:'server-only-required'});
}
