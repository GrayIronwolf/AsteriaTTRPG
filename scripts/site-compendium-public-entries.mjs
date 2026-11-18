/**
 * Publish only content expressly marked public, with GM/private sections
 * removed BEFORE Vite ever sees the resulting JSON. Source is unchanged.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPublicSections, isRestrictedSectionTitle } from '../frontend/src/compendium/publicSections.mjs';
import {isPublishedDefinition, validatePublishedEntry} from '../frontend/src/compendium/publicationPolicy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'data/compendium-parts');
const output = resolve(root, 'frontend/src/compendium/public-entry-index');
const domains = [
  'race', 'class', 'creature', 'item', 'spell', 'talent', 'profession',
  'skill', 'origin', 'location', 'religion', 'faction', 'lore', 'handbook'
];
const published = new Map(domains.map(domain => [domain, []]));
const seen = new Set();
let hidden = 0, written = 0, sectionsWritten = 0;
for (const filename of readdirSync(source).filter(x=>/^[a-z]+-[a-f0-9]+\.json$/.test(x)).sort()) {
  const data = JSON.parse(readFileSync(join(source, filename), 'utf8'));
  assert.ok(published.has(data.domain), 'Unrecognised source domain');
  for (const entry of data.entries) {
    if (!isPublishedDefinition(entry)) {
      hidden++;
      continue;
    }
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.slug, 'string');
    assert.ok(!seen.has(entry.id), 'Duplicated public entry identity: ' + entry.id);
    seen.add(entry.id);
    const sections = extractPublicSections(entry.body);
    assert.ok(sections.every(item => !isRestrictedSectionTitle(item.title)));
    // No raw unrestricted body/metadata, GM notes, personal IDs, or aliases.
    published.get(data.domain).push(validatePublishedEntry({
      id: entry.id,
      title: String(entry.title),
      slug: entry.slug,
      domain: data.domain,
      summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 500) : '',
      categoryPath: Array.isArray(entry.categoryPath)
        ? entry.categoryPath.filter(x => typeof x === 'string').slice(0,6) : [],
      sections
    },data.domain));
    written++;
    sectionsWritten += sections.length;
  }
}
assert.ok(written > 0 && seen.size === written);
mkdirSync(output, {recursive:true});
for (const domain of domains) {
  const entries=published.get(domain).sort((a,b)=>a.title.localeCompare(b.title,'en') || a.id.localeCompare(b.id));
  writeFileSync(join(output,domain+'.json'),
    JSON.stringify({version:1,domain,entries})+'\n', 'utf8');
}
console.log('PASS: generated '+written+' public entries with '+sectionsWritten+
  ' public sections; '+hidden+' nonpublic entries excluded from built entry assets.');
