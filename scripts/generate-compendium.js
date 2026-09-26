const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { slugify, stripFrontmatter, parseFrontmatter, sectionsFromMarkdown, headingName } = require('./lib/content-utils.cjs');
const { parseTraits, parseCharacteristicRows } = require('./lib/race-fields.cjs');
const schema = require('./lib/compendium-schema.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'data/compendium.js');
const folders = { races:'race', classes:'class', creatures:'creature', items:'item', spells:'spell', talents:'talent', professions:'profession', skills:'skill', origins:'origin', locations:'location', theology:'religion', factions:'faction', lore:'lore', handbook:'handbook' };
const list = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
const web = value => value.split(path.sep).join('/');
const first = (record, keys) => keys.map(key => record[key]).find(value => value !== undefined && value !== null && value !== '');

// Keep prose once in the generated file; all consumers receive the same hydrated shape.
function hydrate(data) {
  const raceSections = new Set(['Overview','Racial Features','Racial Characteristics','Racial Traits','Lore','Culture','Historical Figures','Settlements','Relations','Traits & Biology','Gallery','GM Notes']);
  for (const entry of data.entries) {
    const sections = {};
    let heading = 'Overview';
    for (const line of entry.body.split(/\r?\n/)) {
      const match = line.match(/^##\s+(.+)$/);
      if (match && (entry.domain !== 'race' || raceSections.has(headingName(match[1])))) { heading=headingName(match[1]); continue; }
      sections[heading]=(sections[heading] || '')+line+'\n';
    }
    entry.sections=Object.fromEntries(Object.entries(sections).map(([key,value]) => [key,value.trim()]));
    entry.content=entry.body;
    entry.name=entry.title;
    entry.tabs=data.tabTemplates[entry.domain];
    entry.description=entry.summary;
    entry.searchTerms=[entry.title,entry.domain,entry.categoryPath.join(' '),entry.tags.join(' '),entry.body,JSON.stringify(entry.filters)].join(' ').toLowerCase();
    if(entry.domain==='race') {
      const fields={overviewMarkdown:'Overview',racialFeaturesMarkdown:'Racial Features',racialCharacteristicsMarkdown:'Racial Characteristics',racialTraitsMarkdown:'Racial Traits',loreMarkdown:'Lore',cultureMarkdown:'Culture',historicalFiguresMarkdown:'Historical Figures',settlementsMarkdown:'Settlements',relationsMarkdown:'Relations',racialMovementMarkdown:'Traits & Biology',galleryMarkdown:'Gallery',gmNotesMarkdown:'GM Notes'};
      for(const [field,section] of Object.entries(fields))entry.metadata[field]=entry.sections[section] || '';
    }
    if(entry.domain==='talent')entry.metadata.rankDetails=[1,2,3,4,5].map(rank => entry.sections[`Rank ${rank}`] || '');
  }
  return data;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes:true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
function asset(value, directory) {
  if (!value || typeof value !== 'string') return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (!/\.(png|jpe?g|webp|gif|svg)(?:[?#].*)?$/i.test(value)) return '';
  const clean = decodeURI(value).replace(/^\//, '').split(/[?#]/)[0];
  for (const file of [path.join(root, clean), path.resolve(directory, clean)]) {
    if (file.startsWith(root + path.sep) && fs.existsSync(file)) return web(path.relative(root, file));
  }
  return '';
}
function makeEntry(file) {
  const content = fs.readFileSync(file, 'utf8');
  const metadata = parseFrontmatter(content);
  const domain = metadata.domain || folders[path.relative(path.join(root,'content'), file).split(path.sep)[0]];
  if (!schema.domainLabels[domain]) throw new Error(`Unknown domain: ${file}`);
  const title = metadata.title || metadata.name || stripFrontmatter(content).match(/^#\s+(.+)$/m)?.[1];
  if (!title || !metadata.id) throw new Error(`Missing title or stable id: ${file}`);
  const slug = metadata.slug || slugify(title);
  const sections = sectionsFromMarkdown(content,domain);
  const categoryPath = list(metadata.categoryPath || metadata.category || metadata.classCategory || metadata.raceCategory).filter(Boolean);
  const sourcePath = web(path.relative(root,file));
  const imageReferences = {};
  for (const match of content.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/g)) {
    const reference = match[1] || match[2];
    imageReferences[reference] = asset(reference,path.dirname(file));
  }
  const images = {};
  const requestedImages = { ...metadata.images, image:metadata.image || metadata.images?.image, symbol:metadata.symbol };
  for (const [key,value] of Object.entries(requestedImages)) {
    const resolved = asset(value, path.dirname(file));
    if (resolved) images[key] = resolved;
  }
  if (!Object.keys(images).length) {
    const local = fs.readdirSync(path.dirname(file)).find(name => /\.(png|jpe?g|webp|gif|svg)$/i.test(name));
    if (local) images.image = web(path.relative(root,path.join(path.dirname(file),local)));
  }
  if (domain === 'spell' && !images.image && !images.symbol) {
    const element = slugify(first(metadata,['magicalElement','element','magicType']) || '').replace(/-magic$/, '');
    images.symbol = asset(`assets/magic-elements/${element}-spells.png`,path.dirname(file));
  }
  const filters = {};
  if (metadata.collection) filters.collection = metadata.collection;
  for (const [key, aliases] of Object.entries(schema.filterAliases)) {
    const value = first(metadata, aliases);
    if (value !== undefined) filters[key] = list(value).join(', ');
  }
  const visibility = metadata.visibility || 'public';
  const entry = {
    id:metadata.id, title, name:title, slug, domain, type:domain,
    section:schema.workspaceSections[domain], workspaceSection:schema.workspaceSections[domain],
    compendium:schema.domainLabels[domain], categoryPath, path:categoryPath,
    pathId:categoryPath.map(slugify).join('/'), category:categoryPath.at(-1) || schema.domainLabels[domain],
    route:`/compendium/${domain}/${path.basename(path.dirname(file))}`,
    aliases:list(metadata.aliases), sourcePath, sourceFolder:web(path.relative(root,path.dirname(file))),
    body:stripFrontmatter(content), sections, metadata, tags:list(metadata.tags), visibility,
    gmOnly:visibility === 'gm-only' || metadata.gmOnly === true,
    images, imageReferences, imagePath:images.image || images.female || images.male || images.symbol || '',
    summary:metadata.summary || metadata.description || (sections.Overview || '').split(/\n\s*\n/).find(text => text && !text.startsWith('#'))?.slice(0,230) || '',
    tabs:schema.tabTemplates[domain], related:list(metadata.related), filters:{ ...filters, category:categoryPath.at(-1) || '' },
    rarity:metadata.itemClass || metadata.rarity || '',
    marketValue:metadata.marketValue ?? null, marketPrice:metadata.marketPrice ?? null,
    pricingStatus:metadata.pricingStatus || '',
    content
  };
  if (domain === 'race') {
    const characteristicRows = parseCharacteristicRows(sections['Racial Characteristics']);
    Object.assign(metadata, {
      characteristicRows, rollModifiers:Object.fromEntries(characteristicRows.map(row => [row.key,row.modifier])),
      statRolls:Object.fromEntries(characteristicRows.map(row => [row.key,row.statRoll])),
      tierCaps:Object.fromEntries(characteristicRows.map(row => [row.key,row.tierCap])),
      racialTraits:parseTraits(sections['Racial Traits']), traitSlots:metadata.traitSlots || 5
    });
    const fields = { overviewMarkdown:'Overview',racialFeaturesMarkdown:'Racial Features',racialCharacteristicsMarkdown:'Racial Characteristics',racialTraitsMarkdown:'Racial Traits',loreMarkdown:'Lore',cultureMarkdown:'Culture',historicalFiguresMarkdown:'Historical Figures',settlementsMarkdown:'Settlements',relationsMarkdown:'Relations',racialMovementMarkdown:'Traits & Biology',galleryMarkdown:'Gallery',gmNotesMarkdown:'GM Notes' };
    for (const [field, section] of Object.entries(fields)) metadata[field] = sections[section] || '';
  }
  if (domain === 'talent') Object.assign(metadata, { rankDetails:[1,2,3,4,5].map(rank => sections[`Rank ${rank}`] || ''), ranks:metadata.ranks || 5 });
  entry.searchTerms = [title, domain, categoryPath.join(' '), entry.tags.join(' '), entry.body, JSON.stringify(filters)].join(' ').toLowerCase();
  return entry;
}
function generate({ check = false } = {}) {
  const entries = Object.keys(folders).flatMap(folder => walk(path.join(root,'content',folder)).filter(file => path.basename(file) === 'index.md').map(makeEntry)).sort((a,b) => a.id.localeCompare(b.id));
  const ids = new Set(), routes = new Set(), aliases = {};
  for (const entry of entries) {
    if (ids.has(entry.id) || routes.has(entry.route)) throw new Error(`Duplicate id or route: ${entry.id}`);
    ids.add(entry.id); routes.add(entry.route);
    for (const alias of [entry.id,entry.sourcePath,entry.route,...entry.aliases]) {
      // Historical routes sometimes shared a title across classes. Keep all targets
      // so the UI can show a choice instead of silently opening the wrong talent.
      aliases[alias] = aliases[alias] && aliases[alias] !== entry.id
        ? [...new Set([...list(aliases[alias]),entry.id])] : entry.id;
    }
  }
  const compact = entries.map(entry => {
    const {content,sections,tabs,description,name,searchTerms,...record}=entry;
    record.metadata=Object.fromEntries(Object.entries(record.metadata).filter(([key]) => !key.endsWith('Markdown') && key!=='rankDetails'));
    return record;
  });
  const payload = { version:'asteria-compendium-v2', contentHash:crypto.createHash('sha256').update(JSON.stringify(compact)).digest('hex'), domains:schema.domainLabels, databases:schema.databaseDefinitions, workspaceSections:schema.workspaceSections, tabTemplates:schema.tabTemplates, filterFields:schema.domainFilterFields, entries:compact, aliases };
  const text = `/* Generated by npm run content:build from content/. Do not edit. */\n(function(root){\n  const headingName = ${headingName.toString()};\n  const data = (${hydrate.toString()})(${JSON.stringify(payload,null,2)});\n  if(typeof module === 'object' && module.exports) module.exports = data;\n  else root.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX = data;\n})(typeof window === 'object' ? window : globalThis);\n`;
  if (check) {
    if (!fs.existsSync(output) || fs.readFileSync(output,'utf8') !== text) throw new Error('Compendium is stale. Run npm run content:build.');
  } else fs.writeFileSync(output,text);
  console.log(`${check ? 'Verified' : 'Generated'} ${entries.length} canonical entries.`);
  return hydrate(payload);
}
if (require.main === module) generate({ check:process.argv.includes('--check') });
module.exports = { generate, makeEntry, folders, parseFrontmatter, stripFrontmatter, slugify };
