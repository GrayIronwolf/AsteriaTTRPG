const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const contentRoot = path.join(root, 'content');
const raceRoot = path.join(contentRoot, 'races');
const outputDataPath = path.join(root, 'js', 'race-compendium-data.js');

const removedRaceNames = new Set(['undien', 'deepborn undien']);
const sectionNames = [
  'Overview',
  'Racial Features',
  'Racial Characteristics',
  'Racial Traits',
  'Lore',
  'Culture',
  'Historical Figures',
  'Settlements',
  'Relations',
  'Traits & Biology',
  'Gallery',
  'GM Notes'
];

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'race';
}

function titleCaseFromSlug(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toWebPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function yamlString(value) {
  if (value === undefined || value === null || value === '') return '';
  return JSON.stringify(String(value));
}

function yamlValue(value) {
  if (value === true || value === false) return String(value);
  if (typeof value === 'number') return String(value);
  return yamlString(value);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(item => item !== undefined && item !== null && String(item).trim() !== '').map(String);
  if (value === undefined || value === null || value === '') return [];
  return String(value)
    .split(/[;,]/)
    .map(part => part.trim())
    .filter(Boolean);
}

function yamlArray(key, value) {
  const values = normalizeArray(value);
  if (!values.length) return `${key}: []`;
  return `${key}:\n${values.map(item => `  - ${yamlString(item)}`).join('\n')}`;
}

function loadBrowserGlobal(filePath, globalName) {
  if (!fs.existsSync(filePath)) return {};
  const code = fs.readFileSync(filePath, 'utf8');
  const context = { window: {}, console };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context.window[globalName] || {};
}

function normalizeRaceRootCase() {
  fs.mkdirSync(contentRoot, { recursive: true });
  const existing = fs.readdirSync(contentRoot, { withFileTypes: true })
    .find(entry => entry.isDirectory() && entry.name.toLowerCase() === 'races');
  if (existing && existing.name !== 'races') {
    const source = path.join(contentRoot, existing.name);
    const temp = path.join(contentRoot, '__races_case_tmp__');
    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
    fs.renameSync(source, temp);
    fs.renameSync(temp, raceRoot);
  }
  fs.mkdirSync(raceRoot, { recursive: true });
}

function flattenRaceTree(nodes, pathParts = [], output = []) {
  (nodes || []).forEach(node => {
    if (!node) return;
    if (node.type === 'race') {
      output.push({ node, pathParts: [...pathParts] });
      return;
    }
    flattenRaceTree(node.children || [], pathParts.concat(node.name), output);
  });
  return output;
}

function raceInfoFor(infoData, name) {
  const title = String(name || '').trim();
  return infoData[title] || (/ pixie$/i.test(title) ? infoData.Pixie : null) || {};
}

function inferSize(category) {
  const value = String(category || '').toLowerCase();
  if (value.includes('extra large')) return 'Extra Large';
  if (value.includes('small')) return 'Small';
  if (value.includes('medium')) return 'Medium';
  if (value.includes('large')) return 'Large';
  return '';
}

function firstMarkdownParagraph(markdown) {
  const body = String(markdown || '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^>\s*/gm, '')
    .trim();
  return body.split(/\r?\n{2,}/)
    .map(block => block.replace(/\r?\n/g, ' ').trim())
    .find(block => block.length > 45 && !/^Race Name:/i.test(block)) || '';
}

function characteristicMarkdown(info) {
  const rows = Array.isArray(info.characteristicRows) ? info.characteristicRows : [];
  if (info.racialCharacteristicsMarkdown) return info.racialCharacteristicsMarkdown;
  if (!rows.length) return 'Information coming soon.';
  const table = [
    '| Characteristic | Buff/Debuff | Stat Rolls | Characteristic Tier Cap |',
    '| --- | ---: | --- | --- |'
  ];
  rows.forEach(row => {
    const modifier = Number(row.modifier || 0);
    table.push(`| ${row.label || titleCaseFromSlug(row.key)} | ${modifier > 0 ? `+${modifier}` : modifier} | ${row.statRoll || ''} | ${row.tierCap || ''} |`);
  });
  return table.join('\n');
}

function traitsMarkdown(info) {
  if (info.racialTraitsMarkdown) return info.racialTraitsMarkdown;
  const traits = Array.isArray(info.racialTraits) ? info.racialTraits : [];
  if (!traits.length) return 'Information coming soon.';
  return traits.map(trait => `### ${trait.name || 'Trait'}\n${trait.text || 'Information coming soon.'}`).join('\n\n');
}

function defaultSectionContent(name, race, info) {
  if (name === 'Overview') return info.overviewMarkdown || race.summary || firstMarkdownParagraph(info.loreMarkdown) || 'Information coming soon.';
  if (name === 'Racial Features') return info.racialFeaturesMarkdown || 'Information coming soon.';
  if (name === 'Racial Characteristics') return characteristicMarkdown(info);
  if (name === 'Racial Traits') return traitsMarkdown(info);
  if (name === 'Lore') return info.loreMarkdown || 'Information coming soon.';
  if (name === 'Traits & Biology') {
    const parts = [info.racialMovementMarkdown, info.racialBonusesMarkdown, info.racialDrawbacksMarkdown].filter(Boolean);
    return parts.length ? parts.join('\n\n') : 'Information coming soon.';
  }
  if (name === 'GM Notes') return 'GM-only information coming soon.';
  return 'Information coming soon.';
}

function raceMarkdown(race, info, order) {
  const node = race.node || {};
  const pathParts = race.pathParts || [];
  const name = node.name || 'Unnamed Race';
  const raceSlug = slugify(node.slug || name);
  const images = Object.assign({}, node.images || {});
  if (node.image && !images.female && !images.male) images.female = node.image;
  const raceCategory = node.raceCategory || pathParts[0] || 'Races';
  const secondaryCategory = node.secondaryCategory || pathParts[1] || '';
  const tertiaryCategory = node.tertiaryCategory || pathParts[2] || '';
  const size = node.size || info.size || info.stats?.Size || inferSize(raceCategory) || '';
  const movement = node.movement || info.movement || info.stats?.Movement || '';
  const languages = node.languages || info.languages || info.stats?.Languages || [];
  const magicAffinity = node.magicAffinity || info.magicAffinity || info.stats?.['Magic Affinity'] || [];
  const essenceAffinity = node.essenceAffinity || info.essenceAffinity || info.stats?.['Essence Affinity'] || [];
  const tags = Array.from(new Set([
    'race',
    slugify(raceCategory),
    secondaryCategory ? slugify(secondaryCategory) : '',
    tertiaryCategory ? slugify(tertiaryCategory) : '',
    ...normalizeArray(node.tags),
    ...normalizeArray(info.tags)
  ].filter(Boolean)));

  const frontmatter = [
    '---',
    `title: ${yamlString(name)}`,
    `slug: ${yamlString(raceSlug)}`,
    'type: race',
    `raceCategory: ${yamlString(raceCategory)}`,
    `secondaryCategory: ${yamlString(secondaryCategory)}`,
    `tertiaryCategory: ${yamlString(tertiaryCategory)}`,
    `playable: ${node.playable === false ? 'false' : 'true'}`,
    `naturalAC: ${Math.max(1, Math.min(12, Number(node.naturalAC || info.naturalAC || 1)))}`,
    `traitSlots: ${Math.max(1, Math.min(5, Number(node.traitSlots || info.traitSlots || 5)))}`,
    `size: ${yamlString(size)}`,
    `movement: ${yamlString(movement)}`,
    yamlArray('languages', languages),
    yamlArray('magicAffinity', magicAffinity),
    yamlArray('essenceAffinity', essenceAffinity),
    yamlArray('tags', tags),
    'images:',
    `  male: ${yamlString(images.male || '')}`,
    `  female: ${yamlString(images.female || node.image || '')}`,
    'visibility: public'
  ];

  if (node.affinityProfile && Object.keys(node.affinityProfile).length) {
    frontmatter.push('affinityProfile:');
    Object.entries(node.affinityProfile).forEach(([key, value]) => {
      frontmatter.push(`  ${key}: ${yamlValue(value)}`);
    });
  }

  frontmatter.push(`sourceOrder: ${order}`, '---');

  const body = [`# ${name}`];
  sectionNames.forEach(section => {
    body.push('', `## ${section}`, defaultSectionContent(section, Object.assign({}, node, { summary: node.summary }), info).trim());
  });

  return `${frontmatter.join('\n')}\n\n${body.join('\n')}\n`;
}

function removeSkippedRaceContent() {
  removedRaceNames.forEach(name => {
    const folder = path.join(raceRoot, slugify(name));
    if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
  });
  const legacyUndien = path.join(raceRoot, 'Undien.md');
  if (fs.existsSync(legacyUndien)) fs.rmSync(legacyUndien, { force: true });
}

function writeMissingRaceFiles() {
  const oldData = loadBrowserGlobal(outputDataPath, 'ASTERIA_RACE_COMPENDIUM_DATA');
  const infoData = loadBrowserGlobal(path.join(root, 'js', 'race-info-data.js'), 'ASTERIA_RACE_INFO_DATA');
  const races = flattenRaceTree(oldData.categories || []);
  let written = 0;

  races.forEach((race, index) => {
    const name = race.node?.name || '';
    if (removedRaceNames.has(name.toLowerCase())) return;
    const raceSlug = slugify(race.node?.slug || name);
    const folder = path.join(raceRoot, raceSlug);
    const file = path.join(folder, 'index.md');
    if (fs.existsSync(file)) return;
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(file, raceMarkdown(race, raceInfoFor(infoData, name), index + 1), 'utf8');
    written += 1;
  });

  return written;
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed === '[]') return [];
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (/^\[.*\]$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1).trim();
    return inner ? inner.split(',').map(part => parseScalar(part)) : [];
  }
  return trimmed.replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
}

function parseFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const metadata = {};
  if (!match) return metadata;
  let currentKey = null;
  let currentObjectKey = null;

  match[1].split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const nested = line.match(/^\s{2}([A-Za-z0-9_ -]+):(?:\s*(.*))?$/);
    if (nested && currentObjectKey) {
      metadata[currentObjectKey][nested[1].trim()] = parseScalar(nested[2] || '');
      return;
    }
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(metadata[currentKey])) metadata[currentKey] = [];
      metadata[currentKey].push(parseScalar(listItem[1]));
      return;
    }
    const pair = line.match(/^([A-Za-z0-9_ -]+):(?:\s*(.*))?$/);
    if (!pair) return;
    const key = pair[1].trim();
    const rawValue = String(pair[2] || '').trim();
    if (!rawValue) {
      if (key === 'images' || key === 'affinityProfile') {
        metadata[key] = {};
        currentObjectKey = key;
        currentKey = null;
      } else {
        metadata[key] = '';
        currentKey = key;
        currentObjectKey = null;
      }
      return;
    }
    metadata[key] = parseScalar(rawValue);
    currentKey = null;
    currentObjectKey = null;
  });

  return metadata;
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function parseSections(markdown) {
  const body = stripFrontmatter(markdown);
  const sections = {};
  let current = '';
  body.split(/\r?\n/).forEach(line => {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading && sectionNames.includes(heading[1].trim())) {
      current = heading[1].trim();
      sections[current] = '';
      return;
    }
    if (current) sections[current] += `${line}\n`;
  });
  Object.keys(sections).forEach(key => {
    sections[key] = sections[key].trim();
  });
  return sections;
}

function parseTraits(markdown) {
  const text = String(markdown || '').trim();
  if (!text || text === 'Information coming soon.') return [];
  const traits = [];
  let current = null;
  text.split(/\r?\n/).forEach(line => {
    const heading = line.match(/^#{2,3}\s+(.+)$/);
    const marker = heading?.[1].replace(/:$/, '').trim().toLowerCase();
    if (heading && marker !== 'description' && marker !== 'effects') {
      if (current) traits.push(current);
      current = { name: heading[1].trim(), text: '' };
      return;
    }
    if (current) current.text += `${line}\n`;
  });
  if (current) traits.push(current);
  return traits.map(trait => {
    const text = trait.text.trim();
    const details = parseTraitDetails(text);
    return {
      name: trait.name,
      text,
      description: details.description,
      effects: details.effects
    };
  }).filter(trait => trait.name);
}

function parseTraitDetails(markdown) {
  const description = [];
  const effects = [];
  let mode = '';
  String(markdown || '').split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    const marker = trimmed
      .replace(/^#{1,6}\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/:$/, '')
      .trim()
      .toLowerCase();
    if (marker === 'description') {
      mode = 'description';
      return;
    }
    if (marker === 'effects') {
      mode = 'effects';
      return;
    }
    if (trimmed === '---') return;
    if (mode === 'description') description.push(line);
    if (mode === 'effects' && /^[-*]\s+/.test(trimmed)) {
      effects.push(trimmed.replace(/^[-*]\s+/, '').trim());
    }
  });
  return {
    description: description.join('\n').trim(),
    effects
  };
}

function characteristicKey(label) {
  const aliases = {
    str: 'strength',
    strength: 'strength',
    dex: 'dexterity',
    dexterity: 'dexterity',
    agi: 'agility',
    agility: 'agility',
    con: 'constitution',
    constitution: 'constitution',
    end: 'endurance',
    endurance: 'endurance',
    int: 'intelligence',
    intelligence: 'intelligence',
    wis: 'wisdom',
    wisdom: 'wisdom',
    cha: 'charisma',
    charisma: 'charisma',
    lck: 'luck',
    luck: 'luck'
  };
  return aliases[slugify(label).replace(/-/g, '')] || slugify(label).replace(/-/g, '');
}

function parseCharacteristicRows(markdown) {
  const lines = String(markdown || '').split(/\r?\n/).filter(line => /^\|.+\|$/.test(line.trim()));
  return lines
    .slice(2)
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 4)
    .map(cells => {
      const modifier = parseInt(cells[1].replace(/[^\-+0-9]/g, ''), 10);
      return {
        key: characteristicKey(cells[0]),
        label: cells[0],
        modifier: Number.isFinite(modifier) ? modifier : 0,
        statRoll: cells[2],
        tierCap: cells[3]
      };
    });
}

function raceFromFile(file) {
  const markdown = fs.readFileSync(file, 'utf8');
  const metadata = parseFrontmatter(markdown);
  const sections = parseSections(markdown);
  const titleMatch = stripFrontmatter(markdown).match(/^#\s+(.+)$/m);
  const title = metadata.title || titleMatch?.[1] || titleCaseFromSlug(path.basename(path.dirname(file)));
  const raceSlug = metadata.slug || slugify(title);
  if (removedRaceNames.has(String(title).toLowerCase()) || removedRaceNames.has(String(raceSlug).toLowerCase())) return null;
  const characteristicRows = parseCharacteristicRows(sections['Racial Characteristics']);
  const rollModifiers = {};
  const statRolls = {};
  const tierCaps = {};
  characteristicRows.forEach(row => {
    rollModifiers[row.key] = row.modifier;
    statRolls[row.key] = row.statRoll;
    tierCaps[row.key] = row.tierCap;
  });
  const images = metadata.images || {};
  const image = images.female || images.male || '';

  return {
    type: 'race',
    name: title,
    slug: raceSlug,
    sourcePath: `content/races/${raceSlug}/index.md`,
    raceCategory: metadata.raceCategory || 'Races',
    secondaryCategory: metadata.secondaryCategory || '',
    tertiaryCategory: metadata.tertiaryCategory || '',
    playable: metadata.playable !== false,
    traitSlots: Math.max(1, Math.min(5, Number(metadata.traitSlots || 5))),
    availability: metadata.playable === false ? 'non-playable' : 'playable',
    size: metadata.size || '',
    movement: metadata.movement || '',
    languages: normalizeArray(metadata.languages),
    magicAffinity: normalizeArray(metadata.magicAffinity),
    essenceAffinity: normalizeArray(metadata.essenceAffinity),
    tags: normalizeArray(metadata.tags),
    images,
    image,
    visibility: metadata.visibility || 'public',
    sourceOrder: Number(metadata.sourceOrder || 99999),
    affinityProfile: metadata.affinityProfile || {},
    overviewMarkdown: sections.Overview || '',
    racialFeaturesMarkdown: sections['Racial Features'] || '',
    racialCharacteristicsMarkdown: sections['Racial Characteristics'] || '',
    racialTraitsMarkdown: sections['Racial Traits'] || '',
    racialTraits: parseTraits(sections['Racial Traits']),
    loreMarkdown: sections.Lore || '',
    cultureMarkdown: sections.Culture || '',
    historicalFiguresMarkdown: sections['Historical Figures'] || '',
    settlementsMarkdown: sections.Settlements || '',
    relationsMarkdown: sections.Relations || '',
    racialMovementMarkdown: sections['Traits & Biology'] || '',
    galleryMarkdown: sections.Gallery || '',
    gmNotesMarkdown: sections['GM Notes'] || '',
    characteristicRows,
    rollModifiers,
    statRolls,
    tierCaps,
    summary: firstMarkdownParagraph(sections.Overview || sections.Lore) || 'Information coming soon.'
  };
}

function scanRaceFiles() {
  if (!fs.existsSync(raceRoot)) return [];
  return fs.readdirSync(raceRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(raceRoot, entry.name, 'index.md'))
    .filter(file => fs.existsSync(file))
    .map(raceFromFile)
    .filter(Boolean)
    .sort((a, b) => a.sourceOrder - b.sourceOrder || a.name.localeCompare(b.name));
}

function addCategory(rootCategories, pathParts, race) {
  let children = rootCategories;
  pathParts.filter(Boolean).forEach(part => {
    let node = children.find(item => item.type === 'category' && item.name === part);
    if (!node) {
      node = { type: 'category', name: part, children: [] };
      children.push(node);
    }
    children = node.children;
  });
  children.push(race);
}

function buildCategoryTree(races) {
  const categories = [];
  races.forEach(race => {
    const categoryPath = [
      race.raceCategory || 'Races',
      race.secondaryCategory || '',
      race.tertiaryCategory || ''
    ].filter(Boolean);
    const node = Object.assign({}, race);
    delete node.sourceOrder;
    addCategory(categories, categoryPath, node);
  });
  return categories;
}

function writeReadme() {
  const readme = [
    '# Asteria Race Content',
    '',
    'This folder is the source of truth for Race Compendium entries.',
    '',
    'Every race lives directly under `content/races/<race-slug>/index.md`. Do not place races inside category folders. Category navigation is generated from frontmatter fields such as `raceCategory`, `secondaryCategory`, and `tertiaryCategory`.',
    '',
    'To add a race:',
    '',
    '1. Create a lowercase folder directly in this directory.',
    '2. Add an `index.md` file using the race frontmatter schema.',
    '3. Add optional image paths under `images.male` and `images.female`.',
    '4. Run `node scripts/generate-race-content.js`.',
    '',
    'The generator rebuilds `js/race-compendium-data.js`, which the Race Compendium, Character Forge, and Player Dashboard use through the existing shared race system.',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(raceRoot, 'README.md'), readme, 'utf8');
}

function writeManifest(races) {
  const index = {
    version: 'asteria-race-content-v1',
    source: 'content/races',
    generatedAt: new Date().toISOString(),
    removedRaces: ['Undien', 'Deepborn Undien'],
    entryCount: races.length,
    loreLevels: ['Common Knowledge','Discovered Lore','Rare Lore','Forbidden Lore','GM Only'],
    relationshipStatuses: ['Allied','Friendly','Neutral','Tense','Distrusted','Hostile','Ancient Enemy'],
    categories: buildCategoryTree(races)
  };
  const output = `/* Generated by scripts/generate-race-content.js from content/races. Do not edit directly. */\n(function(){\n  'use strict';\n  window.ASTERIA_RACE_COMPENDIUM_DATA = ${JSON.stringify(index, null, 2)};\n})();\n`;
  fs.writeFileSync(outputDataPath, output, 'utf8');
}

function main() {
  normalizeRaceRootCase();
  removeSkippedRaceContent();
  const written = writeMissingRaceFiles();
  writeReadme();
  const races = scanRaceFiles();
  writeManifest(races);
  console.log(`Race content ready: ${races.length} active races, ${written} new race files created`);
  console.log('Removed from generated race system: Undien, Deepborn Undien');
}

main();
