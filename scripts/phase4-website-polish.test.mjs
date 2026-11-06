import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Typography catalogue has 15 unique fonts; only readable fonts may be used for body text',()=>{
 const source=read('js/asteria-typography.js');
 new vm.Script(source,{filename:'asteria-typography.js'});
 const body=read('index.html');
 const css=read('css/asteria-typography.css');
 assert.match(body,/id="asteriaTypographyMenu"/);
 assert.match(body,/js\/asteria-typography\.js/);
 assert.match(body,/css\/asteria-typography\.css/);
 assert.match(source,/const READABLE = Object\.freeze\(FONTS\.filter\(font=>font\.type==='both'\)/);
 assert.match(source,/READABLE\.includes\(item\.reading\)/);
 assert.match(source,/localStorage\?\.setItem\(key\(\),JSON\.stringify\(current\)\)/);
 assert.match(source,/asteria\.typography\.v1\./);
 assert.match(source,/function mount\(host\)/);
 assert.match(source,/function refreshAccount\(\)/);
 assert.match(source,/https:\/\/fonts\.googleapis\.com\/css2\?family=/);
 assert.match(css,/--asteria-font-display/);
 assert.match(css,/--asteria-font-body/);
 assert.match(css,/--asteria-typography-scale/);
 const context={window:{addEventListener(){},session:{uid:'test'},localStorage:{getItem(){return null;}}},document:{readyState:'loading',addEventListener(){}}};
 vm.createContext(context);
 vm.runInContext(source,context);
 const fonts=context.window.AsteriaTypography.fonts;
 assert.equal(fonts.length,15);
 assert.equal(new Set(fonts.map(font=>font.id)).size,15);
 assert.ok(context.window.AsteriaTypography.readable.length>=6);
 const normalized=context.window.AsteriaTypography.normalize({heading:'pinyon-script',reading:'great-vibes',size:900});
 assert.equal(normalized.heading,'pinyon-script');
 assert.equal(normalized.reading,'source-serif-4');
 assert.equal(normalized.size,115);
});

test('Typography module does not modify the approved artwork or dashboard layout',()=>{
 const source=read('js/asteria-typography.js');
 for(const forbidden of ['backgroundImage','backgroundStyle','dashboardPreferences','panelBackgrounds','innerHTML','setDashboardBackground']){
  assert.equal(source.includes(forbidden),false,forbidden);
 }
 const html=read('index.html');
 for(const artwork of ['css/asteria-button-images.css','css/asteria-panel-headers.css','css/asteria-dashboard-panel-images.css'])
  assert.ok(html.includes(artwork),artwork);
});

test('Workspace cards open with an explicit accessible action and never reference undefined create',()=>{
 const source=read('js/clean-compendium.js');
 const workspace=source.slice(source.indexOf('  function workspaceCard('),source.indexOf('  function galleryCard('));
 const gallery=source.slice(source.indexOf('  function galleryCard('),source.indexOf('  function filterCards('));
 assert.doesNotMatch(workspace,/if \(create\)/);
 assert.match(workspace,/typeof action === 'function'/);
 assert.match(workspace,/open\.addEventListener\('click'/);
 assert.match(workspace,/open\.textContent = 'Open '/);
 assert.match(gallery,/workspace-gallery-copy/);
 assert.match(gallery,/event\.stopPropagation\(\)/);
 assert.match(gallery,/event\.key === 'Enter'/);
 assert.match(gallery,/event\.key === ' '/);
});
