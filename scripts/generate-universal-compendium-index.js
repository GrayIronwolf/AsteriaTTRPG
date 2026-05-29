const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outputJs = path.join(root, 'js', 'universal-compendium-index.js');
const outputJson = path.join(root, 'data', 'universal-compendium-index.json');
const contentExtensions = new Set(['.md', '.mdx']);

const supportedRoots = [
  'content',
  'classes',
  'creatures',
  'races',
  'items',
  'spells',
  'talents',
  'professions',
  'skills',
  'origins',
  'locations',
  'religions',
  'gods',
  'factions',
  'lore'
];

const domainAliases = {
  race: 'race',
  races: 'race',
  class: 'class',
  classes: 'class',
  creature: 'creature',
  creatures: 'creature',
  item: 'item',
  items: 'item',
  flora: 'item',
  mineral: 'item',
  minerals: 'item',
  material: 'item',
  materials: 'item',
  spell: 'spell',
  spells: 'spell',
  magic: 'spell',
  talent: 'talent',
  talents: 'talent',
  profession: 'profession',
  professions: 'profession',
  skill: 'skill',
  skills: 'skill',
  origin: 'origin',
  origins: 'origin',
  background: 'origin',
  backgrounds: 'origin',
  location: 'location',
  locations: 'location',
  world: 'location',
  worlds: 'location',
  realm: 'location',
  realms: 'location',
  plane: 'location',
  planes: 'location',
  religion: 'religion',
  religions: 'religion',
  god: 'religion',
  gods: 'religion',
  pantheon: 'religion',
  pantheons: 'religion',
  faction: 'faction',
  factions: 'faction',
  guild: 'faction',
  guilds: 'faction',
  organization: 'faction',
  organizations: 'faction',
  organisation: 'faction',
  organisations: 'faction',
  lore: 'lore',
  history: 'lore',
  histories: 'lore',
  timeline: 'lore',
  timelines: 'lore',
  legend: 'lore',
  legends: 'lore'
};

const domainLabels = {
  race: 'Race Compendium',
  class: 'Class Compendium',
  creature: 'Creature Compendium',
  item: 'Item Compendium',
  spell: 'Spell Compendium',
  talent: 'Talent Compendium',
  profession: 'Profession Compendium',
  skill: 'Skill Compendium',
  origin: 'Origin Compendium',
  location: 'Location Compendium',
  religion: 'Religion & Gods Compendium',
  faction: 'Faction Compendium',
  lore: 'Lore Compendium',
  handbook: 'Asteria Handbook'
};

const workspaceSections = {
  race: 'Races',
  class: 'Classes',
  creature: 'Creatures',
  item: 'Items',
  spell: 'Magic',
  talent: 'Classes',
  profession: 'Asteria Handbook',
  skill: 'Asteria Handbook',
  origin: 'Asteria Handbook',
  location: 'World, Realms & Planes',
  religion: 'World, Realms & Planes',
  faction: 'Factions',
  lore: 'Asteria Handbook',
  handbook: 'Asteria Handbook'
};

const tabTemplates = {
  race: ['Overview','Racial Sheet','Lore','Culture','Historical Figures','Settlements','Relations','Traits & Biology','Gallery','GM Notes'],
  class: ['Overview','Class Information','Mechanics','Progression','Talent Trees','Pathways','Equipment','Lore','Gallery','GM Notes'],
  creature: ['Overview','Stat Sheet','Lore','Habitat','Behaviour','Combat','Loot & Drops','Soul Information','Variants','Encounter Use','Gallery','GM Notes'],
  item: ['Overview','Properties','Crafting','Lore','Sources','Gallery','GM Notes'],
  spell: ['Overview','Casting','Scaling','Lore','Sources','GM Notes'],
  talent: ['Overview','Ranks','Prerequisites','Scaling','Synergy','GM Notes'],
  profession: ['Overview','Progression','Tools','Recipes','Lore','GM Notes'],
  skill: ['Overview','Ranks','Checks','Training','Lore','GM Notes'],
  origin: ['Overview','Background','Family','Story Hooks','Lore','GM Notes'],
  location: ['Overview','Map Notes','Regions','Factions','Lore','Encounters','GM Notes'],
  religion: ['Overview','Doctrine','Gods','Followers','Rituals','Lore','GM Notes'],
  faction: ['Overview','Influence','Members','Relations','Holdings','History','Hooks','GM Notes'],
  lore: ['Overview','Chronicle','People','Places','Artifacts','Related','GM Notes'],
  handbook: ['Overview','Rules','Examples','Related','GM Notes']
};

const sharedFilterKeys = [
  'category',
  'rarity',
  'role',
  'size',
  'biome',
  'habitat',
  'region',
  'faction',
  'pantheon',
  'deity',
  'divineDomain',
  'spellSchool',
  'element',
  'damageType',
  'castingType',
  'rank',
  'talentTier',
  'professionType',
  'skillRank',
  'locationType',
  'settlementType',
  'alignment',
  'availability',
  'playable',
  'climate',
  'language',
  'threatTier',
  'levelRange',
  'magicType',
  'essenceAffinity',
  'loreStatus',
  'status',
  'visibility'
];

const domainFilterFields = {
  race: ['category','region','essenceAffinity','size','playable','language','loreStatus','visibility'],
  class: ['category','role','magicType','difficulty','primaryStat','secondaryStat','availability','visibility'],
  creature: ['category','threatTier','levelRange','size','biome','habitat','hostility','magical','boss','soulTier','encounterRole','visibility'],
  item: ['category','rarity','itemType','craftingCategory','materialType','affinity','source','visibility'],
  spell: ['category','spellSchool','magicType','element','damageType','castingType','rank','visibility'],
  talent: ['category','talentTier','role','primaryStat','className','rank','visibility'],
  profession: ['category','professionType','toolType','craftingCategory','region','rank','visibility'],
  skill: ['category','skillRank','primaryStat','trainingType','visibility'],
  origin: ['category','region','faction','status','visibility'],
  location: ['category','locationType','region','biome','climate','faction','settlementType','visibility'],
  religion: ['category','pantheon','deity','divineDomain','alignment','region','visibility'],
  faction: ['category','factionType','region','alignment','influence','status','visibility'],
  lore: ['category','era','region','faction','loreStatus','visibility'],
  handbook: ['category','status','visibility']
};

const databaseDefinitions = Object.fromEntries(Object.keys(domainLabels).map(domain => [domain, {
  domain,
  label: domainLabels[domain],
  workspaceSection: workspaceSections[domain] || workspaceSections.handbook,
  roots: supportedRoots.filter(rootName => rootName === domain || rootName === `${domain}s` || domainAliases[rootName] === domain),
  routeBase: `/compendium/${domain}`,
  tabs: tabTemplates[domain] || tabTemplates.handbook,
  filterFields: domainFilterFields[domain] || sharedFilterKeys,
  visibilityLevels: ['public','player','gm-only']
}]));

const filterAliases = {
  rarity: ['itemClass','item_class','rarity'],
  itemType: ['itemType','item_type'],
  craftingCategory: ['craftingCategory','crafting_category','category'],
  materialType: ['materialType','material_type'],
  source: ['source','sourcebook','originSource','origin_source'],
  role: ['role','partyRole','party_role','encounterRole','encounter_role'],
  size: ['size'],
  biome: ['biome','biomes'],
  habitat: ['habitat','habitats'],
  region: ['region','regions'],
  faction: ['faction','factions','relatedFactions','related_factions'],
  pantheon: ['pantheon','pantheons'],
  deity: ['deity','god','gods'],
  divineDomain: ['divineDomain','divine_domain','domain','domains'],
  spellSchool: ['spellSchool','spell_school','school','magicSchool','magic_school'],
  element: ['element','elements','affinity','affinities'],
  damageType: ['damageType','damage_type'],
  castingType: ['castingType','casting_type'],
  rank: ['rank','spellRank','spell_rank'],
  talentTier: ['talentTier','talent_tier','tier'],
  professionType: ['professionType','profession_type'],
  skillRank: ['skillRank','skill_rank','rank'],
  locationType: ['locationType','location_type'],
  settlementType: ['settlementType','settlement_type'],
  factionType: ['factionType','faction_type'],
  alignment: ['alignment'],
  influence: ['influence','influenceLevel','influence_level'],
  era: ['era','age','timeline'],
  availability: ['availability','playable'],
  playable: ['playable'],
  climate: ['climate'],
  language: ['language','languages'],
  threatTier: ['threatTier','threat_tier'],
  levelRange: ['levelRange','level_range'],
  hostility: ['hostility'],
  magical: ['magical'],
  boss: ['boss'],
  soulTier: ['soulTier','soul_tier'],
  encounterRole: ['encounterRole','encounter_role'],
  magicType: ['magicType','magic_type'],
  essenceAffinity: ['essenceAffinity','essence_affinity','affinity','affinities'],
  primaryStat: ['primaryStat','primary_stat'],
  secondaryStat: ['secondaryStat','secondary_stat'],
  className: ['className','class_name','class'],
  difficulty: ['difficulty'],
  toolType: ['toolType','tool_type'],
  trainingType: ['trainingType','training_type'],
  loreStatus: ['loreStatus','lore_status','loreVisibility','lore_visibility'],
  status: ['status'],
  visibility: ['visibility']
};

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry';
}

function normalizeKey(value) {
  return slugify(value).replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function toWebPath(value) {
  return value.split(path.sep).join('/');
}

function relativeWebPath(filePath) {
  return toWebPath(path.relative(root, filePath));
}

function isDeprecatedLooseResourcePath(filePath) {
  const normalized = relativeWebPath(filePath).toLowerCase().replace(/&/g, 'and');
  return [
    'content/items/resources and materials/ores/',
    'content/items/resources and materials/ingots/',
    'content/items/resources and materials/metal ores/',
    'content/items/resources and materials/metal ingots/'
  ].some(fragment => normalized.includes(fragment));
}

function isCollectionIndexPath(filePath) {
  const normalized = relativeWebPath(filePath).toLowerCase();
  return /(^|\/)content\/(flora|minerals|materials)\/index\.md$/.test(normalized);
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed === '[]') return [];
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^\[.*\]$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1).trim();
    return inner ? inner.split(',').map(part => parseScalar(part)) : [];
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

function parseFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const metadata = {};
  if (!match) return metadata;

  let currentKey = null;
  match[1].split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(metadata[currentKey])) metadata[currentKey] = [];
      metadata[currentKey].push(parseScalar(listItem[1]));
      return;
    }
    const pair = line.match(/^([A-Za-z0-9_ -]+):(?:\s*(.*))?$/);
    if (!pair) return;
    const key = normalizeKey(pair[1]);
    const rawValue = pair[2] || '';
    metadata[key] = parseScalar(rawValue);
    currentKey = rawValue.trim() === '' ? key : null;
  });
  return metadata;
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`Skipping invalid metadata JSON: ${relativeWebPath(filePath)}`);
    return {};
  }
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function firstMetadataValue(metadata, keys) {
  for (const key of keys) {
    if (metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '') return metadata[key];
  }
  return '';
}

function filterValue(metadata, keys) {
  return arrayValue(firstMetadataValue(metadata, keys)).join(', ');
}

function metadataFilters(metadata) {
  const filters = {};
  Object.entries(filterAliases).forEach(([field, keys]) => {
    const value = filterValue(metadata, keys);
    if (value !== '') filters[field] = value;
  });
  return filters;
}

function titleCase(value) {
  return String(value || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

function detectDomain(parts, metadata = {}) {
  const explicit = String(metadata.type || metadata.domain || metadata.compendium || metadata.kingdom || '').toLowerCase();
  const joined = parts.join(' ').toLowerCase();
  const candidates = [explicit, ...parts.map(part => part.toLowerCase()), joined];
  for (const candidate of candidates) {
    const key = slugify(candidate);
    if (domainAliases[key]) return domainAliases[key];
    for (const [alias, domain] of Object.entries(domainAliases)) {
      if (candidate.includes(alias)) return domain;
    }
  }
  return 'handbook';
}

function itemCategoryPartsFor(contentParts, metadata = {}) {
  const collection = slugify(contentParts[0]);
  const category = slugify(contentParts[2] || '');
  const title = slugify(metadata.title || metadata.name || contentParts[contentParts.length - 1] || '');
  const metaCategory = slugify(metadata.category || '');
  const text = [title, category, metaCategory, slugify(metadata.subcategory || ''), slugify(metadata.material_family || '')].join(' ');

  if (collection === 'minerals' && (category === 'ores' || metaCategory === 'ore' || title.endsWith('ore'))) {
    return ['Resources & Materials', 'Metal', 'Metal Ores'];
  }
  if (collection === 'materials' && (title.includes('ingot') || metaCategory === 'ingot' || text.includes('ingot'))) {
    return ['Resources & Materials', 'Metal', 'Metal Ingots'];
  }
  if (collection === 'materials' && (category === 'metals' || text.includes('metal'))) {
    return ['Resources & Materials', 'Metal'];
  }
  if (collection === 'flora') return ['Resources & Materials', 'Herbalist & Plants'];
  if (collection === 'minerals') return ['Resources & Materials', 'Gems, Stone & Cores'];
  if (collection === 'materials' && ['fibres', 'woods'].includes(category)) return ['Resources & Materials', 'Cloths & Fibre'];
  if (collection === 'materials' && category === 'leathers') return ['Resources & Materials', 'Leather Work'];
  return ['Resources & Materials'];
}

function categoryPartsFor(filePath, domain, rootName, metadata = {}) {
  const rel = toWebPath(path.relative(root, filePath));
  const parts = rel.split('/');
  const withoutFile = parts.slice(0, -1);

  if (rootName === 'classes' || rootName === 'creatures') return withoutFile.slice(1, -1).map(titleCase);
  if (rootName !== 'content') return withoutFile.slice(1, -1).map(titleCase);

  const contentParts = withoutFile.slice(1);
  if (['flora','minerals','materials'].includes(contentParts[0])) return itemCategoryPartsFor(contentParts, metadata);
  if (contentParts.length && domainAliases[slugify(contentParts[0])]) return contentParts.slice(1, -1).map(titleCase);
  return contentParts.slice(0, -1).map(titleCase);
}

function headingTitle(markdown) {
  const heading = stripFrontmatter(markdown).match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : '';
}

function descriptionFromBody(markdown) {
  const cleaned = stripFrontmatter(markdown)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('|') && !/^---+$/.test(line))
    .join(' ');
  return cleaned.slice(0, 260) || 'Information coming soon.';
}

function markdownSections(markdown) {
  const sections = {};
  let current = 'Overview';
  sections[current] = [];

  stripFrontmatter(markdown).split(/\r?\n/).forEach(line => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1].trim();
      sections[current] = sections[current] || [];
      return;
    }
    sections[current] = sections[current] || [];
    sections[current].push(line);
  });

  return Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join('\n').trim()]));
}

function findImages(dir, metadata = {}) {
  const images = {};
  const imageKeys = ['image', 'symbol', 'classSymbol', 'creatureImage', 'portrait', 'artwork', 'icon'];
  imageKeys.forEach(key => {
    if (metadata[key]) images[key] = toWebPath(path.join(relativeWebPath(dir), metadata[key]));
  });

  if (!fs.existsSync(dir)) return images;
  fs.readdirSync(dir, { withFileTypes:true })
    .filter(entry => entry.isFile() && /\.(png|jpe?g|webp|gif|svg)$/i.test(entry.name))
    .forEach(entry => {
      const lower = entry.name.toLowerCase();
      const web = `${relativeWebPath(dir)}/${entry.name}`;
      if (lower.includes('female')) images.female = web;
      else if (lower.includes('male')) images.male = web;
      else if (lower.includes('symbol')) images.symbol = web;
      else if (!images.image) images.image = web;
    });

  return images;
}

function routeFor(domain, categoryPath, slug) {
  return `/compendium/${domain}/${categoryPath.map(slugify).join('/')}${categoryPath.length ? '/' : ''}${slug}`;
}

function entryFromMarkdown(filePath, rootName) {
  const dir = path.dirname(filePath);
  const markdown = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(markdown);
  const jsonMetadata = readJson(path.join(dir, 'metadata.json'));
  const metadata = { ...jsonMetadata, ...frontmatter };
  const rel = relativeWebPath(filePath);
  const relParts = rel.split('/');
  const domain = detectDomain(relParts, metadata);
  const title = metadata.title || metadata.name || headingTitle(markdown) || titleCase(path.basename(dir) === '.' ? path.basename(filePath, '.md') : path.basename(dir));
  const slug = slugify(metadata.slug || title);
  const categoryPath = categoryPartsFor(filePath, domain, rootName, metadata);
  const sourceFolder = relativeWebPath(dir);
  const images = findImages(dir, metadata);
  const visibility = String(metadata.visibility || metadata.status || 'public').toLowerCase();
  const gmOnly = visibility.includes('gm') || metadata.gmOnly === true || metadata.gm_only === true;

  return {
    id: `${domain}:${slugify(rel.replace(/\.[^.]+$/, ''))}`,
    title,
    slug,
    type: domain,
    domain,
    compendium: domainLabels[domain] || domainLabels.handbook,
    workspaceSection: workspaceSections[domain] || workspaceSections.handbook,
    categoryPath,
    category: categoryPath[categoryPath.length - 1] || domainLabels[domain] || 'Entries',
    route: metadata.route || routeFor(domain, categoryPath, slug),
    sourcePath: rel,
    sourceFolder,
    content: markdown,
    body: stripFrontmatter(markdown),
    sections: markdownSections(markdown),
    tabs: arrayValue(metadata.tabs).length ? arrayValue(metadata.tabs) : (tabTemplates[domain] || tabTemplates.handbook),
    summary: metadata.summary || metadata.description || descriptionFromBody(markdown),
    metadata,
    tags: arrayValue(metadata.tags),
    visibility: gmOnly ? 'gm-only' : (metadata.visibility || 'public'),
    gmOnly,
    images,
    imagePath: images.image || images.female || images.male || images.symbol || '',
    related: arrayValue(metadata.related || metadata.relatedItems || metadata.related_items),
    filters: Object.assign({
      category: categoryPath[categoryPath.length - 1] || '',
      loreStatus: metadata.loreStatus || metadata.lore_status || 'Common Knowledge'
    }, metadataFilters(metadata)),
    searchTerms: [
      title,
      domain,
      categoryPath.join(' '),
      JSON.stringify(metadata),
      stripFrontmatter(markdown)
    ].join(' ').toLowerCase()
  };
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  fs.readdirSync(dir, { withFileTypes:true }).forEach(entry => {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next, output);
    else if (entry.isFile() && contentExtensions.has(path.extname(entry.name).toLowerCase())) output.push(next);
  });
  return output;
}

function entryScore(entry) {
  let score = 0;
  if (entry.imagePath) score += 20;
  if (/content\/(flora|minerals|materials)\//.test(entry.sourcePath || '')) score += 15;
  score += Math.min(10, String(entry.body || '').length / 500);
  return score;
}

function dedupeEntries(entries) {
  const preferred = [...entries].sort((a, b) => entryScore(b) - entryScore(a));
  const seen = new Set();
  return preferred.filter(entry => {
    const key = entry.domain === 'item' ? `${entry.domain}:${entry.slug}` : entry.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generate() {
  const entries = [];
  supportedRoots.forEach(rootName => {
    const dir = path.join(root, rootName);
    walk(dir).forEach(filePath => {
      const base = path.basename(filePath).toLowerCase();
      if (base === 'readme.md' || base.startsWith('_')) return;
      if (isDeprecatedLooseResourcePath(filePath)) return;
      if (isCollectionIndexPath(filePath)) return;
      entries.push(entryFromMarkdown(filePath, rootName));
    });
  });

  const sortedEntries = dedupeEntries(entries).sort((a, b) =>
    a.domain.localeCompare(b.domain) ||
    a.categoryPath.join('/').localeCompare(b.categoryPath.join('/')) ||
    a.title.localeCompare(b.title)
  );

  const index = {
    version: 'asteria-phase-2-content-database-expansion',
    generatedAt: new Date().toISOString(),
    domains: domainLabels,
    databases: databaseDefinitions,
    supportedRoots,
    workspaceSections,
    filterFields: domainFilterFields,
    sharedFilterKeys,
    tabTemplates,
    entries: sortedEntries
  };

  fs.mkdirSync(path.dirname(outputJson), { recursive:true });
  fs.writeFileSync(outputJson, JSON.stringify(index, null, 2), 'utf8');
  fs.writeFileSync(outputJs, `/* Generated by scripts/generate-universal-compendium-index.js. Do not edit directly. */\n(function(){\n  window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX = ${JSON.stringify(index, null, 2)};\n})();\n`, 'utf8');

  console.log(`Generated ${relativeWebPath(outputJs)} and ${relativeWebPath(outputJson)} with ${sortedEntries.length} universal entries.`);
  return index;
}

if (require.main === module) generate();

module.exports = {
  generate,
  parseFrontmatter,
  stripFrontmatter,
  slugify,
  detectDomain,
  tabTemplates,
  databaseDefinitions,
  domainFilterFields
};
