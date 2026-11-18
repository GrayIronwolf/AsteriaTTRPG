import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'frontend-dist');
const index = resolve(dist, 'index.html');
const manifestPath = resolve(dist, '.vite/manifest.json');

assert.ok(existsSync(index), 'Missing built React/Vite HTML entry');
assert.ok(existsSync(manifestPath), 'Missing new frontend build manifest');
const html = readFileSync(index, 'utf8');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const entry = manifest['index.html'];

assert.ok(entry?.isEntry, 'No Vite HTML entry in manifest');
assert.ok(entry.file && existsSync(resolve(dist, entry.file)), 'Compiled entry JavaScript is missing');
assert.ok(entry.css?.length, 'Expected a compiled frontend stylesheet');
for (const css of entry.css) {
  assert.ok(existsSync(resolve(dist, css)), `Missing compiled CSS: ${css}`);
}
assert.match(html, /id="asteria-site-root"/);
assert.match(html, /<script type="module" crossorigin/);
assert.doesNotMatch(html, /js\/app\.js|react-dist|css\/styles\.css/);
console.log('PASS: isolated React/Vite HTML, entry JS, CSS and manifest exist.');
