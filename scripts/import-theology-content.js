const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contentRoot = path.join(root, 'content');
const outputRoot = path.join(contentRoot, 'theology');
const defaultSourceRoot = 'C:\\Users\\jaida\\OneDrive\\Desktop\\DND CAMPAIGN\\Locked - DnD Campaign\\3. Asteria - DND Handbook\\THEOLOGY';
const sourceRoot = process.env.ASTERIA_THEOLOGY_SOURCE || defaultSourceRoot;

const requestedCategories = [
  'Primordials',
  'Pantheon of Elements',
  'Aetherion Pantheon',
  'The Outsiders',
  'The Nethyros Pantheon',
  'Dark Court',
  'Light Court',
  'Veilborn Court',
  'The Shadow Court'
];

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry';
}

function toWebPath(value) {
  return String(value || '').split(path.sep).join('/');
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function stripNumberPrefix(value) {
  return String(value || '').replace(/^\s*\d+\.\s*/, '').trim();
}

function yamlString(value) {
  return JSON.stringify(String(value || ''));
}

function yamlArray(values) {
  const list = values.filter(Boolean);
  return list.length ? list.map(value => `  - ${yamlString(value)}`).join('\n') : '[]';
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(next, output);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) output.push(next);
  });
  return output;
}

function categoryFor(relativeSegments) {
  const cleaned = relativeSegments.map(stripNumberPrefix);
  const joined = cleaned.join(' / ').toLowerCase();

  if (joined.includes('primordial')) return 'Primordials';
  if (joined.includes('pantheon of elements')) return 'Pantheon of Elements';
  if (joined.includes('aetherion pantheon')) return 'Aetherion Pantheon';
  if (joined.includes('outsider')) return 'The Outsiders';
  if (joined.includes('nethyros pantheon')) return 'The Nethyros Pantheon';
  if (joined.includes('dark court')) return 'Dark Court';
  if (joined.includes('light court')) return 'Light Court';
  if (joined.includes('veilborn court')) return 'Veilborn Court';
  if (joined.includes('shadow court')) return 'The Shadow Court';
  return 'Theology';
}

function extractExplicitName(body) {
  const patterns = [
    /^\s*#{1,4}\s*Name:\s*_?(.+?)_?\s*$/im,
    /^\s*#{1,4}\s*\*\*Name:\*\*\s*_?(.+?)_?\s*$/im,
    /^\s*\*\*Name:\*\*\s*_?(.+?)_?\s*$/im,
    /^\s*Name:\s*_?(.+?)_?\s*$/im
  ];
  for (const pattern of patterns) {
    const match = String(body || '').match(pattern);
    if (match && match[1]) return match[1].replace(/\*\*/g, '').replace(/^_+|_+$/g, '').trim();
  }
  return '';
}

function extractField(body, fieldName) {
  const pattern = new RegExp(`^\\s*(?:#{1,4}\\s*)?(?:\\*\\*)?${fieldName}(?:\\*\\*)?\\s*:\\s*(.+)$`, 'im');
  const match = String(body || '').match(pattern);
  return match && match[1] ? match[1].replace(/\*\*/g, '').replace(/^_+|_+$/g, '').trim() : '';
}

function cleanTitleFromFile(file) {
  const base = stripNumberPrefix(path.basename(file, '.md'));
  return base
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s+$/, '')
    .trim();
}

function splitFilenameTitle(fileTitle) {
  const parts = String(fileTitle || '').split(/\s+-\s+/).map(part => part.trim()).filter(Boolean);
  return {
    name: parts[0] || fileTitle,
    descriptor: parts.slice(1).join(' - ')
  };
}

function titleFromFileAndBody(file, body) {
  const explicitName = extractExplicitName(body);
  if (explicitName) return explicitName;
  const fromFile = splitFilenameTitle(cleanTitleFromFile(file));
  return fromFile.name || 'Theology Entry';
}

function descriptorFrom(fileTitle, body) {
  const fromFile = splitFilenameTitle(fileTitle);
  const explicitDomains = extractField(body, 'Domains?');
  const explicitTitle = extractField(body, 'Titles?');
  return fromFile.descriptor || explicitDomains || explicitTitle || '';
}

function shouldSkip(file, body) {
  const basename = path.basename(file, '.md').toLowerCase();
  if (basename.includes('template')) return true;
  if (basename === 'ideas') return true;
  if (basename === 'primordial' && !extractExplicitName(body)) return true;
  if (basename.startsWith('_')) return true;
  if (basename.startsWith('untitled') && !extractExplicitName(body)) return true;
  return false;
}

function writePage(file, usedSlugs, counts) {
  const relative = path.relative(sourceRoot, file);
  const segments = relative.split(path.sep);
  const raw = fs.readFileSync(file, 'utf8');
  const body = stripFrontmatter(raw);
  if (shouldSkip(file, body)) return null;

  const fileTitle = cleanTitleFromFile(file);
  const category = categoryFor(segments.slice(0, -1));
  const title = titleFromFileAndBody(file, body);
  const descriptor = descriptorFrom(fileTitle, body);
  const baseSlug = slugify(title);
  let slug = baseSlug;
  let count = 2;
  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${count}`;
    count += 1;
  }
  usedSlugs.add(slug);

  const outDir = path.join(outputRoot, slug);
  fs.mkdirSync(outDir, { recursive: true });

  const tags = ['theology', 'deity', slugify(category)];
  const cleanedBody = body.trim() || 'Information coming soon.';
  const hasTopHeading = new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(cleanedBody);
  const contentBody = hasTopHeading ? cleanedBody : `# ${title}\n\n## Overview\n${cleanedBody}`;
  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `slug: ${yamlString(slug)}`,
    'type: theology',
    `category: ${yamlString(category)}`,
    `pantheon: ${yamlString(category)}`,
    `court: ${category.toLowerCase().includes('court') ? yamlString(category) : yamlString('')}`,
    `deity_title: ${yamlString(descriptor)}`,
    `divine_domain: ${yamlString(descriptor)}`,
    `domain: ${yamlString(descriptor)}`,
    `source_path: ${yamlString(toWebPath(relative))}`,
    'image: ""',
    'tags:',
    yamlArray(tags),
    'visibility: public',
    '---',
    ''
  ].join('\n');

  fs.writeFileSync(path.join(outDir, 'index.md'), `${frontmatter}${contentBody}\n`, 'utf8');
  counts[category] = (counts[category] || 0) + 1;
  return { title, slug, category };
}

function main() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`Theology source folder was not found: ${sourceRoot}`);
  }
  if (!path.resolve(outputRoot).startsWith(path.resolve(contentRoot))) {
    throw new Error(`Refusing to write outside content folder: ${outputRoot}`);
  }

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });

  const usedSlugs = new Set();
  const counts = Object.fromEntries(requestedCategories.map(category => [category, 0]));
  const entries = walk(sourceRoot)
    .map(file => writePage(file, usedSlugs, counts))
    .filter(Boolean)
    .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  const uncategorized = entries.filter(entry => !requestedCategories.includes(entry.category));
  if (uncategorized.length) {
    throw new Error(`Uncategorized Theology entries: ${uncategorized.map(entry => entry.title).join(', ')}`);
  }
  const primordials = entries.filter(entry => entry.category === 'Primordials');
  if (primordials.length !== 3) {
    throw new Error(`Theology audit expected exactly 3 Primordials, found ${primordials.length}: ${primordials.map(entry => entry.title).join(', ')}`);
  }

  const readme = [
    '# Theology Content',
    '',
    'This folder is generated from the Asteria Theology source notes.',
    '',
    'Each god, goddess, court, outsider, or primordial gets one folder with an `index.md` page.',
    'The compendium reads these pages through the shared content manifest and clean compendium index.',
    '',
    'To add a new theology entry later:',
    '',
    '1. Add a markdown file to the source Theology notes, or add a folder here using the same frontmatter fields.',
    '2. Set `type: theology`.',
    '3. Set `pantheon:` to one of the Theology category names.',
    '4. Add `image:` when artwork is ready.',
    '5. Regenerate the content indexes.',
    '',
    'Supported Theology categories:',
    ...requestedCategories.map(category => `- ${category}`)
  ].join('\n');
  fs.writeFileSync(path.join(outputRoot, 'README.md'), `${readme}\n`, 'utf8');

  console.log(`Imported ${entries.length} theology entries into ${toWebPath(path.relative(root, outputRoot))}.`);
  console.log(`Theology audit passed: ${primordials.length} Primordials and no uncategorized entries.`);
  requestedCategories.forEach(category => console.log(`${category}: ${counts[category] || 0}`));
}

main();
