import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import { resolvePublicEntry } from '../frontend/src/compendium/publicEntryModel.mjs';
import {
  classifyCompendiumBookmark,
  isCompatibleBookmark,
  readCompendiumRouteBaseline
} from './site-restoration-compendium-baseline.mjs';

const baseline = readCompendiumRouteBaseline();
let vite;
let loadEntry;

before(async () => {
  execFileSync(process.execPath, [
    fileURLToPath(new URL('./site-compendium-public-entries.mjs', import.meta.url))
  ], { stdio: 'inherit' });
  vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('../frontend', import.meta.url)),
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null }
  });
  ({ loadPublicEntry: loadEntry } = await vite.ssrLoadModule('/src/compendium/publicEntryLoader.mjs'));
});

after(async () => {
  await vite?.close();
});

test('all 891 original Compendium URLs retain their definition identity or have a known unresolved Talent gap', async t => {
  const counts = {};
  const regressions = [];
  const results = [];
  for (const bookmark of baseline) {
    const outcome = await classifyCompendiumBookmark(bookmark, loadEntry);
    counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
    const result = { ...bookmark, ...outcome };
    results.push(result);
    if (!isCompatibleBookmark(bookmark, outcome)) regressions.push(result);
  }
  if (process.env.ASTERIA_COMPENDIUM_REPORT) {
    await writeFile(process.env.ASTERIA_COMPENDIUM_REPORT, JSON.stringify({ counts, results }, null, 2) + '\n');
  }
  t.diagnostic(JSON.stringify(counts));
  assert.equal(regressions.length, 0, JSON.stringify(regressions.slice(0, 15), null, 2));
});

test('bookmarked routes distinguish no route from no published definition', async () => {
  const definitionId = 'item:content-materials-1-common-metals-iron-ingot-index';
  assert.deepEqual(
    await classifyCompendiumBookmark({ href: '#/nonexistent-route', definitionId }, loadEntry),
    { status: 'missing', stage: 'router' }
  );
  assert.deepEqual(
    await classifyCompendiumBookmark({ href: '#/compendium/item/nonexistent-definition', definitionId }, loadEntry),
    { status: 'missing', stage: 'entry' }
  );
});

test('a catalogue landing is an incorrect destination for an entry bookmark', async () => {
  const outcome = await classifyCompendiumBookmark({
    href: '#/compendium', definitionId: 'item:content-materials-1-common-metals-iron-ingot-index'
  }, loadEntry);
  assert.deepEqual(outcome, { status: 'wrong-destination', routeId: 'compendium' });
});

test('an entry page showing the wrong definition ID is a regression', async () => {
  const outcome = await classifyCompendiumBookmark({
    href: '#/compendium/item/iron-ingot', definitionId: 'item:content-minerals-1-common-ores-iron-ore-index'
  }, loadEntry);
  assert.deepEqual(outcome, {
    status: 'wrong-definition', actualId: 'item:content-materials-1-common-metals-iron-ingot-index'
  });
});

test('an ambiguous entry cannot satisfy a unique bookmark', async () => {
  const candidates = [
    { id: 'talent:first-definition', slug: 'shared-name' },
    { id: 'talent:second-definition', slug: 'shared-name' }
  ];
  const outcome = await classifyCompendiumBookmark({
    href: '#/compendium/talent/shared-name', definitionId: 'talent:first-definition'
  }, async (_domain, slug) => resolvePublicEntry(candidates, slug));
  assert.deepEqual(outcome, { status: 'ambiguous' });
});

test('only known gaps may stay missing, and a correct fix passes without changing the oracle', () => {
  const resolved = { status: 'resolved' };
  const missing = { status: 'missing', stage: 'entry' };
  assert.equal(isCompatibleBookmark({ phase1Status: 'ready' }, missing), false);
  assert.equal(isCompatibleBookmark({ phase1Status: 'missing' }, missing), true);
  assert.equal(isCompatibleBookmark({ phase1Status: 'missing' }, resolved), true);
  for (const status of ['wrong-destination', 'wrong-definition', 'ambiguous']) {
    assert.equal(isCompatibleBookmark({ phase1Status: 'missing' }, { status }), false);
  }
});
