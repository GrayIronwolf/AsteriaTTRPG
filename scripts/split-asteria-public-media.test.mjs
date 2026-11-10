import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MEDIA_SITE_ID,MEDIA_ORIGIN,canonicalPublicPath,resolvePublicMedia,rewritePublicMediaText} from './split-asteria-public-media.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('the secondary site is scoped to public, non-secret media only',()=>{
  assert.equal(MEDIA_SITE_ID,'asteria-ttrpg-media');
  assert.equal(MEDIA_ORIGIN,'https://asteria-ttrpg-media.web.app');
  const config=JSON.parse(read('firebase.public-media.json'));
  assert.equal(config.hosting.target,'publicMedia');
  assert.equal(config.hosting.public,'.asteria-deploy/media');
  const rc=JSON.parse(read('.firebaserc'));
  assert.deepEqual(rc.targets['asteria-ttrpg'].hosting.publicMedia,[MEDIA_SITE_ID]);
  assert.equal(rc.projects.default,'demo-asteria');
  assert.equal(rc.projects.production,'asteria-ttrpg');
  assert.equal(JSON.parse(read('firebase.json')).hosting,undefined);
});
test('only already-public asset and Compendium image paths are eligible',()=>{
  assert.equal(canonicalPublicPath('assets/races/dark-pixie/image.png'),'assets/races/dark-pixie/image.png');
  assert.equal(canonicalPublicPath('../content/items/rat-meat/image.png'),'content/items/rat-meat/image.png');
  for(const p of ['content/items/rat-meat/index.md','users/user1/profile/avatar',
    'gs://asteria-ttrpg.appspot.com/users/user1/profile/avatar',
    'https://firebasestorage.googleapis.com/path/asset.png',
    'assets/../secrets.png','javascript:alert(1)','data:image/png;base64,abc'])
    assert.equal(canonicalPublicPath(p),null,p);
});
test('media routing preserves query strings and does not touch private storage URLs',()=>{
  assert.equal(resolvePublicMedia('assets/header/asteria-wordmark.png'),MEDIA_ORIGIN+'/assets/header/asteria-wordmark.png');
  assert.equal(resolvePublicMedia('../content/items/rat-meat/image.png?scale=2'),MEDIA_ORIGIN+'/content/items/rat-meat/image.png?scale=2');
  assert.equal(resolvePublicMedia('https://firebasestorage.googleapis.com/v0/b/asteria-ttrpg/o/users%2Fuid%2Fprofile%2Favatar?token=123'),'https://firebasestorage.googleapis.com/v0/b/asteria-ttrpg/o/users%2Fuid%2Fprofile%2Favatar?token=123');
});
test('rewrite CSS, HTML and generated Compendium image references, without changing routes',()=>{
  const source=[
    '<image href="assets/header/asteria-wordmark.png"/>',
    'background:url("../assets/ui/dashboard/panel-backdrop-obsidian.webp")',
    'image:"content/items/rat-meat/image.png"',
    'sourcePath:"content/items/rat-meat/index.md"',
    'link:"https://example.com/assets/races/a.png"',
    'upload:"https://firebasestorage.googleapis.com/v0/b/assets/account.png"'
  ].join('\n');
  const result=rewritePublicMediaText(source,'index.html');
  assert.equal(result.assetReferences,2);
  assert.equal(result.contentReferences,1);
  assert.match(result.text,new RegExp(MEDIA_ORIGIN.replaceAll('.','\\.')+'/assets/header/asteria-wordmark.png'));
  assert.match(result.text,/sourcePath:"content\/items\/rat-meat\/index.md"/);
  assert.match(result.text,/https:\/\/example.com\/assets\/races\/a.png/);
  assert.match(result.text,/https:\/\/firebasestorage.googleapis.com/);
});
test('preserve Vite-owned react-dist/assets hashed bundles while relocating root assets',()=>{
  const retained=new Set(['react-dist/assets/menu-parchment-ABC.webp']);
  const text='url(assets/menu-parchment-ABC.webp);background:url("../assets/ui/dashboard/panel-backdrop-obsidian.webp")';
  const out=rewritePublicMediaText(text,'react-dist/asteria-react-royal-relic-v2.css',retained);
  assert.match(out.text,/url\(assets\/menu-parchment-ABC.webp\)/);
  assert.match(out.text,/url\("https:\/\/asteria-ttrpg-media.web.app\/assets\/ui\/dashboard\/panel-backdrop-obsidian.webp"\)/);
  assert.equal(out.assetReferences,1);
});
test('no full-site GitHub Pages or Firebase backend deploy is performed by split tooling',()=>{
  const script=read('scripts/split-asteria-public-media.mjs');
  assert.doesNotMatch(script,/child_process|execSync|spawnSync|httpsCallable|firebase deploy|deploy-pages/);
  const media=JSON.parse(read('firebase.public-media.json'));
  assert.equal(Object.keys(media).join(','),'hosting');
});
