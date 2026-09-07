function textValue(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const joined = value.filter(Boolean).map(String).join(', ').trim();
      if (joined) return joined;
      continue;
    }
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeSpellCompendiumEntry(entry = {}) {
  const metadata = entry.metadata || {};
  const filters = entry.filters || {};
  const name = textValue(entry.title, entry.name, metadata.title);
  if (!name) return null;

  const element = textValue(
    metadata.magicalElement,
    metadata.magicType,
    filters.magicType,
    filters.element,
    metadata.element,
    entry.category,
    entry.categoryPath?.[entry.categoryPath.length - 1],
    'Unaligned'
  );

  return {
    id:textValue(entry.id, `spell:${slug(name)}`),
    slug:textValue(entry.slug, slug(name)),
    name,
    title:name,
    element,
    rank:textValue(metadata.spellRank, metadata.rank, filters.rank, 'Unranked'),
    manaCost:textValue(metadata.manaCost, metadata.cost, metadata.mpCost),
    image:textValue(entry.imagePath, entry.images?.symbol, entry.images?.image, metadata.image),
    summary:textValue(entry.summary, entry.description, metadata.summary, 'Spell information coming soon.'),
    route:textValue(entry.route),
    sourcePath:textValue(entry.sourcePath)
  };
}

export function normalizeSpellCompendiumEntries(entries = []) {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : [])
    .map(normalizeSpellCompendiumEntry)
    .filter(Boolean)
    .filter(spell => {
      const key = `${spell.slug}:${spell.element}:${spell.rank}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildSpellbookItem(spell, overrides = {}) {
  if (!spell?.name) throw new Error('Select a spell from the Spell Compendium.');
  const bookName = textValue(overrides.name, `${spell.name} Spellbook`);
  const description = textValue(
    overrides.description,
    `A spellbook containing ${spell.name}. ${spell.summary || ''}`
  );

  return {
    ...overrides,
    name:bookName,
    title:bookName,
    trueName:bookName,
    type:'Spellbook',
    category:'Spellbook',
    itemType:'Spellbook',
    basicName:'Book',
    isSpellbook:true,
    identified:true,
    image:textValue(overrides.image, spell.image),
    description,
    compendiumSpellId:spell.id,
    compendiumSpellSlug:spell.slug,
    compendiumSpellRoute:spell.route,
    sourceSpellPath:spell.sourcePath,
    spell:{
      id:spell.id,
      slug:spell.slug,
      name:spell.name,
      title:spell.name,
      element:spell.element,
      magicType:spell.element,
      rank:spell.rank,
      manaCost:spell.manaCost,
      cost:spell.manaCost,
      image:spell.image,
      summary:spell.summary,
      route:spell.route,
      sourcePath:spell.sourcePath
    }
  };
}
