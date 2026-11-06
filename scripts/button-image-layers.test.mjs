import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('css/asteria-button-image-layers.css'),index=read('index.html');
const family=['small','standard','long','icon'];
test('Phase 3 loading order preserves Phase 2 sizes and existing button interactions',()=>{
 const size=index.indexOf('css/asteria-button-sizes.css');
 const artwork=index.indexOf('css/asteria-button-image-layers.css');
 assert.ok(size>0&&artwork>size);
 assert.match(css,/data-asteria-button-size/);
 assert.match(css,/\[data-menu-pressed\]/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/pointer-events:none/);
});
test('Each button size has its own independent transparent frame and crystal file',()=>{
 for(const name of family){
  for(const layer of ['frame','crystal']){
   assert.match(css,new RegExp('button-'+name+'-'+layer+'\\.webp'));
  }
 }
 assert.match(css,/--asteria-button-frame-art/);
 assert.match(css,/--asteria-button-crystal-art/);
 assert.match(css,/--button-crystal-color/);
 assert.match(css,/mask-image:var\(--asteria-button-crystal-art\)/);
});
test('Critical gate: all 8 approved image files must exist before deployment',()=>{
 const missing=family.flatMap(name=>['frame','crystal'].map(layer=>
   'assets/ui/buttons/button-'+name+'-'+layer+'.webp')).filter(path=>!existsSync(new URL('../'+path,import.meta.url)));
 assert.deepEqual(missing,[],'Approved button artwork missing from GitHub: '+missing.join(', '));
});
