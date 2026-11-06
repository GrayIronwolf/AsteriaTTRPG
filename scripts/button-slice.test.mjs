import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';

const css=readFileSync('css/asteria-button-images.css','utf8');
const sizing=readFileSync('css/asteria-button-sizes.css','utf8');
const index=readFileSync('index.html','utf8');
const assets='assets/ui/buttons';

test('all eight approved frame/crystal assets still exist and remain split by family',()=>{
 for(const family of ['small','standard','long','icon']){
   assert.ok(existsSync(join(assets,`button-${family}-frame.webp`)));
   assert.ok(existsSync(join(assets,`button-${family}-crystal.webp`)));
   assert.match(css,new RegExp(`data-asteria-button-size="${family}"`));
 }
 assert.match(css,/button-standard-frame\.webp/);
 assert.match(css,/button-standard-crystal\.webp/);
});
test('protected endcaps slice only the unornamented centre, maintaining crystal masking',()=>{
 assert.match(css,/border-image-source:var\(--asteria-approved-frame\)!important/);
 assert.match(css,/border-image-slice:0 var\(--asteria-button-source-cap\) 0 var\(--asteria-button-source-cap\) fill!important/);
 assert.match(css,/border-image-width:0 var\(--asteria-button-render-cap\) 0 var\(--asteria-button-render-cap\)!important/);
 assert.match(css,/-webkit-mask-box-image-source:var\(--asteria-approved-crystal\)!important/);
 assert.match(css,/-webkit-mask-box-image-slice:0 var\(--asteria-button-source-cap\) 0 var\(--asteria-button-source-cap\) fill!important/);
 assert.match(css,/\@supports \(-webkit-mask-box-image-slice:/);
 assert.match(css,/:not\(\[data-asteria-button-size="icon"\]\)::before/);
 assert.match(css,/:not\(\[data-asteria-button-size="icon"\]\)::after/);
});
test('four size families keep unchanged width/height targets and metadata',()=>{
 for(const [family,w,h] of [['small',160,40],['standard',220,48],['long',360,53],['icon',53,53]]){
   assert.match(sizing,new RegExp(`--asteria-button-${family}-width:${w}px;`));
   assert.match(sizing,new RegExp(`--asteria-button-${family}-height:${h}px;`));
 }
 assert.ok(index.indexOf('asteria-button-images.css')>index.indexOf('asteria-button-sizes.css'));
});
test('hover, keyboard press, reduced motion and existing theme colour survive',()=>{
 assert.match(css,/--button-crystal-color/);
 assert.match(css,/data-menu-pressed/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(css,/pointer-events:none!important/);
 assert.match(css,/--asteria-crystal-brightness/);
 assert.doesNotMatch(css,/innerHTML\s*=|addEventListener\(/);
});
