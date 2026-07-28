const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const contentRoot = path.join(root, 'content');
const classRoot = path.join(contentRoot, 'classes');
const outputDataPath = path.join(root, 'js', 'class-compendium-data.js');

const classSections = ['Overview', 'Talent Tree', 'Lore', 'Gallery', 'GM Notes'];
const talentSections = ['Overview', 'Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Prerequisites', 'Scaling', 'Synergy', 'GM Notes'];

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry';
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

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter(item => item !== undefined && item !== null && String(item).trim() !== '').map(String);
  if (value === undefined || value === null || value === '') return [];
  return String(value).split(/[;,]/).map(part => part.trim()).filter(Boolean);
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

function normalizeClassRootCase() {
  fs.mkdirSync(contentRoot, { recursive: true });
  const existing = fs.readdirSync(contentRoot, { withFileTypes: true })
    .find(entry => entry.isDirectory() && entry.name.toLowerCase() === 'classes');
  if (existing && existing.name !== 'classes') {
    const source = path.join(contentRoot, existing.name);
    const temp = path.join(contentRoot, '__classes_case_tmp__');
    if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true });
    fs.renameSync(source, temp);
    fs.renameSync(temp, classRoot);
  }
  fs.mkdirSync(classRoot, { recursive: true });
}

function removeLegacyLooseClassFiles() {
  const ranger = path.join(classRoot, 'Ranger.md');
  if (fs.existsSync(ranger)) fs.rmSync(ranger, { force: true });
}

function flattenClassTree(nodes, pathParts = [], output = []) {
  (nodes || []).forEach(node => {
    if (!node) return;
    if (node.type === 'class') {
      output.push({ node, pathParts: [...pathParts] });
      return;
    }
    flattenClassTree(node.children || [], pathParts.concat(node.name), output);
  });
  return output;
}

function sectionMarkdown(section, classNode) {
  if (section === 'Overview') return classNode.overview || 'Information coming soon.';
  if (section === 'Talent Tree') return 'Talent pathways live in the talent folders for this class. Each talent has its own page under `talents/tier-*`.';
  if (section === 'Lore') return classNode.lore || 'Information coming soon.';
  if (section === 'GM Notes') return 'GM-only information coming soon.';
  return 'Information coming soon.';
}

function classMarkdown(classItem, order) {
  const node = classItem.node || {};
  const name = node.name || 'Unnamed Class';
  const classSlug = slugify(node.slug || name);
  const classCategory = node.classCategory || classItem.pathParts?.[0] || 'Classes';
  const frontmatter = [
    '---',
    `title: ${yamlString(name)}`,
    `slug: ${yamlString(classSlug)}`,
    'type: class',
    `classCategory: ${yamlString(classCategory)}`,
    `role: ${yamlString(node.role || '')}`,
    `primary_stat: ${yamlString(node.primary_stat || '')}`,
    `secondary_stat: ${yamlString(node.secondary_stat || '')}`,
    `combat_style: ${yamlString(node.combat_style || '')}`,
    `magic_type: ${yamlString(node.magic_type || '')}`,
    `difficulty: ${yamlString(node.difficulty || '')}`,
    `class_colour: ${yamlString(node.class_colour || '')}`,
    `symbol: ${yamlString(node.symbol || '')}`,
    `playable: ${node.playable === false ? 'false' : 'true'}`,
    yamlArray('starting_equipment', node.starting_equipment),
    yamlArray('recommended_professions', node.recommended_professions),
    yamlArray('tags', ['class', slugify(classCategory)].concat(normalizeArray(node.tags))),
    'visibility: public',
    `sourceOrder: ${order}`,
    '---'
  ];
  const body = [`# ${name}`];
  classSections.forEach(section => {
    body.push('', `## ${section}`, sectionMarkdown(section, node).trim());
  });
  return `${frontmatter.join('\n')}\n\n${body.join('\n')}\n`;
}

function tierNumber(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function talentMarkdown(talent, classNode, classCategory, classSlug, order) {
  const title = talent.name || 'Unnamed Talent';
  const tier = tierNumber(talent.tier);
  const ranks = Math.max(1, Number(talent.ranks || 5));
  const rankDetails = normalizeArray(talent.rankDetails);
  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `slug: ${yamlString(slugify(title))}`,
    'type: talent',
    `className: ${yamlString(classNode.name || '')}`,
    `classSlug: ${yamlString(classSlug)}`,
    `classCategory: ${yamlString(classCategory)}`,
    `talentTier: ${yamlString(`Tier ${tier}`)}`,
    `tier: ${yamlString(`Tier ${tier}`)}`,
    `ranks: ${ranks}`,
    `prerequisite: ${yamlString(talent.prerequisite || 'None')}`,
    `cost: ${yamlString(talent.cost || '1 Talent Point')}`,
    `cooldown: ${yamlString(talent.cooldown || 'Passive')}`,
    `scaling: ${yamlString(talent.scaling || '')}`,
    `synergy: ${yamlString(talent.synergy || '')}`,
    yamlArray('tags', ['talent', slugify(classNode.name || ''), `tier-${tier}`].concat(normalizeArray(talent.tags))),
    'visibility: public',
    `sourceOrder: ${order}`,
    '---'
  ];
  const body = [`# ${title}`];
  talentSections.forEach(section => {
    let content = 'Information coming soon.';
    const rank = section.match(/^Rank\s+(\d)$/);
    if (section === 'Overview') content = talent.description || talent.scaling || talent.synergy || 'Information coming soon.';
    else if (rank) content = rankDetails[Number(rank[1]) - 1] || (Number(rank[1]) <= ranks ? 'Information coming soon.' : 'Locked until this talent gains more ranks.');
    else if (section === 'Prerequisites') content = talent.prerequisite || 'None';
    else if (section === 'Scaling') content = talent.scaling || 'Information coming soon.';
    else if (section === 'Synergy') content = talent.synergy || 'Information coming soon.';
    else if (section === 'GM Notes') content = talent.gmNotes || 'GM-only information coming soon.';
    body.push('', `## ${section}`, String(content).trim());
  });
  return `${frontmatter.join('\n')}\n\n${body.join('\n')}\n`;
}

function writeMissingClassFiles() {
  const data = loadBrowserGlobal(outputDataPath, 'ASTERIA_CLASS_COMPENDIUM_DATA');
  const classes = flattenClassTree(data.categories || []);
  let written = 0;

  classes.forEach((classItem, classIndex) => {
    const node = classItem.node || {};
    if (!node.name) return;
    const classSlug = slugify(node.slug || node.name);
    const classCategory = node.classCategory || classItem.pathParts?.[0] || 'Classes';
    const folder = path.join(classRoot, classSlug);
    const file = path.join(folder, 'index.md');
    if (!fs.existsSync(file)) {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(file, classMarkdown(classItem, classIndex + 1), 'utf8');
      written += 1;
    }
    const talentsRoot = path.join(folder, 'talents');
    const canonicalTalentFiles = [];
    if (fs.existsSync(talentsRoot)) {
      const walkTalents = dir => {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
          const next = path.join(dir, entry.name);
          if (entry.isDirectory()) walkTalents(next);
          else if (entry.isFile() && entry.name.toLowerCase() === 'index.md') canonicalTalentFiles.push(next);
        });
      };
      walkTalents(talentsRoot);
    }
    if (canonicalTalentFiles.length) return;
    (Array.isArray(node.talents) ? node.talents : []).forEach((talent, talentIndex) => {
      if (!talent?.name) return;
      const tier = tierNumber(talent.tier);
      const talentFolder = path.join(folder, 'talents', `tier-${tier}`, slugify(talent.name));
      const talentFile = path.join(talentFolder, 'index.md');
      if (fs.existsSync(talentFile)) return;
      fs.mkdirSync(talentFolder, { recursive: true });
      fs.writeFileSync(talentFile, talentMarkdown(talent, node, classCategory, classSlug, talentIndex + 1), 'utf8');
      written += 1;
    });
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
    const key = pair[1].trim();
    const rawValue = String(pair[2] || '').trim();
    metadata[key] = parseScalar(rawValue);
    currentKey = rawValue ? null : key;
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
    if (heading) {
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

function titleFromMarkdown(markdown, fallback) {
  const heading = stripFrontmatter(markdown).match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

function talentFromFile(file, classEntry) {
  const markdown = fs.readFileSync(file, 'utf8');
  const metadata = parseFrontmatter(markdown);
  const sections = parseSections(markdown);
  const title = metadata.title || titleFromMarkdown(markdown, titleCaseFromSlug(path.basename(path.dirname(file))));
  const ranks = Math.max(1, Number(metadata.ranks || 5));
  const rankDetails = [1, 2, 3, 4, 5].map(rank => sections[`Rank ${rank}`] || '').slice(0, ranks);
  const tier = metadata.talentTier || metadata.tier || titleCaseFromSlug(path.basename(path.dirname(path.dirname(file))));

  return {
    name: title,
    slug: metadata.slug || slugify(title),
    sourcePath: toWebPath(path.relative(root, file)),
    sourceFolder: toWebPath(path.relative(root, path.dirname(file))),
    tier,
    ranks,
    prerequisite: metadata.prerequisite || sections.Prerequisites || 'None',
    cost: metadata.cost || '1 Talent Point',
    cooldown: metadata.cooldown || 'Passive',
    abilityType: metadata.ability_type || '',
    manaCost: metadata.mana_cost || '',
    staminaCost: metadata.stamina_cost || '',
    hpCost: metadata.hp_cost || '',
    bloodPointCost: metadata.blood_point_cost || '',
    duration: metadata.duration || '',
    range: metadata.range || '',
    scaling: metadata.scaling || sections.Scaling || 'Improves by rank',
    synergy: metadata.synergy || sections.Synergy || 'Information coming soon',
    gmNotes: sections['GM Notes'] || 'Information coming soon',
    rankDetails,
    className: metadata.className || classEntry.name,
    classSlug: metadata.classSlug || classEntry.slug,
    classCategory: metadata.classCategory || classEntry.classCategory,
    tags: normalizeArray(metadata.tags),
    sourceOrder: Number(metadata.sourceOrder || 99999)
  };
}

function classFromFile(file) {
  const markdown = fs.readFileSync(file, 'utf8');
  const metadata = parseFrontmatter(markdown);
  const sections = parseSections(markdown);
  const title = metadata.title || titleFromMarkdown(markdown, titleCaseFromSlug(path.basename(path.dirname(file))));
  const classSlug = metadata.slug || slugify(title);
  const classEntry = {
    type: 'class',
    name: title,
    slug: classSlug,
    sourcePath: toWebPath(path.relative(root, file)),
    sourceFolder: toWebPath(path.relative(root, path.dirname(file))),
    classCategory: metadata.classCategory || 'Classes',
    role: metadata.role || 'Information coming soon',
    primary_stat: metadata.primary_stat || '',
    secondary_stat: metadata.secondary_stat || '',
    combat_style: metadata.combat_style || '',
    magic_type: metadata.magic_type || 'None',
    difficulty: metadata.difficulty || 'Information coming soon',
    class_colour: metadata.class_colour || '#1f7dff',
    symbol: metadata.symbol || title.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
    playable: metadata.playable !== false,
    tags: normalizeArray(metadata.tags),
    starting_equipment: normalizeArray(metadata.starting_equipment),
    recommended_professions: normalizeArray(metadata.recommended_professions),
    overview: sections.Overview || '',
    lore: sections.Lore || '',
    galleryMarkdown: sections.Gallery || '',
    gmNotesMarkdown: sections['GM Notes'] || '',
    sourceOrder: Number(metadata.sourceOrder || 99999),
    talents: []
  };

  const talentsRoot = path.join(path.dirname(file), 'talents');
  if (fs.existsSync(talentsRoot)) {
    const talentFiles = [];
    const walk = dir => {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const next = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (entry.isFile() && entry.name.toLowerCase() === 'index.md') talentFiles.push(next);
      });
    };
    walk(talentsRoot);
    classEntry.talents = talentFiles
      .map(talentFile => talentFromFile(talentFile, classEntry))
      .sort((a, b) => tierNumber(a.tier) - tierNumber(b.tier) || a.sourceOrder - b.sourceOrder || a.name.localeCompare(b.name));
  }

  return classEntry;
}

function scanClassFiles() {
  if (!fs.existsSync(classRoot)) return [];
  return fs.readdirSync(classRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(classRoot, entry.name, 'index.md'))
    .filter(file => fs.existsSync(file))
    .map(classFromFile)
    .sort((a, b) => a.sourceOrder - b.sourceOrder || a.name.localeCompare(b.name));
}

function buildCategoryTree(classes) {
  const categories = [];
  classes.forEach(entry => {
    const name = entry.classCategory || 'Classes';
    let category = categories.find(item => item.name === name);
    if (!category) {
      category = { type: 'category', name, children: [] };
      categories.push(category);
    }
    category.children.push(entry);
  });
  categories.forEach(category => {
    category.children.sort((a, b) => a.name.localeCompare(b.name));
  });
  return categories.sort((a, b) => a.name.localeCompare(b.name));
}

function writeManifest(classes) {
  const payload = {
    version: 'asteria-class-compendium-v1.2-file-content',
    source: 'content/classes',
    entryCount: classes.length,
    loreLevels: ['Common Knowledge','Discovered Lore','Rare Lore','Forbidden Lore','GM Only'],
    categories: buildCategoryTree(classes)
  };
  fs.writeFileSync(outputDataPath, `/* Asteria Class Compendium manifest generated from content/classes. */\n(function(){\n  'use strict';\n  window.ASTERIA_CLASS_COMPENDIUM_DATA = ${JSON.stringify(payload, null, 2)};\n})();\n`, 'utf8');
}

normalizeClassRootCase();
removeLegacyLooseClassFiles();
const written = writeMissingClassFiles();
const classes = scanClassFiles();
writeManifest(classes);

console.log(`Generated class content manifest with ${classes.length} classes. Added ${written} new class/talent files.`);
