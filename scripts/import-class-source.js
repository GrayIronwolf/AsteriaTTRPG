const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const classRoot = path.join(root, 'content', 'classes');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith('--') ? argv[++index] : true;
  }
  return args;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry';
}

function readMarkdown(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, '');
}

function parseFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\n([\s\S]*?)\n---\n?/);
  const metadata = {};
  if (!match) return metadata;
  let listKey = '';
  match[1].split('\n').forEach(line => {
    const item = line.match(/^\s*-\s+(.+)$/);
    if (item && listKey) {
      if (!Array.isArray(metadata[listKey])) metadata[listKey] = [];
      metadata[listKey].push(parseScalar(item[1]));
      return;
    }
    const pair = line.match(/^([^:]+):(?:\s*(.*))?$/);
    if (!pair) return;
    const key = pair[1].trim();
    const raw = String(pair[2] || '').trim();
    metadata[key] = raw ? parseScalar(raw) : [];
    listKey = raw ? '' : key;
  });
  return metadata;
}

function metadataValue(metadata, keys, fallback = '') {
  const normalized = new Map(
    Object.entries(metadata).map(([key, value]) => [
      key.toLowerCase().replace(/[^a-z0-9]/g, ''),
      value
    ])
  );
  for (const key of keys) {
    const value = normalized.get(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return fallback;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''));
}

function firstHeading(markdown) {
  const match = stripFrontmatter(markdown).match(/^#[ \t]+([^\r\n]+)$/m);
  return match ? match[1].trim() : '';
}

function romanNumber(value) {
  const token = String(value || '').toUpperCase();
  return { I: 1, II: 2, III: 3, IV: 4, V: 5 }[token] || Number(token) || 0;
}

function rankFromText(value) {
  const match = String(value || '').match(/\brank\s*(?:[-:]\s*)?(IV|III|II|I|V|[1-5])\b/i);
  return match ? romanNumber(match[1]) : 0;
}

function cleanTalentTitle(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
    .replace(/\s*[—–-]\s*Rank\s*(?:IV|III|II|I|V|[1-5])\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return !cleaned
    || /^untitled(?:\s+\d+)?$/i.test(cleaned)
    || /^(?:#+\s*)?(?:description|effects|lore)$/i.test(cleaned)
    ? fallback
    : cleaned;
}

function demoteRankHeadings(markdown) {
  return String(markdown || '')
    .replace(/^#\s+.+(?:—|–|-)\s*Rank\s*(?:IV|III|II|I|V|[1-5]).*$/im, '')
    .replace(/^(#{2,5})(\s+)/gm, '#$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sectionContent(markdown, wanted) {
  const body = stripFrontmatter(markdown);
  const lines = body.split('\n');
  let active = false;
  const output = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (active) break;
      active = heading[1].trim().toLowerCase() === wanted.toLowerCase();
      continue;
    }
    if (active) output.push(line);
  }
  return output.join('\n').trim();
}

function descriptionFromRank(markdown) {
  const description = sectionContent(markdown, 'Description');
  if (description) return description;
  const body = demoteRankHeadings(stripFrontmatter(markdown));
  const firstParagraph = body
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .find(part => part && !part.startsWith('#') && part !== '---');
  return firstParagraph || 'Information coming soon.';
}

function normalizeTpCost(value) {
  const text = String(value || '').trim();
  if (!text) return '1 Talent Point';
  if (/\b(?:tp|talent point)/i.test(text)) return text;
  return `${text} TP`;
}

function splitDocument(markdown) {
  const frontmatter = String(markdown || '').match(/^---\n[\s\S]*?\n---\n?/);
  const body = stripFrontmatter(markdown);
  const preamble = [];
  const sections = [];
  let current = null;
  body.split('\n').forEach(line => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = { name: heading[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  });
  return {
    frontmatter: frontmatter ? frontmatter[0].trim() : '',
    preamble: preamble.join('\n').trim(),
    sections
  };
}

function replaceClassSection(markdown, sectionName, content) {
  if (!String(content || '').trim()) return markdown;
  const document = splitDocument(markdown);
  const section = document.sections.find(item => item.name.toLowerCase() === sectionName.toLowerCase());
  if (section) section.lines = String(content).trim().split('\n');
  else document.sections.push({ name: sectionName, lines: String(content).trim().split('\n') });
  const body = [
    document.preamble,
    ...document.sections.map(item => `## ${item.name}\n${item.lines.join('\n').trim()}`)
  ].filter(Boolean).join('\n\n');
  return `${document.frontmatter}\n\n${body}\n`;
}

function contentFromFile(file, sectionName) {
  if (!file || !fs.existsSync(file)) return '';
  const markdown = readMarkdown(file);
  const section = sectionContent(markdown, sectionName);
  if (section) return section;
  const body = stripFrontmatter(markdown);
  if (/^##\s+/m.test(body)) return '';
  return body.trim();
}

function tierNumber(name) {
  const match = String(name || '').match(/^Tier\s*(IV|III|II|I|V|[1-5])$/i);
  return match ? romanNumber(match[1]) : 0;
}

function sourceRankRecord(file, fallbackRank) {
  const markdown = readMarkdown(file);
  const heading = firstHeading(markdown);
  const rank = rankFromText(heading) || rankFromText(path.basename(file, path.extname(file))) || fallbackRank;
  return {
    file,
    markdown,
    metadata: parseFrontmatter(markdown),
    heading,
    rank: Math.max(1, Math.min(5, rank || fallbackRank)),
    body: demoteRankHeadings(stripFrontmatter(markdown))
  };
}

function talentMarkdown({ className, classSlug, classCategory, tier, folder, order }) {
  const files = fs.readdirSync(folder, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map(entry => path.join(folder, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true }));

  const records = files.map((file, index) => sourceRankRecord(file, index + 1));
  const titledRecord = records.find(record => cleanTalentTitle(record.heading, '') !== '');
  const filenameRecord = records.find(record => rankFromText(path.basename(record.file, path.extname(record.file))));
  const filenameTitle = cleanTalentTitle(
    filenameRecord ? path.basename(filenameRecord.file, path.extname(filenameRecord.file)) : '',
    ''
  );
  const folderTitle = path.basename(folder).replace(/\s+/g, ' ').trim();
  const title = cleanTalentTitle(titledRecord?.heading, filenameTitle || folderTitle);
  const talentSlug = slugify(title);
  const ranks = new Map();
  records.forEach(record => {
    const existing = ranks.get(record.rank);
    if (!existing || (!existing.body && record.body)) ranks.set(record.rank, record);
  });

  const rankOne = ranks.get(1) || records[0];
  const metadata = rankOne?.metadata || {};
  const cost = normalizeTpCost(metadataValue(metadata, ['TP Cost (Unlock)', 'Ability Points To Unlock'], '1 Talent Point'));
  const prerequisite = metadataValue(metadata, ['Prerequisite', 'Prerequisites'], 'None');
  const cooldown = metadataValue(metadata, ['Cooldown'], 'Passive');
  const overview = rankOne ? descriptionFromRank(rankOne.markdown) : 'Information coming soon.';
  const resourceFields = [
    ['ability_type', metadataValue(metadata, ['Ability Type'])],
    ['mana_cost', metadataValue(metadata, ['Mana Cost'])],
    ['stamina_cost', metadataValue(metadata, ['Stamina Cost'])],
    ['hp_cost', metadataValue(metadata, ['HP Cost'])],
    ['blood_point_cost', metadataValue(metadata, ['Blood Point Cost'])],
    ['duration', metadataValue(metadata, ['Duration'])],
    ['range', metadataValue(metadata, ['Range'])]
  ];

  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `slug: ${yamlString(talentSlug)}`,
    'type: talent',
    `className: ${yamlString(className)}`,
    `classSlug: ${yamlString(classSlug)}`,
    `classCategory: ${yamlString(classCategory)}`,
    `talentTier: ${yamlString(`Tier ${tier}`)}`,
    `tier: ${yamlString(`Tier ${tier}`)}`,
    'ranks: 5',
    `prerequisite: ${yamlString(prerequisite)}`,
    `cost: ${yamlString(cost)}`,
    `cooldown: ${yamlString(cooldown)}`,
    'scaling: "See individual rank details."',
    'synergy: "Information coming soon."',
    ...resourceFields.filter(([, value]) => String(value || '').trim()).map(([key, value]) => `${key}: ${yamlString(value)}`),
    'tags:',
    '  - "talent"',
    `  - ${yamlString(classSlug)}`,
    `  - ${yamlString(`tier-${tier}`)}`,
    'visibility: public',
    `sourceOrder: ${order}`,
    'importSource: "Asteria class manuscript"',
    '---'
  ];

  const body = [
    `# ${title}`,
    '',
    '## Overview',
    overview,
    ''
  ];
  for (let rank = 1; rank <= 5; rank += 1) {
    body.push(`## Rank ${rank}`, ranks.get(rank)?.body || 'Information coming soon.', '');
  }
  body.push(
    '## Prerequisites',
    String(prerequisite),
    '',
    '## Scaling',
    'See individual rank details.',
    '',
    '## Synergy',
    'Information coming soon.',
    '',
    '## GM Notes',
    'GM-only information coming soon.',
    ''
  );
  return { title, slug: talentSlug, markdown: `${frontmatter.join('\n')}\n\n${body.join('\n')}` };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const classSlug = slugify(args.slug);
  const sourceRoot = args.source ? path.resolve(args.source) : '';
  if (!args.slug || !/^[a-z0-9-]+$/.test(classSlug)) throw new Error('Use --slug with a valid class slug.');
  if (!sourceRoot || !fs.existsSync(sourceRoot)) throw new Error('Use --source with an existing class source folder.');

  const classFolder = path.join(classRoot, classSlug);
  const classFile = path.join(classFolder, 'index.md');
  if (!classFolder.startsWith(classRoot + path.sep) || !fs.existsSync(classFile)) {
    throw new Error(`The canonical class does not exist: content/classes/${classSlug}/index.md`);
  }

  const talentRoot = fs.existsSync(path.join(sourceRoot, 'Talent Tree'))
    ? path.join(sourceRoot, 'Talent Tree')
    : sourceRoot;
  const tierFolders = fs.readdirSync(talentRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && tierNumber(entry.name))
    .map(entry => ({ tier: tierNumber(entry.name), folder: path.join(talentRoot, entry.name) }))
    .sort((a, b) => a.tier - b.tier);
  if (!tierFolders.length) throw new Error(`No Tier 1-5 folders were found under ${talentRoot}`);

  let classMarkdown = readMarkdown(classFile);
  const classMetadata = parseFrontmatter(classMarkdown);
  const className = String(classMetadata.title || classSlug);
  const classCategory = String(classMetadata.classCategory || 'Classes');
  const overviewFile = args.overview ? path.resolve(sourceRoot, args.overview) : '';
  const loreFile = args.lore ? path.resolve(sourceRoot, args.lore) : '';
  classMarkdown = replaceClassSection(classMarkdown, 'Overview', contentFromFile(overviewFile, 'Overview'));
  classMarkdown = replaceClassSection(classMarkdown, 'Lore', contentFromFile(loreFile, 'Lore'));
  fs.writeFileSync(classFile, classMarkdown, 'utf8');

  const canonicalTalents = path.join(classFolder, 'talents');
  if (fs.existsSync(canonicalTalents)) fs.rmSync(canonicalTalents, { recursive: true, force: true });

  let talentCount = 0;
  const imported = [];
  tierFolders.forEach(({ tier, folder }) => {
    const talentFolders = fs.readdirSync(folder, { withFileTypes: true })
      .map(entry => ({ entry, fullPath: path.join(folder, entry.name) }))
      .filter(({ entry, fullPath }) => entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(fullPath).isDirectory()))
      .map(({ fullPath }) => fullPath)
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
    talentFolders.forEach(talentFolder => {
      talentCount += 1;
      const talent = talentMarkdown({
        className,
        classSlug,
        classCategory,
        tier,
        folder: talentFolder,
        order: talentCount
      });
      const outputFolder = path.join(canonicalTalents, `tier-${tier}`, talent.slug);
      fs.mkdirSync(outputFolder, { recursive: true });
      fs.writeFileSync(path.join(outputFolder, 'index.md'), talent.markdown, 'utf8');
      imported.push(`Tier ${tier}: ${talent.title}`);
    });
  });

  console.log(`Imported ${className}: ${talentCount} talents across ${tierFolders.length} tiers.`);
  imported.forEach(item => console.log(`  ${item}`));
}

main();
