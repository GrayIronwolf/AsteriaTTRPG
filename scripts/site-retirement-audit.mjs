/**
 * Phase 2.5: evidence-only retirement audit. Does NOT modify legacy code.
 * Future deletion requires per-feature parity and the approved final cutover.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const ledger = JSON.parse(read('docs/frontend-overhaul/PHASE-2.5-RETIREMENT-LEDGER.json'));
const legacyHtml = read('index.html');
const previewHtml = read('frontend/index.html');
const legacyRefs = [...legacyHtml.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
  .map(match => match[1].split(/[?#]/)[0].replace(/^\/+/, ''));
const loaded = new Set(legacyRefs);

assert.equal(ledger.schemaVersion, 1);
assert.equal(ledger.removalPolicy, 'none_before_parity_and_approved_production_cutover');
assert.ok(Array.isArray(ledger.groups) && ledger.groups.length >= 5);
assert.match(legacyHtml, /src="js\/app\.js\?/);
assert.match(legacyHtml, /src="src\/dev-entry\.js\?/);
assert.match(previewHtml, /src="\/src\/main\.jsx"/);
assert.doesNotMatch(previewHtml, /(?:css\/styles\.css|js\/app\.js|react-dist)/);

const seen = new Set();
const groups = ledger.groups.map(group => {
  assert.match(group.id, /^[a-z][a-z0-9-]+$/);
  assert.ok(group.replacement && group.blockers?.length > 0, group.id);
  const files = group.legacyFiles.map(path => {
    assert.match(path, /^(?:js|css)\/[a-zA-Z0-9._/-]+$/);
    assert.equal(seen.has(path), false, 'Duplicate retirement candidate: ' + path);
    seen.add(path);
    const retired = group.removedFiles?.includes(path)===true;
    if(retired) {
      assert.equal(group.removedInPhases?.[path],path.endsWith('.css')?'9.1':'9.2');
      assert.ok(['9.1','9.2'].includes(group.removedInPhases?.[path]));
      assert.equal(existsSync(resolve(root,path)),false,
        'Previously disabled controller or stylesheet must not be reintroduced: '+path);
    } else assert.ok(existsSync(resolve(root, path)),
      'Live legacy source missing before feature parity: ' + path);
    const isLoaded = loaded.has(path);
    const expectedLoaded = group.expectLoadedInLegacy !== false && !retired;
    assert.equal(isLoaded, expectedLoaded,
      'Changed legacy loading state without explicit migration approval: ' + path);
    return { path, loadedInLegacy: isLoaded,
      bytes: retired?0:readFileSync(resolve(root, path)).length,
      retirementReady: retired };
  });
  return { id: group.id, replacement: group.replacement,
    blockers: group.blockers, files,
    retirementReady: files.every(file=>file.retirementReady) };
});

function walk(dir) {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
}
const previewSources = walk('frontend/src')
  .filter(path => /\.(?:js|jsx|mjs|css)$/.test(path));
for (const path of previewSources) {
  const text = read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(text, /(?:from\s+|import\s*)['"][^'"]*(?:\/js\/|\/css\/|legacyBridge)/,
    'React preview imported old controllers or styles: ' + path);
  assert.doesNotMatch(text, /window\.(?:setView|AsteriaFirebase|AsteriaRouter|AsteriaState)\b/,
    'Duplicate route/service owner in ' + path);
  assert.doesNotMatch(text, /!important\b/,
    'React preview has high-specificity CSS overrides: ' + path);
}
const legacyCssCount = [...loaded].filter(p => /^css\/.*\.css$/.test(p)).length;
const legacyJsCount = [...loaded].filter(p => /^js\/.*\.js$/.test(p)).length;
const report = {
  phase: '2.5',
  generatedAt: new Date().toISOString(),
  auditOnly: true,
  productionEntryUnchanged: true,
  liveCutoverAllowed: false,
  candidateCount: seen.size,
  legacyCssDirectRefs: legacyCssCount,
  legacyJsDirectRefs: legacyJsCount,
  reactSourceFilesScanned: previewSources.length,
  groups
};

const directory = resolve(process.env.RUNNER_TEMP || tmpdir(), 'asteria-phase-2-5-integration-evidence');
mkdirSync(directory, { recursive: true });
writeFileSync(join(directory, 'legacy-retirement-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: ' + report.candidateCount + ' retirement candidates retained, ' +
  legacyCssCount + ' legacy CSS and ' + legacyJsCount + ' JS direct references still protected.');
