const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'content', 'skills');
const sourceRoot = path.resolve(process.argv[2] || '');

if (!process.argv[2] || !fs.existsSync(sourceRoot)) {
  console.error('Usage: node scripts/import-skills.js <source Skills folder>');
  process.exit(1);
}

if (path.resolve(outputRoot) !== path.resolve(projectRoot, 'content', 'skills')) {
  throw new Error('Refusing to write outside content/skills.');
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'skill';
}

function cleanHeading(value) {
  const text = String(value || '').replace(/[*_`#]/g, '').trim();
  if (/non[\s-]*combat skills/i.test(text)) return 'Non-Combat Skills';
  if (/combat skills/i.test(text)) return 'Combat Skills';
  return text.replace(/^[^A-Za-z0-9]+/, '').trim();
}

function yamlString(value) {
  return JSON.stringify(String(value || ''));
}

function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function parseSourceFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const result = {};
  if (!match) return result;
  match[1].split(/\r?\n/).forEach(line => {
    const pair = line.match(/^([^:]+):\s*(.*)$/);
    if (pair) result[pair[1].trim()] = pair[2].trim().replace(/^['"]|['"]$/g, '');
  });
  return result;
}

function parseMasterList(markdown) {
  const entries = [];
  let primaryCategory = '';
  let secondaryCategory = '';

  stripFrontmatter(markdown).split(/\r?\n/).forEach(line => {
    const primary = line.match(/^#\s+(.+)$/);
    if (primary) {
      const heading = cleanHeading(primary[1]);
      if (heading === 'Combat Skills' || heading === 'Non-Combat Skills') {
        primaryCategory = heading;
        secondaryCategory = '';
      }
      return;
    }

    const secondary = line.match(/^##\s+(.+)$/);
    if (secondary) {
      secondaryCategory = cleanHeading(secondary[1]);
      return;
    }

    if (!primaryCategory || !secondaryCategory || !/^\|/.test(line)) return;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length < 3 || /^(skill|-+)$/i.test(cells[0])) return;
    entries.push({
      title: cells[0],
      primaryStat: cells[1],
      secondaryStat: cells[2],
      primaryCategory,
      secondaryCategory,
      detailed: false,
      sourceMarkdown: ''
    });
  });

  return entries;
}

function markdownFiles(folder) {
  const output = [];
  fs.readdirSync(folder, { withFileTypes: true }).forEach(item => {
    const fullPath = path.join(folder, item.name);
    if (item.isDirectory()) output.push(...markdownFiles(fullPath));
    else if (/\.md$/i.test(item.name) && item.name.toLowerCase() !== 'untitled.md') output.push(fullPath);
  });
  return output;
}

function plainText(value) {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detailSections(markdown) {
  const body = stripFrontmatter(markdown).replace(/^#\s+[^\r\n]+\r?\n?/, '').trim();
  const overviewMatch = body.match(/(?:^|\n)##\s+Overview\s*\r?\n([\s\S]*?)(?=\r?\n#\s|\r?\n##\s|$)/i);
  const learningIndex = body.search(/(?:^|\n)#\s+Learning Techniques\s*$/im);
  const overview = overviewMatch ? overviewMatch[1].trim() : 'Information coming soon.';
  const techniques = learningIndex >= 0
    ? body.slice(learningIndex).trim().replace(/^#\s+/gm, '### ').replace(/^##\s+/gm, '#### ')
    : 'Information coming soon.';
  return { overview, techniques };
}

function rankReference() {
  return [
    '| Skill Rank | Affinity Range | Rank Modifier |',
    '| --- | --- | ---: |',
    '| Novice | 01-09 | -2 |',
    '| Initiate | 10-24 | -1 |',
    '| Apprentice | 25-44 | 0 |',
    '| Journeyman | 45-69 | +1 |',
    '| Adept | 70-84 | +2 |',
    '| Master | 85-97 | +3 |',
    '| Grandmaster | 98-100 | +4 |'
  ].join('\n');
}

function skillMarkdown(entry) {
  const detail = entry.detailed ? detailSections(entry.sourceMarkdown) : null;
  const summary = detail
    ? plainText(detail.overview).slice(0, 240)
    : `${entry.title} is an Asteria ${entry.secondaryCategory.toLowerCase()} skill governed by ${entry.primaryStat}, with ${entry.secondaryStat} as its supporting characteristic.`;
  const tags = ['skill', slugify(entry.primaryCategory), slugify(entry.secondaryCategory)];
  if (entry.detailed) tags.push('skill-technique');

  return `---
title: ${yamlString(entry.title)}
slug: ${yamlString(slugify(entry.title))}
type: skill
category: ${yamlString(entry.primaryCategory)}
subcategory: ${yamlString(entry.secondaryCategory)}
primary_stat: ${yamlString(entry.primaryStat)}
secondary_stat: ${yamlString(entry.secondaryStat)}
skill_rank: Novice
training_type: ${yamlString(entry.detailed ? 'Skill Techniques' : 'General Training')}
visibility: public
summary: ${yamlString(summary)}
tags:
${tags.map(tag => `  - ${yamlString(tag)}`).join('\n')}
---

# ${entry.title}

## Overview

${detail ? detail.overview : summary}

**Primary Characteristic:** ${entry.primaryStat}  
**Secondary Characteristic:** ${entry.secondaryStat}

## Ranks

${detail ? detail.techniques : `${rankReference()}\n\nDetailed techniques for ${entry.title} are coming soon.`}

## Checks

Use **${entry.primaryStat}** as the primary characteristic and **${entry.secondaryStat}** as the supporting characteristic when the GM calls for a ${entry.title} check.

## Training

${entry.detailed ? 'Training techniques and rank requirements are listed in the Ranks tab.' : 'Training information coming soon.'}

## Lore

Information coming soon.

## GM Notes

GM-only information coming soon.
`;
}

const masterPath = path.join(sourceRoot, 'Untitled.md');
if (!fs.existsSync(masterPath)) throw new Error(`Missing master skill list: ${masterPath}`);

const records = parseMasterList(fs.readFileSync(masterPath, 'utf8'));
const aliases = {
  Crossbows: ['Crossbow Handling'],
  Daggers: ['Dagger & Knife Fighting'],
  'Throwing Knives': ['Thrown Weapons'],
  'Gem Craft': ['Gemcraft'],
  'Mace Wielding': ['Mace & Hammer Wielding'],
  'Hammer Wielding': ['Mace & Hammer Wielding'],
  Stealth: ['Stealth (Combat)']
};

const detailedRecords = markdownFiles(sourceRoot).map(filePath => {
  const sourceMarkdown = fs.readFileSync(filePath, 'utf8');
  const metadata = parseSourceFrontmatter(sourceMarkdown);
  const title = metadata.Skill || path.basename(filePath, path.extname(filePath));
  const sourceNames = [title, ...(aliases[title] || [])];
  const master = records.find(entry => sourceNames.includes(entry.title));
  return {
    title,
    primaryStat: metadata['Primary Characteristic'] || master?.primaryStat || 'Varies',
    secondaryStat: metadata['Secondary Characteristic'] || master?.secondaryStat || 'Varies',
    primaryCategory: master?.primaryCategory || 'Non-Combat Skills',
    secondaryCategory: master?.secondaryCategory || 'Knowledge & Learning',
    detailed: true,
    sourceMarkdown,
    sourceNames
  };
});

const replacedNames = new Set(detailedRecords.flatMap(entry => entry.sourceNames));
const combined = records.filter(entry => !replacedNames.has(entry.title)).concat(detailedRecords);
combined.sort((a, b) => a.primaryCategory.localeCompare(b.primaryCategory) || a.secondaryCategory.localeCompare(b.secondaryCategory) || a.title.localeCompare(b.title));

fs.mkdirSync(outputRoot, { recursive: true });
fs.readdirSync(outputRoot, { withFileTypes: true }).forEach(item => {
  if (item.name.toLowerCase() === 'readme.md') return;
  fs.rmSync(path.join(outputRoot, item.name), { recursive: true, force: true });
});

combined.forEach(entry => {
  const folder = path.join(outputRoot, slugify(entry.primaryCategory), slugify(entry.secondaryCategory), slugify(entry.title));
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'index.md'), skillMarkdown(entry), 'utf8');
});

const duplicateTitles = combined.filter((entry, index) => combined.findIndex(other => other.title.toLowerCase() === entry.title.toLowerCase()) !== index);
if (duplicateTitles.length) throw new Error(`Duplicate skills generated: ${duplicateTitles.map(entry => entry.title).join(', ')}`);

console.log(`Imported ${combined.length} skills (${detailedRecords.length} detailed, ${combined.length - detailedRecords.length} placeholders).`);
