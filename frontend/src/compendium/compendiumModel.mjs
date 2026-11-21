/**
 * Pure, public route/group/domain and search semantics.
 * Do not import the private generated Compendium source.
 */
import {
  LEGACY_LIBRARY_GROUPS, getLibraryCategory, legacyLibraryCategory
} from './legacyLibrary.mjs';

export const PUBLIC_DOMAINS = Object.freeze([
  { id:'race', label:'Races' },
  { id:'class', label:'Classes' },
  { id:'creature', label:'Creatures & NPCs' },
  { id:'item', label:'Items & Materials' },
  { id:'spell', label:'Spells' },
  { id:'talent', label:'Talents' },
  { id:'profession', label:'Professions' },
  { id:'skill', label:'Skills' },
  { id:'origin', label:'Origins' },
  { id:'location', label:'Locations' },
  { id:'religion', label:'Theology' },
  { id:'faction', label:'Factions' },
  { id:'lore', label:'Lore' },
  { id:'handbook', label:'Handbook' }
]);

const IDS = PUBLIC_DOMAINS.map(domain => domain.id);
const known = new Set(IDS);
const GROUP_DOMAINS = Object.freeze({
  world: ['location','religion','faction','lore','creature'],
  rules: ['handbook','skill','talent'],
  adventures: ['creature','lore','handbook'],
  characters: ['race','class','origin','spell'],
  equipment: ['item'],
  crafting: ['item','profession']
});
const CATEGORY_DOMAINS = Object.freeze({
  races: ['race'], classes: ['class'], magic: ['spell'], origins: ['origin'],
  talents: ['talent'], skills: ['skill'], conditions: ['handbook','lore'],
  npcs: ['creature','lore'], creatures: ['creature'], worlds: ['location'],
  theology: ['religion'], factions: ['faction'], lore: ['lore'],
  languages: ['handbook','lore'], resources: ['item'], items: ['item'],
  enchantments: ['item'], runestones: ['item'], blueprints: ['item'], recipes: ['item'],
  schematics: ['item'], patterns: ['item'], formulas: ['item'], designs: ['item'],
  structures: ['item','location'], core: ['handbook'], handbook: ['handbook'],
  gm: ['handbook','lore'], quests: ['lore'], professions: ['profession']
});
const categoryAliases = {npc:'npcs',realms:'worlds',planes:'worlds',design:'designs'};
const groups = new Set(LEGACY_LIBRARY_GROUPS.map(group => group.id));

export function resolveCompendiumScope(query, {legacyDomain = false} = {}) {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query ?? '');
  const explicit = params.get('domain');
  const selectedDomain = known.has(explicit) ? explicit : '';
  const rawCategory = (params.get('category') || '').toLowerCase();
  const category = legacyDomain ? undefined :
    getLibraryCategory(Object.hasOwn(categoryAliases,rawCategory) ? categoryAliases[rawCategory] : rawCategory);
  const rawGroup = (params.get('group') || '').toLowerCase();
  const group = category?.group || (groups.has(rawGroup) ? rawGroup : '');
  const domains = selectedDomain ? [selectedDomain] :
    CATEGORY_DOMAINS[category?.id] || GROUP_DOMAINS[group] || IDS;
  return Object.freeze({
    domainIds: Object.freeze([...domains]),
    search: String(params.get('q') ?? '').slice(0, 160),
    selectedDomain, group, category:category?.id || ''
  });
}

export function filterLibraryScope(entries,{selectedDomain,group,category},{favourites = null} = {}) {
  const saved = favourites === null ? null : new Set(favourites);
  return entries.filter(entry => {
    if (selectedDomain && selectedDomain !== entry.domain) return false;
    if (saved && !saved.has(entry.id)) return false;
    const classified = legacyLibraryCategory(entry);
    return (!category || category === classified) &&
      (!group || group === getLibraryCategory(classified)?.group);
  });
}

export function createCompendiumHref({ domain = '', query = '' } = {}) {
  const params = new URLSearchParams();
  if (known.has(domain)) params.set('domain', domain);
  const term = String(query).trim().slice(0, 160);
  if (term) params.set('q', term);
  const suffix = params.toString();
  return '#/compendium' + (suffix ? '?' + suffix : '');
}

export function filterPublicCatalogue(entries, { search = '', category = '' } = {}) {
  const term = String(search).trim().toLocaleLowerCase();
  const categoryTerm = String(category).trim().toLocaleLowerCase();
  return entries.filter(entry => {
    if (categoryTerm && (entry.categoryPath[0] || entry.category).toLocaleLowerCase() !== categoryTerm) return false;
    if (!term) return true;
    const haystack = [
      entry.title, entry.id, entry.domain, entry.summary,
      ...entry.categoryPath, ...entry.tags
    ].join(' ').toLocaleLowerCase();
    return haystack.includes(term);
  });
}

export function groupPublicCategories(entries) {
  const categories = new Set();
  for (const entry of entries) {
    const category = entry.categoryPath[0] || entry.category;
    if (typeof category === 'string' && category.trim()) categories.add(category);
  }
  return [...categories].sort((a,b) => a.localeCompare(b,'en'));
}
