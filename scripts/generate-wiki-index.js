const fs = require('fs');
const path = require('path');
const { itemClasses, collections } = require('./wiki-engine-config');

const root = path.resolve(__dirname, '..');
const combinedOutputPath = path.join(root, 'js', 'wiki-index.js');

function toWebPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativeWebPath(filePath) {
  return toWebPath(path.relative(root, filePath));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed === '[]') return [];
  if (/^\[.*\]$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1).trim();
    return inner ? inner.split(',').map(part => parseScalar(part)) : [];
  }
  return trimmed.replace(/^["']|["']$/g, '');
}

function parseFrontmatter(frontmatter) {
  const metadata = {};
  let currentKey = null;

  frontmatter.split(/\r?\n/).forEach(rawLine => {
    if (!rawLine.trim()) return;

    const listItem = rawLine.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(metadata[currentKey])) metadata[currentKey] = [];
      metadata[currentKey].push(parseScalar(listItem[1]));
      return;
    }

    const pair = rawLine.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
    if (!pair) return;

    const key = pair[1];
    const rawValue = pair[2] || '';
    metadata[key] = parseScalar(rawValue);
    currentKey = rawValue.trim() === '' ? key : null;
  });

  return metadata;
}

function splitMarkdown(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { metadata: {}, body: text.trim() };
  return {
    metadata: parseFrontmatter(match[1]),
    body: text.slice(match[0].length).trim()
  };
}

function listValue(value) {
  return Array.isArray(value) ? value : [];
}

function readItem(collection, rarity, category, itemDir) {
  const indexPath = path.join(itemDir, 'index.md');
  if (!fs.existsSync(indexPath)) return null;

  const markdown = fs.readFileSync(indexPath, 'utf8');
  const parsed = splitMarkdown(markdown);
  const title = parsed.metadata.title || path.basename(itemDir);
  const slug = slugify(parsed.metadata.slug || title || path.basename(itemDir));
  const image = parsed.metadata.image || `${slug}.png`;
  const folder = relativeWebPath(itemDir);
  const itemClass = parsed.metadata.item_class || rarity.label;
  const categoryName = parsed.metadata.category || category.defaultItemCategory || category.label;

  return {
    title,
    slug,
    collection: collection.id,
    kingdom: parsed.metadata.kingdom || collection.kingdom || collection.title,
    item_class: itemClass,
    itemClassSlug: slugify(itemClass),
    rarityFolder: rarity.folder,
    raritySlug: rarity.slug,
    rarityOrder: rarity.order,
    category: categoryName,
    categorySlug: category.slug,
    categoryLabel: category.label,
    subcategory: parsed.metadata.subcategory || '',
    habitats: listValue(parsed.metadata.habitats),
    climate: parsed.metadata.climate || '',
    regions: listValue(parsed.metadata.regions),
    harvest_season: listValue(parsed.metadata.harvest_season),
    mana_density: parsed.metadata.mana_density || '',
    toxicity: parsed.metadata.toxicity || '',
    growth_difficulty: parsed.metadata.growth_difficulty || '',
    market_value: parsed.metadata.market_value || '',
    affinities: listValue(parsed.metadata.affinities),
    crafting_uses: listValue(parsed.metadata.crafting_uses),
    alchemy_uses: listValue(parsed.metadata.alchemy_uses),
    culinary_uses: listValue(parsed.metadata.culinary_uses),
    tags: listValue(parsed.metadata.tags),
    metadata: parsed.metadata,
    image,
    imagePath: `${folder}/${image}`,
    folder,
    contentPath: relativeWebPath(indexPath),
    route: `${collection.routeRoot}/${rarity.slug}/${category.slug}/${slug}`,
    body: parsed.body
  };
}

function scanCollection(collection) {
  const collectionRoot = path.join(root, collection.root);
  const items = [];

  itemClasses.forEach(rarity => {
    collection.categories.forEach(category => {
      const categoryDir = path.join(collectionRoot, rarity.folder, category.slug);
      if (!fs.existsSync(categoryDir)) return;

      fs.readdirSync(categoryDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .forEach(entry => {
          const item = readItem(collection, rarity, category, path.join(categoryDir, entry.name));
          if (item) items.push(item);
        });
    });
  });

  return {
    version: 'asteria-wiki-index-v1',
    generatedAt: new Date().toISOString(),
    id: collection.id,
    title: collection.title,
    singular: collection.singular,
    root: collection.root,
    routeRoot: collection.routeRoot,
    kingdom: collection.kingdom || collection.title,
    rarities: itemClasses,
    categories: collection.categories,
    filterLabels: collection.filterLabels || {},
    summaryFields: collection.summaryFields || [],
    routes: {
      index: collection.routeRoot,
      rarities: Object.fromEntries(itemClasses.map(rarity => [rarity.slug, `${collection.routeRoot}/${rarity.slug}`])),
      categories: Object.fromEntries(collection.categories.map(category => [category.slug, `${collection.routeRoot}/${category.slug}`]))
    },
    items: items.sort((a, b) =>
      a.rarityOrder - b.rarityOrder ||
      a.categoryLabel.localeCompare(b.categoryLabel) ||
      a.title.localeCompare(b.title)
    )
  };
}

function createOutput(indexes, sourceLabel) {
  const globalAssignments = Object.entries(indexes)
    .map(([id, index]) => {
      const globalName = collections[id]?.globalName;
      return globalName ? `  window.${globalName} = indexes[${JSON.stringify(id)}];` : '';
    })
    .filter(Boolean)
    .join('\n');

  return `/* Generated by ${sourceLabel}. Do not edit directly. */\n(function(){\n  const indexes = ${JSON.stringify(indexes, null, 2)};\n  window.ASTERIA_WIKI_INDEXES = indexes;\n${globalAssignments}\n})();\n`;
}

function writeLegacyOutputs(indexes) {
  Object.entries(indexes).forEach(([id, index]) => {
    const legacyOutput = collections[id]?.legacyOutput;
    if (!legacyOutput) return;

    const outputPath = path.join(root, legacyOutput);
    const globalName = collections[id].globalName;
    const output = `/* Generated by scripts/generate-wiki-index.js. Do not edit directly. */\n(function(){\n  const index = ${JSON.stringify(index, null, 2)};\n  window.ASTERIA_WIKI_INDEXES = window.ASTERIA_WIKI_INDEXES || {};\n  window.ASTERIA_WIKI_INDEXES[${JSON.stringify(id)}] = index;\n  window.${globalName} = index;\n})();\n`;

    fs.writeFileSync(outputPath, output, 'utf8');
  });
}

function generate(requestedIds = Object.keys(collections)) {
  const selected = requestedIds.filter(id => collections[id]);
  const indexes = {};

  selected.forEach(id => {
    indexes[id] = scanCollection(collections[id]);
  });

  fs.writeFileSync(combinedOutputPath, createOutput(indexes, 'scripts/generate-wiki-index.js'), 'utf8');
  writeLegacyOutputs(indexes);

  const count = Object.values(indexes).reduce((total, index) => total + index.items.length, 0);
  console.log(`Generated ${relativeWebPath(combinedOutputPath)} with ${selected.length} collection(s) and ${count} item(s).`);
  return indexes;
}

if (require.main === module) {
  const ids = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
  generate(ids.length ? ids : Object.keys(collections));
}

module.exports = {
  generate,
  scanCollection,
  slugify,
  collections,
  itemClasses
};
