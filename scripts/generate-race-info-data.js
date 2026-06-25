const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sourceRoot = process.argv[2] || 'C:\\Users\\jaida\\OneDrive\\Desktop\\New folder';
const outputPath = path.join(repoRoot, 'js', 'race-info-data.js');

const STAT_KEYS = {
  strength: 'strength',
  str: 'strength',
  dexterity: 'dexterity',
  dex: 'dexterity',
  agility: 'agility',
  agi: 'agility',
  constitution: 'constitution',
  con: 'constitution',
  endurance: 'endurance',
  end: 'endurance',
  intelligence: 'intelligence',
  int: 'intelligence',
  wisdom: 'wisdom',
  wis: 'wisdom',
  charisma: 'charisma',
  cha: 'charisma',
  luck: 'luck',
  lck: 'luck'
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [full] : [];
  });
}

function titleCase(value) {
  return String(value || '').toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase());
}

function cleanTitle(value) {
  const cleaned = String(value || '')
    .replace(/^[^\w]+/u, '')
    .replace(/\.md$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned && cleaned === cleaned.toUpperCase() ? titleCase(cleaned) : cleaned;
}

function raceNameFor(file, frontmatter) {
  if (frontmatter.Race) return cleanTitle(frontmatter.Race);
  const base = cleanTitle(path.basename(file));
  const parent = cleanTitle(path.basename(path.dirname(file)));
  if (/^(overview|lore|pixie lore|cavern sprite moto'?s|untitled)$/i.test(base)) return parent;
  return base || parent;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!match) return out;
  match[1].split(/\r?\n/).forEach(line => {
    const pair = line.match(/^([^:]+):\s*(.*)$/);
    if (!pair) return;
    out[pair[1].trim()] = pair[2].trim().replace(/^["']|["']$/g, '');
  });
  return out;
}

function stripFrontmatter(text) {
  return String(text || '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, '').trim();
}

function normalHeading(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function sections(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const result = [];
  let current = { level: 0, title: 'Body', body: [] };
  lines.forEach(line => {
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading && heading[1].length === 2) {
      if (current.body.length || current.title !== 'Body') result.push(current);
      current = { level: heading[1].length, title: cleanTitle(heading[2]), body: [] };
    } else {
      current.body.push(line);
    }
  });
  if (current.body.length || current.title !== 'Body') result.push(current);
  return result.map(section => ({
    title: section.title,
    key: normalHeading(section.title),
    body: section.body.join('\n').trim()
  }));
}

function sectionBody(list, names) {
  const wanted = names.map(normalHeading);
  const found = list.find(section => wanted.some(name => section.key.includes(name)));
  return found ? found.body.trim() : '';
}

function parseCharacteristicRows(markdown) {
  const rows = [];
  String(markdown || '').split(/\r?\n/).forEach(line => {
    if (!line.trim().startsWith('|')) return;
    const cells = line.split('|').map(cell => cell.trim()).filter(Boolean);
    if (cells.length < 4 || /race characteristic/i.test(cells[0]) || /^-+$/.test(cells[0])) return;
    const key = STAT_KEYS[cells[0].toLowerCase().replace(/[^a-z]/g, '')];
    if (!key) return;
    const modifier = Number((cells[1].match(/[+-]?\d+/) || ['0'])[0]);
    rows.push({
      key,
      label: cells[0],
      modifier: Number.isFinite(modifier) ? modifier : 0,
      statRoll: cells[2],
      tierCap: cells[3]
    });
  });
  return rows;
}

function parseTraits(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const traits = [];
  let current = null;
  lines.forEach(line => {
    const heading = line.match(/^#{2,4}\s+(.+)$/);
    if (heading) {
      if (current) traits.push(current);
      current = { name: cleanTitle(heading[1]), text: [] };
      return;
    }
    if (current) current.text.push(line);
  });
  if (current) traits.push(current);
  return traits
    .map(trait => ({
      name: trait.name,
      text: trait.text.join('\n').replace(/^[-*]\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim()
    }))
    .filter(trait => trait.name && trait.text);
}

function frontmatterStats(frontmatter) {
  const stats = {};
  const map = {
    'Neutral AC': 'Neutral AC',
    'Movement Speed': 'Movement',
    Senses: 'Senses',
    'Passive Perception': 'Passive Perception',
    'Racial Alignment': 'Racial Alignment',
    'Magic Affinity': 'Magic Affinity',
    Languages: 'Languages',
    Size: 'Size',
    Realm: 'Realm'
  };
  Object.entries(map).forEach(([source, label]) => {
    if (frontmatter[source]) stats[label] = frontmatter[source];
  });
  return stats;
}

function compactText(value) {
  return String(value || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function mergeRace(target, next) {
  Object.entries(next).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      target[key] = [...(target[key] || []), ...value];
      return;
    }
    if (value && typeof value === 'object') {
      target[key] = Object.assign({}, target[key] || {}, value);
      return;
    }
    if (!target[key]) target[key] = value;
    else if (key.endsWith('Markdown') || key === 'loreMarkdown' || key === 'overviewMarkdown') {
      target[key] = compactText(`${target[key]}\n\n${value}`);
    }
  });
  return target;
}

function buildRaceInfo(file) {
  const text = fs.readFileSync(file, 'utf8');
  const frontmatter = parseFrontmatter(text);
  const body = stripFrontmatter(text);
  const parts = sections(body);
  const characteristicMarkdown = sectionBody(parts, ['racial characteristics']);
  const characteristicRows = parseCharacteristicRows(characteristicMarkdown);
  const rollModifiers = Object.fromEntries(characteristicRows.map(row => [row.key, row.modifier]));
  const statRolls = Object.fromEntries(characteristicRows.map(row => [row.key, row.statRoll]));
  const tierCaps = Object.fromEntries(characteristicRows.map(row => [row.key, row.tierCap]));
  const traitMarkdown = sectionBody(parts, ['racial traits', 'base racial traits']);
  const bonusesMarkdown = sectionBody(parts, ['racial bonus drawbacks', 'drawbacks']);
  const raceName = raceNameFor(file, frontmatter);
  const isLoreFile = /lore/i.test(path.basename(file)) || /^overview/i.test(path.basename(file));
  const info = {
    title: raceName,
    sourcePath: path.relative(sourceRoot, file).replace(/\\/g, '/'),
    size: frontmatter.Size || '',
    movement: frontmatter['Movement Speed'] || '',
    senses: frontmatter.Senses || '',
    languages: frontmatter.Languages || '',
    magicAffinity: frontmatter['Magic Affinity'] || '',
    alignment: frontmatter['Racial Alignment'] || '',
    stats: frontmatterStats(frontmatter),
    overviewMarkdown: isLoreFile ? compactText(body) : sectionBody(parts, ['race classification', 'overview']),
    racialFeaturesMarkdown: sectionBody(parts, ['racial features']),
    racialCharacteristicsMarkdown: characteristicMarkdown,
    racialTraitsMarkdown: traitMarkdown,
    racialMovementMarkdown: sectionBody(parts, ['racial movement']),
    racialBonusesMarkdown: bonusesMarkdown,
    racialTraits: parseTraits(traitMarkdown),
    characteristicRows,
    rollModifiers,
    statRolls,
    tierCaps
  };
  if (/moto/i.test(path.basename(file))) info.mottosMarkdown = compactText(body);
  if (/lore/i.test(path.basename(file))) info.loreMarkdown = compactText(body);
  return { raceName, info };
}

function asciiJson(value) {
  return JSON.stringify(value, null, 2).replace(/[^\x00-\x7F]/g, char => {
    const code = char.charCodeAt(0).toString(16).padStart(4, '0');
    return `\\u${code}`;
  });
}

const output = {};
walk(sourceRoot).forEach(file => {
  const { raceName, info } = buildRaceInfo(file);
  if (!raceName || /^undien$/i.test(raceName)) return;
  output[raceName] = mergeRace(output[raceName] || {}, info);
});

const pixie = output.Pixie;
if (pixie) {
  Object.keys(output).forEach(name => {
    if (/ pixie$/i.test(name) && name !== 'Pixie') {
      output[name] = mergeRace(Object.assign({}, pixie, output[name] || {}), output[name] || {});
    }
  });
}

const fileBody = `/* Generated by scripts/generate-race-info-data.js from user race markdown notes. */\n(function(){\n  'use strict';\n  window.ASTERIA_RACE_INFO_DATA = ${asciiJson(output)};\n})();\n`;
fs.writeFileSync(outputPath, fileBody, 'utf8');
console.log(`Generated ${path.relative(repoRoot, outputPath)} with ${Object.keys(output).length} race entries.`);
