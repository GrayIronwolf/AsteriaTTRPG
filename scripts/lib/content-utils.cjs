const yaml = require('js-yaml');

function slugify(value) {
  return String(value ?? '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'entry';
}
function stripFrontmatter(markdown) {
  return String(markdown || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}
function parseFrontmatter(markdown) {
  const match = String(markdown || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const metadata = match ? yaml.safeLoad(match[1], { schema:yaml.JSON_SCHEMA }) || {} : {};
  if (typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Frontmatter must be a mapping.');
  // Preserve authored spelling; normalize historical fields at this one boundary.
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = key.replace(/[_ -]+([a-z])/gi, (_, letter) => letter.toUpperCase()).replace(/^[A-Z]/, letter => letter.toLowerCase());
    if (metadata[normalized] === undefined) metadata[normalized] = value;
    if (/^(naturalac|nac|neutralac|naturalarmou?rclass)$/i.test(key.replace(/[_ -]/g, ''))) metadata.naturalAC = value;
  }
  return metadata;
}
function headingName(value) {
  const name=String(value).replace(/[*`]/g,'').replace(/^[^\p{L}\p{N}]+/u,'').trim();
  return {Description:'Overview','Crafting Information':'Crafting'}[name] || name;
}
function sectionsFromMarkdown(markdown, domain) {
  const sections = {};
  let current = 'Overview';
  const raceSections = new Set(['Overview','Racial Features','Racial Characteristics','Racial Traits','Lore','Culture','Historical Figures','Settlements','Relations','Traits & Biology','Gallery','GM Notes']);
  for (const line of stripFrontmatter(markdown).split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading && (domain !== 'race' || raceSections.has(headingName(heading[1])))) { current = headingName(heading[1]); continue; }
    sections[current] = (sections[current] || '') + line + '\n';
  }
  return Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.trim()]));
}
module.exports = { slugify, stripFrontmatter, parseFrontmatter, sectionsFromMarkdown, headingName };
