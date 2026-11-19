/* Verify Vite copied every approved button image into the distributable. */
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const dir=resolve('frontend-dist/assets');
const files=readdirSync(dir);
const css=files.filter(name=>name.endsWith('.css'))
  .map(name=>readFileSync(join(dir,name),'utf8')).join('\n');
assert.ok(css,'Production CSS missing');
for(const family of ['small','standard','long','icon']){
 for(const layer of ['frame','crystal']){
  const prefix='button-'+family+'-'+layer;
  assert.ok(files.some(name=>name.startsWith(prefix+'-')&&name.endsWith('.webp')),
    'Vite did not package approved image: '+prefix);
  assert.ok(css.includes(prefix),'Compiled CSS does not reference approved image: '+prefix);
 }
}
assert.ok(css.includes('--ast-button-frame-art'),'Production frame token missing');
assert.ok(css.includes('--ast-button-crystal-art'),'Production crystal token missing');
console.log('PASS: all eight approved image layers appear in the production bundle.');
