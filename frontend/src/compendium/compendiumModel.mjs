/**
 * Pure, public route/group/domain and search semantics.
 * Do not import the private generated Compendium source.
 */
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
  rules: ['handbook','skill','profession'],
  adventures: ['lore','handbook'],
  characters: ['race','class','origin','spell','talent'],
  equipment: ['item'],
  crafting: ['item','profession']
});
const CATEGORY_DOMAINS = Object.freeze({
  races: ['race'], classes: ['class'], magic: ['spell','talent'],
  npcs: ['creature'], npc: ['creature'], creatures: ['creature'],
  worlds: ['location'], realms: ['location'], planes: ['location'],
  theology: ['religion'], factions: ['faction'], lore: ['lore'],
  resources: ['item'], blueprints: ['item'], recipes: ['item'],
  schematics: ['item'], patterns: ['item'], formulas: ['item'],
  designs: ['item'], core: ['handbook'], handbook: ['handbook'],
  gm: ['handbook','lore'], quests: ['lore'], systems: ['handbook','skill']
});

export function resolveCompendiumScope(query) {
  const params = query instanceof URLSearchParams ? query : new URLSearchParams(query ?? '');
  const explicit = params.get('domain');
  const category = String(params.get('category') ?? '').toLowerCase();
  const group = String(params.get('group') ?? '').toLowerCase();
  const domains = known.has(explicit)
    ? [explicit]
    : CATEGORY_DOMAINS[category] || GROUP_DOMAINS[group] || IDS;
  return Object.freeze({
    domainIds: Object.freeze([...domains]),
    search: String(params.get('q') ?? '').slice(0, 160),
    selectedDomain: known.has(explicit) ? explicit : '',
    group, category
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
