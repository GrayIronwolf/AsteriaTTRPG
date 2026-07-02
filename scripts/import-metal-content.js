const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourceRoot = 'C:\\Users\\jaida\\OneDrive\\Desktop\\DND CAMPAIGN\\Locked - DnD Campaign\\5. ITEMS\\RESOURCES & MATERIALS\\Metal';
const mineralsRoot = path.join(root, 'content', 'minerals');
const materialsRoot = path.join(root, 'content', 'materials');

const rarityFolders = new Map([
  ['1. Common', { folder: '1-common', label: 'Common' }],
  ['2. Uncommon', { folder: '2-uncommon', label: 'Uncommon' }],
  ['3. Unusual', { folder: '3-unusual', label: 'Unusual' }],
  ['4. Rare', { folder: '4-rare', label: 'Rare' }],
  ['5. Epic', { folder: '5-epic', label: 'Epic' }],
  ['6. Mythic', { folder: '6-mythic', label: 'Mythic' }],
  ['7. Legendary', { folder: '7-legendary', label: 'Legendary' }],
  ['8. Relic', { folder: '8-relic', label: 'Relic' }]
]);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function toTitle(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function keyName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, char) => char.toUpperCase());
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
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
    const key = keyName(pair[1]);
    const value = pair[2] || '';
    metadata[key] = parseScalar(value);
    currentKey = value.trim() === '' ? key : null;
  });

  return metadata;
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function yamlScalar(value) {
  const text = String(value || '');
  if (!text) return '';
  return /[:#\[\]{}&,*>|%@`"']|\s$|^\s/.test(text) ? JSON.stringify(text) : text;
}

function yamlList(key, values) {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!list.length) return `${key}: []`;
  return [`${key}:`, ...list.map(value => `  - ${yamlScalar(value)}`)].join('\n');
}

function normalizeBody(text, title) {
  const body = stripFrontmatter(text)
    .replace(/\r\n/g, '\n')
    .replace(/\uFFFD/g, '-')
    .trim();
  return `# ${title}\n\n${body || 'Information coming soon.'}\n`;
}

function repairText(value) {
  return String(value || '')
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '–')
    .replace(/â†’/g, '→')
    .replace(/â€œ/g, '“')
    .replace(/â€/g, '”')
    .replace(/â€˜/g, '‘')
    .replace(/â€™/g, '’')
    .replace(/â€¦/g, '…')
    .replace(/Â/g, '');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeItemDirectories(parentDir) {
  if (!fs.existsSync(parentDir)) return;
  fs.readdirSync(parentDir, { withFileTypes: true }).forEach(entry => {
    if (entry.isDirectory()) fs.rmSync(path.join(parentDir, entry.name), { recursive: true, force: true });
  });
}

function existingImageMap() {
  const map = new Map();
  const roots = [
    path.join(mineralsRoot),
    path.join(materialsRoot)
  ];
  roots.forEach(base => {
    if (!fs.existsSync(base)) return;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          return;
        }
        if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) return;
        const key = slugify(path.basename(entry.name, path.extname(entry.name)));
        if (!map.has(key) || /^[A-Z]/.test(entry.name)) {
          map.set(key, {
            name: entry.name,
            extension: path.extname(entry.name),
            data: fs.readFileSync(full)
          });
        }
      });
    }
  });
  return map;
}

function cleanMetalTargets() {
  for (const rarity of rarityFolders.values()) {
    removeItemDirectories(path.join(mineralsRoot, rarity.folder, 'ores'));
    removeItemDirectories(path.join(materialsRoot, rarity.folder, 'metals'));
  }
}

function sourceFiles(kind) {
  const dir = path.join(sourceRoot, kind);
  const files = [];
  for (const [folder, rarity] of rarityFolders.entries()) {
    const rarityDir = path.join(dir, folder);
    if (!fs.existsSync(rarityDir)) continue;
    fs.readdirSync(rarityDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .forEach(entry => files.push({ file: path.join(rarityDir, entry.name), rarity }));
  }
  return files;
}

function sourceItems(value) {
  const source = String(value || '').trim();
  if (!source) return [];
  return source
    .split(/\s*\+\s*|\s*,\s*/)
    .map(item => item.replace(/\[\[|\]\]/g, '').trim())
    .filter(Boolean);
}

function writeItem({ file, rarity }, kind, images) {
  const markdown = repairText(fs.readFileSync(file, 'utf8'));
  const metadata = parseFrontmatter(markdown);
  const title = path.basename(file, '.md').trim();
  const slug = slugify(title);
  const isOre = kind === 'Metal Ore';
  const targetRoot = isOre ? mineralsRoot : materialsRoot;
  const itemFolder = path.join(targetRoot, rarity.folder, isOre ? 'ores' : 'metals', slug);
  ensureDir(itemFolder);

  const imageSource = images.get(slug);
  const imageName = imageSource ? `${title}${imageSource.extension || '.png'}` : '';
  if (imageSource) fs.writeFileSync(path.join(itemFolder, imageName), imageSource.data);

  const tags = [
    'items',
    isOre ? 'minerals' : 'materials',
    'metal',
    isOre ? 'ore' : 'ingot',
    slugify(rarity.label)
  ];
  const sourceList = isOre ? [] : sourceItems(metadata.source);
  const refinesInto = isOre ? metadata.refinesInto || title.replace(/\s+Ore$/i, ' Ingot') : '';
  const materialFamily = title
    .replace(/\s+Ore$/i, '')
    .replace(/\s+Ingot$/i, '')
    .trim();

  const frontmatter = [
    '---',
    `title: ${yamlScalar(title)}`,
    `slug: ${slug}`,
    'type: item',
    `kingdom: ${isOre ? 'Mineral' : 'Material'}`,
    `item_class: ${metadata.itemClass || rarity.label}`,
    `category: ${isOre ? 'Ore' : 'Ingot'}`,
    'subcategory: Metal',
    'material_type: Metal',
    `material_form: ${yamlScalar(metadata.materialForm || (isOre ? 'Ore' : 'Ingot'))}`,
    `material_family: ${yamlScalar(materialFamily)}`,
    sourceList.length ? yamlList('source_items', sourceList) : 'source_items: []',
    refinesInto ? `refines_into: ${yamlScalar(refinesInto)}` : '',
    metadata.refinementRatio ? `refinement_ratio: ${yamlScalar(metadata.refinementRatio)}` : '',
    metadata.formationType ? `formation_type: ${yamlScalar(metadata.formationType)}` : '',
    metadata.weight ? `weight: ${yamlScalar(metadata.weight)}` : '',
    metadata.weightClass ? `weight_class: ${yamlScalar(metadata.weightClass)}` : '',
    metadata.durability ? `durability: ${yamlScalar(metadata.durability)}` : '',
    Array.isArray(metadata.elementalAlignment) ? yamlList('elemental_alignment', metadata.elementalAlignment) : '',
    metadata.enchantmentAffinity ? `enchantment_affinity: ${yamlScalar(metadata.enchantmentAffinity)}` : '',
    metadata.damageModifier ? `damage_modifier: ${yamlScalar(metadata.damageModifier)}` : '',
    metadata.armorModifier ? `armor_modifier: ${yamlScalar(metadata.armorModifier)}` : '',
    metadata.marketValue ? `market_value: ${yamlScalar(metadata.marketValue)}` : '',
    imageName ? `image: ${yamlScalar(imageName)}` : '',
    yamlList('tags', tags),
    'visibility: public',
    '---'
  ].filter(line => line !== '').join('\n');

  fs.writeFileSync(path.join(itemFolder, 'index.md'), `${frontmatter}\n\n${normalizeBody(markdown, title)}`, 'utf8');
  return { title, slug, itemClass: metadata.itemClass || rarity.label, target: path.relative(root, itemFolder) };
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Metal source folder not found: ${sourceRoot}`);
  }
  const images = existingImageMap();
  cleanMetalTargets();

  const imported = [
    ...sourceFiles('Metal Ore').map(item => writeItem(item, 'Metal Ore', images)),
    ...sourceFiles('Metal Ingot').map(item => writeItem(item, 'Metal Ingot', images))
  ].sort((a, b) => a.title.localeCompare(b.title));

  console.log(`Imported ${imported.length} metal ore/ingot entries.`);
  console.log(`Images preserved for ${imported.filter(item => fs.existsSync(path.join(root, item.target, `${item.title}.png`))).length} entries.`);
}

if (require.main === module) main();
