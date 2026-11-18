/**
 * Phase 3.1: derived, PUBLIC catalogue shards from the canonical Compendium
 * partitions. Never bundle the unfiltered source parts or GM-only notes into
 * the guest React/Vite preview. This script does not edit authoring sources.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {isPublishedDefinition, validatePublishedCatalogue} from '../frontend/src/compendium/publicationPolicy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'data/compendium-parts');
const target = resolve(root, 'frontend/src/compendium/public-index');
const DOMAINS = Object.freeze([
  'race', 'class', 'creature', 'item', 'spell', 'talent', 'profession',
  'skill', 'origin', 'location', 'religion', 'faction', 'lore', 'handbook'
]);
const allowed = new Set(DOMAINS);
const published = new Map(DOMAINS.map(id => [id, []]));
const seenIds = new Set();
const seenRoutes = new Set();
let omitted = 0;
let inputCount = 0;
let ambiguousRoutes = 0;

const parts = readdirSync(source).filter(name => /^[a-z]+-[a-f0-9]+\.json$/.test(name)).sort();
assert.ok(parts.length >= DOMAINS.length, 'Canonical generated content partitions missing');

for (const file of parts) {
  const part = JSON.parse(readFileSync(join(source, file), 'utf8'));
  assert.ok(allowed.has(part.domain), 'Unknown Compendium domain: ' + part.domain);
  assert.ok(Array.isArray(part.entries), 'Malformed canonical Compendium part: ' + file);
  for (const entry of part.entries) {
    inputCount++;
    assert.equal(entry.domain, part.domain, 'Entry/partition domain mismatch: ' + file);
    if (!isPublishedDefinition(entry)) {
      omitted++;
      continue;
    }
    for (const key of ['id', 'title', 'slug']) {
      assert.ok(typeof entry[key] === 'string' && entry[key].trim(),
        'Missing canonical identity field ' + key + ' in ' + file);
    }
    const route = part.domain + '/' + entry.slug;
    assert.ok(!seenIds.has(entry.id), 'Duplicate public definition ID: ' + entry.id);
    // Multiple canonical definitions can share a legacy slug (notably talents
    // from different classes). Preserve all distinct IDs but never publish an
    // ambiguous direct-entry link that could open the wrong definition.
    const ambiguous = seenRoutes.has(route);
    if (ambiguous) ambiguousRoutes++;
    const catalogueFallback = '#/compendium?domain=' + encodeURIComponent(part.domain) +
      '&q=' + encodeURIComponent(entry.title);
    if (ambiguous) {
      for (const prior of published.get(part.domain)) {
        if (prior.slug === entry.slug) prior.href = '#/compendium?domain=' +
          encodeURIComponent(part.domain) + '&q=' + encodeURIComponent(prior.title);
      }
    }
    seenIds.add(entry.id);
    seenRoutes.add(route);

    // Allowlist ONLY visible catalogue properties. Never copy body, sections,
    // markdown, metadata, ownership, sourcePath, imageReferences or GM Notes.
    const row = {
      id: entry.id,
      title: entry.title,
      slug: entry.slug,
      domain: part.domain,
      href: ambiguous ? catalogueFallback : '#/compendium/' +
        encodeURIComponent(part.domain) + '/' + encodeURIComponent(entry.slug),
      categoryPath: Array.isArray(entry.categoryPath)
        ? entry.categoryPath.filter(value => typeof value === 'string').slice(0, 6)
        : [],
      category: typeof entry.category === 'string' ? entry.category : '',
      summary: typeof entry.summary === 'string' ? entry.summary.slice(0, 500) : '',
      tags: Array.isArray(entry.tags)
        ? entry.tags.filter(value => typeof value === 'string').slice(0, 16)
        : []
    };
    // Keep the generator's route disambiguation mutable until all records
    // are processed; browser-side loaders freeze the finished projections.
    validatePublishedCatalogue(row,part.domain);
    published.get(part.domain).push(row);
  }
}

mkdirSync(target, { recursive: true });
const counts = {};
for (const domain of DOMAINS) {
  const entries = published.get(domain).sort((a,b) =>
    a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id, 'en'));
  writeFileSync(join(target, domain + '.json'),
    JSON.stringify({ version: 1, domain, entries }) + '\n', 'utf8');
  counts[domain] = entries.length;
}
const count = Object.values(counts).reduce((sum, value) => sum + value, 0);
assert.equal(count + omitted, inputCount);
assert.ok(count > 0, 'No public Compendium definitions');
console.log('PASS: prepared ' + count + ' public catalogue records from ' + parts.length +
  ' canonical shards (' + omitted + ' non-public excluded); ' +
  'ambiguous legacy routes sent to catalogue search: ' + ambiguousRoutes + '; ' +
  'no raw article bodies or GM sections copied.');
