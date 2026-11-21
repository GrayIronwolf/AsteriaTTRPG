/**
 * Phase 3.3 pure discovery model.
 * The single catalogue/domain authority remains compendiumModel.mjs;
 * this adds URL-stable taxonomy, facet counts, and public-text ranking.
 */
import { PUBLIC_DOMAINS } from './compendiumModel.mjs';
import {
  LEGACY_LIBRARY_FILTERS, getLibraryCategory, legacyLibraryCategory, libraryFilterFields
} from './legacyLibrary.mjs';

const allowedDomains = new Set(PUBLIC_DOMAINS.map(item => item.id));
const validSorts = new Set(['az','za','relevance','name','category']);
const allowedFields = new Set(Object.values(LEGACY_LIBRARY_FILTERS).flat());
const MAX_QUERY = 160;
const MAX_PATH = 6;
const MAX_SEGMENT = 90;
const fullIndexCode = /^\d{2}-\d{2}-\d{3}-\d{3}$/;
const partialIndexCode = /^\d{2}(?:-\d{1,3}){1,3}-?$/;
const normalizeFilter = value => String(value ?? '').trim().toLocaleLowerCase();

export function normalizeDiscoveryText(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function discoveryTerms(value) {
  return normalizeDiscoveryText(String(value ?? '').slice(0, MAX_QUERY))
    .split(' ').filter(Boolean).slice(0, 12);
}

export function normalizeCategoryPath(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, MAX_PATH)
    .filter(value => typeof value === 'string')
    .map(value => value.trim().slice(0, MAX_SEGMENT))
    .filter(Boolean);
}

export function entryCategoryPath(entry) {
  const path = normalizeCategoryPath(entry?.categoryPath);
  return path.length ? path :
    typeof entry?.category === 'string' && entry.category.trim()
      ? [entry.category.trim().slice(0, MAX_SEGMENT)] : [];
}

export function isCategoryPrefix(value, prefix) {
  const path = entryCategoryPath(value);
  return Array.isArray(prefix) && prefix.length <= path.length &&
    prefix.every((part, index) =>
      normalizeDiscoveryText(part) === normalizeDiscoveryText(path[index]));
}

export function parseDiscoveryFilters(query,{legacyDomain = false} = {}) {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query ?? '');
  const sortParam = params.get('sort');
  const path = params.getAll('path');
  const field = params.get('filter');
  return Object.freeze({
    path: Object.freeze(normalizeCategoryPath(path.length || !legacyDomain ? path :
      (params.get('category') || '').split('/'))),
    sort: validSorts.has(sortParam) ? sortParam : legacyDomain ? 'name' : 'relevance',
    saved: params.get('saved') === '1',
    field: allowedFields.has(field) ? field : '',
    value: allowedFields.has(field) ? (params.get('value') || '').trim().slice(0,MAX_QUERY) : ''
  });
}

/**
 * Use path= repeated values to avoid collision with the legacy
 * category=races/magic/resources navigation bookmarks.
 * Older explicit-domain links omit group/category unless already scoped.
 */
export function createDiscoveryHref(options = {}) {
  const domain = allowedDomains.has(options.domain) ? options.domain : '';
  const group = /^[a-z-]{1,40}$/.test(options.group ?? '') ? options.group : '';
  const category = /^[a-z-]{1,40}$/.test(options.legacyCategory ?? '') ? options.legacyCategory : '';
  const q = String(options.query ?? '').trim().slice(0, MAX_QUERY);
  const path = normalizeCategoryPath(options.path);
  const sort = validSorts.has(options.sort) ? options.sort : 'relevance';
  const params = new URLSearchParams();
  if (domain) params.set('domain', domain);
  if (!domain || options.includeLibraryScope === true) {
    if (group) params.set('group', group);
    if (category) params.set('category', category);
  }
  if (q) params.set('q', q);
  for (const segment of path) params.append('path', segment);
  if (sort !== 'relevance') params.set('sort', sort);
  if (options.saved) params.set('saved','1');
  if (allowedFields.has(options.field)) {
    params.set('filter',options.field);
    const value = String(options.value ?? '').trim().slice(0,MAX_QUERY);
    if (value) params.set('value',value);
  }
  return '#/compendium' + (params.size ? '?' + params.toString() : '');
}

function scoreOne(entry,terms,query,index) {
  if (!terms.length) return {priority:0,rank:0};
  const code = entry.indexCode || '';
  if (fullIndexCode.test(query)) return code === query ? {priority:6,rank:0} : null;
  if (partialIndexCode.test(query) && code.startsWith(query)) return {priority:6,rank:0};
  const title = normalizeDiscoveryText(entry.title);
  const id = normalizeDiscoveryText(entry.id);
  const aliases = (entry.aliases || []).map(normalizeDiscoveryText);
  const tags = normalizeDiscoveryText((entry.tags || []).join(' '));
  const category = normalizeDiscoveryText(entryCategoryPath(entry).join(' '));
  const summary = normalizeDiscoveryText(entry.summary);
  // The index is created only from prefiltered public section bodies.
  const body = index instanceof Map ? String(index.get(entry.id) || '') : '';
  const text = [title,id,aliases.join(' '),tags,category,summary,body].join(' ');
  if (!terms.every(term => text.includes(term))) return null;
  const phrase = terms.join(' ');
  let priority = 0;
  if (title === phrase) priority = 5;
  else if (title.startsWith(phrase)) priority = 4;
  else if (title.includes(phrase)) priority = 3;
  else if (aliases.some(alias => alias === phrase)) priority = 2;
  else if (aliases.some(alias => alias.includes(phrase))) priority = 1;
  let rank = 0;
  if (id.includes(phrase)) rank += 40;
  if (tags.includes(phrase)) rank += 28;
  if (category.includes(phrase)) rank += 24;
  if (summary.includes(phrase)) rank += 16;
  if (body.includes(phrase)) rank += 8;
  for (const term of terms) {
    if (title.includes(term)) rank += 12;
    else if (tags.includes(term)) rank += 7;
    else if (summary.includes(term)) rank += 5;
    else if (category.includes(term)) rank += 4;
    else if (body.includes(term)) rank += 1;
  }
  return {priority,rank};
}

function metadataValue(entry,field) {
  if (!libraryFilterFields(entry.domain).includes(field)) return '';
  return String(entry.filters?.[field] ?? (field === 'category' ? entry.category : '') ?? '').trim();
}

export function getMetadataFacets(entries,domain = '') {
  const fields = domain ? libraryFilterFields(domain) : allowedFields;
  const options = [];
  for (const field of fields) {
    const values = new Map();
    for (const entry of entries) {
      if (domain && entry.domain !== domain) continue;
      const value = metadataValue(entry,field);
      if (value) values.set(normalizeFilter(value),value);
    }
    if (values.size) options.push({
      field,
      values:[...values.values()].sort((a,b) => a.localeCompare(b,'en',{numeric:true}))
    });
  }
  return options;
}

export function filterDiscoveryEntries(entries, {
  query = '', path = [], sort = 'relevance', searchIndex = null,
  field = '', value = '', categoryByPath = false
} = {}) {
  const terms = discoveryTerms(query);
  const rawQuery = String(query).trim().slice(0,MAX_QUERY);
  const prefix = normalizeCategoryPath(path);
  const selectedValue = normalizeFilter(value);
  const matches = [];
  for (const entry of entries || []) {
    if (!isCategoryPrefix(entry, prefix)) continue;
    if (field && selectedValue && normalizeFilter(metadataValue(entry,field)) !== selectedValue) continue;
    const score = scoreOne(entry,terms,rawQuery,searchIndex);
    if (score === null) continue;
    matches.push({entry,...score});
  }
  const compareTitle = (a,b) => a.entry.title.localeCompare(b.entry.title,'en') ||
    a.entry.id.localeCompare(b.entry.id,'en');
  const category = entry => categoryByPath ? entryCategoryPath(entry).join('/') :
    getLibraryCategory(legacyLibraryCategory(entry))?.title || '';
  matches.sort((a,b) => {
    if (sort === 'za') return -compareTitle(a,b);
    if (sort === 'category') return category(a.entry).localeCompare(category(b.entry),'en') || compareTitle(a,b);
    if (sort === 'az' || sort === 'name' || !terms.length) return compareTitle(a,b);
    return b.priority-a.priority || b.rank-a.rank || compareTitle(a,b);
  });
  return matches.map(item => item.entry);
}

/**
 * Facet counts reflect the active public search but not the selected child
 * facet: this prevents categories vanishing as a user drills deeper.
 */
export function getDiscoveryFacets(entries, selectedPath = []) {
  const prefix = normalizeCategoryPath(selectedPath);
  const counts = new Map();
  let direct = 0;
  for (const entry of entries || []) {
    if (!isCategoryPrefix(entry, prefix)) continue;
    const path = entryCategoryPath(entry);
    if (path.length <= prefix.length) {
      direct++;
      continue;
    }
    const next = path[prefix.length];
    counts.set(next, (counts.get(next) || 0) + 1);
  }
  return {
    directCount: direct,
    children: [...counts].map(([label,count])=>({
      label, count, path: [...prefix, label]
    })).sort((a,b)=>a.label.localeCompare(b.label,'en'))
  };
}
