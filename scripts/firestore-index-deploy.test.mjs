import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { FirestoreApi } = require('firebase-tools/lib/firestore/api');
const { indexes, fieldOverrides } = JSON.parse(
  readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'),
);

// Exercise the installed deployment CLI with Asteria's real index definitions.
// Firestore can return explicit defaults and an implicit __name__ field even
// though those values are omitted from the local specification (upstream #8859).
function serverIndex(spec, id) {
  return {
    name: `projects/demo-asteria/databases/(default)/collectionGroups/${spec.collectionGroup}/indexes/${id}`,
    queryScope: spec.queryScope,
    apiScope: 'ANY_API',
    density: 'SPARSE_ALL',
    multikey: false,
    state: 'READY',
    fields: [...structuredClone(spec.fields), {
      fieldPath: '__name__',
      order: spec.fields.at(-1).order,
    }],
  };
}

function deployment(existing) {
  const api = new FirestoreApi();
  const created = [];
  const removed = [];
  // No credentials or network access: fail if a future CLI calls a new API.
  api.apiClient = new Proxy({}, {
    get: (_target, operation) => () => {
      throw new Error(`Unexpected network operation: ${String(operation)}`);
    },
  });
  api.listIndexes = async () => FirestoreApi.processIndexes(existing);
  api.listFieldOverrides = async () => [];
  api.getDatabase = async () => ({ databaseEdition: 'STANDARD' });
  api.createIndex = async (_project, spec) => {
    created.push(structuredClone(spec));
    existing.push(serverIndex(spec, `created-${created.length}`));
  };
  api.deleteIndex = async (index) => { removed.push(index.name); };
  const run = () => api.deploy(
    { project: 'demo-asteria', nonInteractive: true, force: false },
    structuredClone(indexes),
    structuredClone(fieldOverrides),
  );
  return { run, created, removed };
}

test('repeat deployment preserves both existing event indexes with server defaults', async () => {
  const deploy = deployment(indexes.map(serverIndex));
  await deploy.run();
  await deploy.run();
  assert.deepEqual(deploy.created, []);
  assert.deepEqual(deploy.removed, []);
});

test('deployment creates only a missing event index and skips it on the next run', async () => {
  const deploy = deployment([serverIndex(indexes[0], 'existing')]);
  await deploy.run();
  await deploy.run();
  assert.deepEqual(deploy.created, [indexes[1]]);
  assert.deepEqual(deploy.removed, []);
});

test('default normalization still detects a different indexed field order', async () => {
  const existing = indexes.map(serverIndex);
  existing[0].fields[0].order = 'DESCENDING';
  const deploy = deployment(existing);
  await deploy.run();
  assert.deepEqual(deploy.created, [indexes[0]]);
  assert.deepEqual(deploy.removed, []);
});
