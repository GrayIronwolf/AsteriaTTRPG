/**
 * Phase 3.3 pure discovery model.
 * The single catalogue/domain authority remains compendiumModel.mjs;
 * this adds URL-stable taxonomy, facet counts, and public-text ranking.
 */
import { PUBLIC_DOMAINS } from './compendiumModel.mjs';

const allowedDomains = new Set(PUBLIC_DOMAINS.map(item => item.id));
const validSorts = new Set(['az', 'za', 'relevance']);
const MAX_QUERY = 160;
const MAX_PATH = 6;
const MAX_SEGMENT = 90;

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

export function parseDiscoveryFilters(query) {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query ?? '');
  const sortParam = params.get('sort');
  return Object.freeze({
    path: Object.freeze(normalizeCategoryPath(params.getAll('path'))),
    sort: validSorts.has(sortParam) ? sortParam : 'relevance'
  });
}

/**
 * Use path= repeated values to avoid collision with the legacy
 * category=races/magic/resources navigation bookmarks.
 * Group/category only apply when no explicit domain has been selected.
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
  else {
    if (group) params.set('group', group);
    if (category) params.set('category', category);
  }
  if (q) params.set('q', q);
  for (const segment of path) params.append('path', segment);
  if (sort !== 'relevance') params.set('sort', sort);
  return '#/compendium' + (params.size ? '?' + params.toString() : '');
}

function scoreOne(entry, terms, index) {
  if (!terms.length) return 0;
  const title = normalizeDiscoveryText(entry.title);
  const id = normalizeDiscoveryText(entry.id);
  const tags = normalizeDiscoveryText((entry.tags || []).join(' '));
  const category = normalizeDiscoveryText(entryCategoryPath(entry).join(' '));
  const summary = normalizeDiscoveryText(entry.summary);
  // The index is created only from prefiltered public section bodies.
  const body = index instanceof Map ? String(index.get(entry.id) || '') : '';
  const text = [title, id, tags, category, summary, body].join(' ');
  if (!terms.every(term => text.includes(term))) return null;
  const phrase = terms.join(' ');
  let rank = 0;
  if (title === phrase) rank += 160;
  else if (title.startsWith(phrase)) rank += 105;
  else if (title.includes(phrase)) rank += 85;
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
  return rank;
}

export function filterDiscoveryEntries(entries, {
  query = '', path = [], sort = 'relevance', searchIndex = null
} = {}) {
  const terms = discoveryTerms(query);
  const prefix = normalizeCategoryPath(path);
  const matches = [];
  for (const entry of entries || []) {
    if (!isCategoryPrefix(entry, prefix)) continue;
    const score = scoreOne(entry, terms, searchIndex);
    if (score === null) continue;
    matches.push({ entry, score });
  }
  const compareTitle = (a,b) => a.entry.title.localeCompare(b.entry.title,'en') ||
    a.entry.id.localeCompare(b.entry.id,'en');
  matches.sort((a,b) => {
    if (sort === 'za') return -compareTitle(a,b);
    if (sort === 'az' || !terms.length) return compareTitle(a,b);
    return b.score-a.score || compareTitle(a,b);
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
