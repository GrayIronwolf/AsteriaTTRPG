import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPublicSectionHref, isValidPublicEntryRoute } from '../frontend/src/compendium/publicEntryModel.mjs';
import { parseSiteRoute } from '../frontend/src/router/siteRoutes.mjs';

const originalRevision = 'cc4e78680c7482f9e105d655c50a7cc30a339d62';
const auditedReactRevision = '20c4bac7511496d259600d7321c301217e30c276';
const auditSha256 = '65188e8534e0446eaf0cceff2bd8ad941691ce74f954d117935e0a21f9b3d8eb';
const baselineFile = new URL('./fixtures/site-restoration-compendium-routes.tsv', import.meta.url);
const header = 'legacyHref\tdefinitionId\tphase1Status';
const provenance = [
  '# Original revision: ' + originalRevision,
  '# Phase 1 React revision: ' + auditedReactRevision,
  '# Phase 1 public-entry-route-inventory.tsv SHA-256: ' + auditSha256,
  '# Regenerate from the audit TSV using scripts/site-restoration-compendium-baseline.mjs.'
];

function checkBaseline(bookmarks) {
  assert.equal(bookmarks.length, 891, 'Expected all original public Compendium routes');
  assert.equal(new Set(bookmarks.map(row => row.href)).size, 891, 'Duplicate original route');
  assert.equal(new Set(bookmarks.map(row => row.definitionId)).size, 891, 'Duplicate original definition ID');
  let gaps = 0;
  for (const { href, definitionId, phase1Status } of bookmarks) {
    assert.match(href, /^#\/compendium\/[a-z]+\/[a-z0-9-]+$/);
    assert.ok(definitionId, 'Missing definition ID for ' + href);
    if (phase1Status === 'missing') {
      assert.ok(href.startsWith('#/compendium/talent/'), 'An allowed gap must be an audited Talent bookmark');
      gaps++;
    } else {
      assert.equal(phase1Status, 'ready', 'Invalid phase 1 status for ' + href);
    }
  }
  assert.equal(gaps, 226, 'Expected the audited Talent allowlist');
  return bookmarks;
}

export function readCompendiumRouteBaseline() {
  const lines = readFileSync(baselineFile, 'utf8').trimEnd().split('\n');
  assert.deepEqual(lines.splice(0, provenance.length), provenance);
  assert.equal(lines.shift(), header);
  return checkBaseline(lines.map(line => {
    const columns = line.split('\t');
    assert.equal(columns.length, 3, 'Invalid bookmark baseline row');
    const [href, definitionId, phase1Status] = columns;
    return { href, definitionId, phase1Status };
  }));
}

export async function classifyCompendiumBookmark({ href, definitionId }, loadEntry) {
  const route = parseSiteRoute({ hash: href });
  if (route.id === 'not-found') return { status: 'missing', stage: 'router' };
  if (route.id !== 'compendium-entry') return { status: 'wrong-destination', routeId: route.id };

  const { domain, slug } = route.params;
  const { state, entry } = await loadEntry(domain, slug);
  if (state === 'missing') {
    if (isValidPublicEntryRoute(domain, slug)) {
      const target = createPublicSectionHref(domain, slug);
      if (target !== href) return { status: 'wrong-destination', target };
    }
    return { status: 'missing', stage: 'entry' };
  }
  if (state === 'ambiguous') return { status: 'ambiguous' };
  assert.equal(state, 'ready', 'Unexpected public entry loader state for ' + href);
  return entry.id === definitionId
    ? { status: 'resolved' }
    : { status: 'wrong-definition', actualId: entry.id };
}

export function isCompatibleBookmark(bookmark, outcome) {
  return outcome.status === 'resolved' ||
    (outcome.status === 'missing' && bookmark.phase1Status === 'missing');
}

function originalRoutes() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const paths = git(['ls-tree', '-r', '-z', '--name-only', originalRevision, '--', 'data/compendium-parts'])
    .split('\0').filter(path => /^data\/compendium-parts\/[a-z]+-[a-f0-9]+\.json$/.test(path));
  assert.ok(paths.length > 0, 'No definition shards in the pinned original revision');
  const routes = new Map();
  for (const path of paths) {
    const shard = JSON.parse(git(['show', originalRevision + ':' + path]));
    for (const entry of shard.entries) {
      if (entry.visibility !== 'public' || entry.gmOnly === true) continue;
      const href = '#' + entry.route;
      assert.equal(routes.has(href), false, 'Duplicate original definition URL: ' + href);
      routes.set(href, entry.id);
    }
  }
  return routes;
}

function generateBaseline(auditPath) {
  const audit = readFileSync(auditPath);
  assert.equal(createHash('sha256').update(audit).digest('hex'), auditSha256, 'Unexpected Phase 1 route audit');
  const lines = audit.toString('utf8').trimEnd().split('\n');
  const columns = lines.shift().split('\t');
  const hrefColumn = columns.indexOf('legacyHref');
  const idColumn = columns.indexOf('definitionId');
  const baselineColumn = columns.indexOf('reactOutcomeForLegacyHref');
  assert.ok([hrefColumn, idColumn, baselineColumn].every(index => index !== -1));
  const bookmarks = checkBaseline(lines.map(line => {
    const fields = line.split('\t');
    return { href: fields[hrefColumn], definitionId: fields[idColumn], phase1Status: fields[baselineColumn] };
  }));

  const pinned = originalRoutes();
  assert.equal(pinned.size, bookmarks.length, 'Audit and original routes differ in size');
  for (const { href, definitionId } of bookmarks) {
    assert.equal(pinned.get(href), definitionId, 'Audit ID differs from original for ' + href);
  }

  return [...provenance, header, ...bookmarks.map(({ href, definitionId, phase1Status }) =>
    [href, definitionId, phase1Status].join('\t'))].join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/site-restoration-compendium-baseline.mjs path/to/public-entry-route-inventory.tsv');
  process.stdout.write(generateBaseline(process.argv[2]));
}
