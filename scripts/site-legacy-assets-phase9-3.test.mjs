import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const exists=path=>existsSync(resolve(root,path));
const stableBundles=[
  'asteria-react.js','asteria-react-content-v1.js','asteria-react-content-v2.js',
  'asteria-react-GMDashboard.js','asteria-react-CharacterDashboard.js',
  'asteria-react-questRewardModel.js'
];
const retiredMaps=[
  'asteria-react.js.map','asteria-react-GMDashboard.js.map',
  'asteria-react-CharacterDashboard.js.map','asteria-react-questRewardModel.js.map'
];
test('all HTML entry and tool/fixture templates are preserved before Phase 10 cutover',()=>{
  for(const path of ['index.html','frontend/index.html',
    'scripts/fixtures/talent-preview.html','tools/weapon-crafting.html']){
    assert.ok(exists(path),path);
    assert.match(read(path),/<!doctype html>/i,path);
  }
  const legacy=read('index.html');
  assert.match(legacy,/src="src\/dev-entry\.js\?/);
  assert.match(legacy,/src="js\/app\.js\?/);
  assert.doesNotMatch(legacy,/src="\/src\/main\.jsx"/);
  const next=read('frontend/index.html');
  assert.match(next,/src="\/src\/main\.jsx"/);
  assert.doesNotMatch(next,/src="src\/dev-entry|react-dist|js\/app\.js/);
});
test('legacy-to-React bridge and trusted modern appearance schema remain intact',()=>{
  const bridge=read('src/app/legacyBridge.js');
  assert.match(bridge,/activateReactDashboard/);
  assert.match(bridge,/openLegacyView/);
  assert.match(bridge,/mirrorCharacterSnapshot/);
  const auth=read('frontend/src/auth/accountAppearanceBridge.mjs');
  assert.match(auth,/cloudAppearancePatch/);
  assert.match(auth,/appearanceRevisionsMatch/);
  assert.ok(exists('js/auth-bridge.js'));
  assert.ok(exists('js/character-access.js'));
  assert.match(read('src/dev-entry.js'),/react-dist\/asteria-react-content-v2\.js/);
});
test('four stale debug maps are deleted and the stable runtime has no broken source map links',()=>{
  const folder='react-dist/';
  for(const map of retiredMaps)assert.equal(exists(folder+map),false,map);
  for(const bundle of stableBundles){
    const path=folder+bundle;
    assert.ok(exists(path),path);
    assert.ok(statSync(resolve(root,path)).size>5000,path);
    assert.doesNotMatch(read(path),/sourceMappingURL=/,path);
  }
});
test('retained stable React entry and legacy import dependency paths exist',()=>{
  const files=new Set(readdirSync(resolve(root,'react-dist')));
  for(const file of stableBundles){
    const code=read('react-dist/'+file);
    const references=new Set([
      ...[...code.matchAll(/(?:from\s*|import\s*\(|,|=)\s*["']\.\/([^"'?#]+\.(?:js|css))["']/g)]
        .map(m=>m[1]),
      ...[...code.matchAll(/["']\.\/(asteria-react-[A-Za-z0-9_-]+\.(?:js|css))["']/g)]
        .map(m=>m[1])
    ]);
    for(const dependency of references){
      assert.ok(files.has(dependency),file+' references missing '+dependency);
    }
  }
  const entry=read('src/dev-entry.js');
  for(const path of ['react-dist/asteria-react-content-v2.js',
    'react-dist/asteria-react-royal-relic-v2.css'])
    assert.ok(exists(path),entry+' must resolve '+path);
});
test('new React bundle and legacy bundles stay isolated before production cutover',()=>{
  const vite=read('vite.site.config.mjs');
  const oldVite=read('vite.config.mjs');
  assert.match(vite,/frontend-dist/);
  assert.match(vite,/emptyOutDir:\s*true/);
  assert.match(oldVite,/outDir:\s*'react-dist'/);
  assert.match(oldVite,/emptyOutDir:\s*false/);
  assert.ok(exists('frontend/src/main.jsx'));
  assert.match(read('.gitignore'),/^frontend-dist\/$/m,
    'Generated preview build output must remain ignored by git');
});
