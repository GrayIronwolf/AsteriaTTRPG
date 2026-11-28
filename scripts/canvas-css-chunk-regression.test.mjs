import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('React CSS assets cannot overwrite each other during code splitting',()=>{
  const vite=read('vite.config.mjs');
  assert.match(vite,/assetFileNames:\s*asset\s*=>\s*asset\.name\?\.endsWith\('\.css'\)/);
  assert.match(vite,/asteria-react-\[name\]-\[hash\]\[extname\]/);
  assert.doesNotMatch(vite,/asset\.name\?\.endsWith\('\.css'\)\s*\?\s*'asteria-react-royal-relic-v2\.css'/);
});

test('Canvas style module still defines positioning and controls',()=>{
  const css=read('src/dashboards/combat/CombatCommandCentre.module.css');
  assert.match(css,/\.canvas\{position:relative/);
  assert.match(css,/\.window\[data-combat-panel\]\{position:absolute/);
  assert.match(css,/\.stage\{position:absolute/);
  assert.match(css,/\.canvasActions\{position:absolute/);
});

test('Test-branch build workflow regenerates CSS when Vite config changes',()=>{
  const yaml=read('.github/workflows/build-combat-test-assets.yml');
  assert.match(yaml,/vite\.config\.mjs/);
  assert.match(yaml,/git add -- react-dist/);
});
