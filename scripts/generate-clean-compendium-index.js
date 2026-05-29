const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contentRoot = path.join(root, 'content');
const outputPath = path.join(root, 'data', 'compendium-index-clean.json');
const itemClasses = ['Common','Uncommon','Unusual','Rare','Epic','Mythic','Legendary','Relic'];
const includedRoots = new Set([
  'Asteria Handbook',
  'Asteria Systems',
  'Skills',
  'Talents',
  'Professions',
  'Worlds, Realms & Planes',
  'Continents',
  'Shattered Zones',
  'Pantheons',
  'Kingdoms',
  'Timeline',
  'Races',
  'Classes',
  'Class Talents',
  'Talent Trees',
  'Pathways',
  'Items',
  'Spells',
  'Enchantment System',
  'Elements',
  'Soul Stones',
  'Runes',
  'Magic Items',
  'flora',
  'minerals',
  'materials'
]);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';
}

function normalizeKey(value) {
  return slugify(value).replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
}

function toWebPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isDeprecatedLooseResourcePath(relativePath) {
  const normalized = toWebPath(relativePath).toLowerCase().replace(/&/g, 'and');
  return [
    'items/resources and materials/ores/',
    'items/resources and materials/ingots/',
    'items/resources and materials/metal ores/',
    'items/resources and materials/metal ingots/'
  ].some(fragment => normalized.includes(fragment));
}

function isCollectionIndexPath(relativePath) {
  const normalized = toWebPath(relativePath).toLowerCase();
  return /(^|\/)(flora|minerals|materials)\/index\.md$/.test(normalized);
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed === '[]') return [];
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
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
    metadata[key] = parseScalar(pair[2] || '');
    currentKey = String(pair[2] || '').trim() === '' ? key : null;
  });

  return metadata;
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function arrayValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  fs.readdirSync(dir, { withFileTypes:true }).forEach(entry => {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next, output);
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(next);
  });
  return output;
}

function sectionFromCategory(category, metadata = {}) {
  const source = [category, metadata.type, metadata.category].join(' ').toLowerCase();
  if (source.includes('race')) return 'Races';
  if (source.includes('class') || source.includes('talent tree') || source.includes('pathway')) return 'Classes';
  if (source.includes('item') || source.includes('weapon') || source.includes('armour') || source.includes('armor') || source.includes('material') || source.includes('mineral') || source.includes('ore') || source.includes('ingot') || source.includes('consumable')) return 'Items';
  if (source.includes('spell') || source.includes('magic') || source.includes('enchantment') || source.includes('element') || source.includes('soul stone') || source.includes('rune')) return 'Magic';
  if (source.includes('world') || source.includes('realm') || source.includes('plane') || source.includes('continent') || source.includes('kingdom') || source.includes('pantheon') || source.includes('timeline')) return 'World, Realms & Planes';
  return 'Asteria Handbook';
}

function titleFromBody(file, body) {
  const heading = String(body || '').match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : path.basename(file, '.md');
}

function descriptionFromBody(markdown) {
  const cleaned = stripFrontmatter(markdown)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('|') && !/^---+$/.test(line))
    .join(' ');
  return cleaned.slice(0, 230) || 'Compendium page.';
}

function sectionListItems(body, headingPattern) {
  const values = [];
  let active = false;
  String(body || '').split(/\r?\n/).forEach(line => {
    if (/^##\s+/.test(line)) {
      active = headingPattern.test(line);
      return;
    }
    if (!active) return;
    const item = line.match(/^[-*]\s+(.+)$/);
    if (item) values.push(item[1].trim());
  });
  return values.slice(0, 4);
}

function structuredItemPlacement(parts, metadata = {}, title = '') {
  const collection = slugify(parts[0]);
  if (!['flora', 'minerals', 'materials'].includes(collection)) return null;
  if (parts.length < 5 || path.basename(parts[parts.length - 1]).toLowerCase() !== 'index.md') {
    return { skip: true };
  }

  const categoryFolder = slugify(parts[2] || '');
  const category = slugify(metadata.category || '');
  const text = [title, categoryFolder, category, metadata.subcategory, metadata.materialFamily, metadata.material_family].join(' ').toLowerCase();

  if (collection === 'minerals' && (categoryFolder === 'ores' || category === 'ore' || slugify(title).endsWith('ore'))) {
    return { section: 'Items', type: 'Ore', category: 'Metal Ores', categoryPath: ['Items','Resources & Materials','Metal','Metal Ores'] };
  }
  if (collection === 'materials' && (category === 'ingot' || text.includes('ingot'))) {
    return { section: 'Items', type: 'Ingot', category: 'Metal Ingots', categoryPath: ['Items','Resources & Materials','Metal','Metal Ingots'] };
  }
  if (collection === 'materials' && (categoryFolder === 'metals' || text.includes('metal'))) {
    return { section: 'Items', type: 'Material', category: 'Metal', categoryPath: ['Items','Resources & Materials','Metal'] };
  }
  if (collection === 'flora') {
    return { section: 'Items', type: metadata.category || 'Flora Item', category: 'Herbalist & Plants', categoryPath: ['Items','Resources & Materials','Herbalist & Plants'] };
  }
  if (collection === 'minerals') {
    return { section: 'Items', type: metadata.category || 'Mineral', category: 'Gems, Stone & Cores', categoryPath: ['Items','Resources & Materials','Gems, Stone & Cores'] };
  }
  if (collection === 'materials' && ['fibres', 'woods'].includes(categoryFolder)) {
    return { section: 'Items', type: metadata.category || 'Material', category: 'Cloths & Fibre', categoryPath: ['Items','Resources & Materials','Cloths & Fibre'] };
  }
  if (collection === 'materials' && categoryFolder === 'leathers') {
    return { section: 'Items', type: metadata.category || 'Material', category: 'Leather Work', categoryPath: ['Items','Resources & Materials','Leather Work'] };
  }
  return { section: 'Items', type: metadata.category || 'Item', category: 'Resources & Materials', categoryPath: ['Items','Resources & Materials'] };
}

function imagePathFor(file, metadata) {
  const image = metadata.image || metadata.icon || metadata.artwork || '';
  if (!image) return '';
  const imageFile = path.join(path.dirname(file), image);
  return fs.existsSync(imageFile) ? `content/${toWebPath(path.relative(contentRoot, imageFile))}` : '';
}

function entryFromFile(file) {
  const rel = path.relative(contentRoot, file);
  if (isDeprecatedLooseResourcePath(rel)) return null;
  if (isCollectionIndexPath(rel)) return null;
  const parts = rel.split(path.sep);
  const top = parts[0];
  if (!includedRoots.has(top)) return null;
  if (path.basename(file).toLowerCase() === 'readme.md' || path.basename(file).startsWith('_')) return null;

  const content = fs.readFileSync(file, 'utf8');
  const metadata = parseFrontmatter(content);
  if (String(metadata.visibility || 'public').toLowerCase().includes('gm')) return null;

  const body = stripFrontmatter(content);
  const title = titleFromBody(file, body);
  const structuredPlacement = structuredItemPlacement(parts, metadata, title);
  if (structuredPlacement?.skip) return null;
  const categoryPath = structuredPlacement?.categoryPath || parts.slice(0, -1);
  const section = structuredPlacement?.section || sectionFromCategory(categoryPath.join('/'), metadata);
  const type = structuredPlacement?.type || metadata.type || (section === 'Items' ? 'Item' : section.replace(/s$/, ''));
  const itemClass = metadata.itemClass || metadata.item_class || metadata.rarity || '';
  const raceCategory = metadata.raceCategory || metadata.racecategory || (section === 'Races' ? 'Humanoid' : '');
  const playable = metadata.playable === true || String(metadata.availability || '').toLowerCase() === 'playable';

  return {
    id: slugify(title),
    title,
    section,
    type,
    categoryPath,
    category: structuredPlacement?.category || categoryPath[categoryPath.length - 1] || section,
    rarity: itemClass || (section === 'Items' ? 'Common' : ''),
    rarityRank: Math.max(0, itemClasses.findIndex(item => item.toLowerCase() === String(itemClass).toLowerCase())),
    description: descriptionFromBody(content),
    sourcePath: `content/${toWebPath(rel)}`,
    tags: arrayValue(metadata.tags),
    metadata,
    playable,
    availability: section === 'Races' ? (playable ? 'playable' : 'non-playable') : '',
    raceCategory,
    size: metadata.size || (section === 'Races' ? 'Unknown' : ''),
    affinity: arrayValue(metadata.affinity || metadata.affinities),
    traits: section === 'Races' ? sectionListItems(body, /^##\s+(Racial\s+)?Traits/i) : [],
    marketValue: metadata.marketValue || metadata.market_value || '',
    damage: metadata.damage || '',
    content,
    imagePath: imagePathFor(file, metadata),
    searchTerms: [title, section, type, categoryPath.join(' '), content, JSON.stringify(metadata)].join(' ').toLowerCase()
  };
}

const entries = walk(contentRoot)
  .map(entryFromFile)
  .filter(Boolean)
  .sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title));

fs.writeFileSync(outputPath, JSON.stringify({
  version: 'asteria-unified-workspace-compendium-system-v1',
  generatedAt: new Date().toISOString(),
  entries
}, null, 2), 'utf8');

console.log(`Generated ${toWebPath(path.relative(root, outputPath))} with ${entries.length} entries.`);
