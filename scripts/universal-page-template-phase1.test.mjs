import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('disabled universal template controller and stylesheet have both been retired',()=>{
  const html=read('index.html');
  assert.equal(existsSync(new URL('../js/asteria-page-template.js',import.meta.url)),false);
  assert.equal(existsSync(new URL('../css/asteria-page-template.css',import.meta.url)),false);
  assert.doesNotMatch(html,/src="js\/asteria-page-template\.js/);
  assert.doesNotMatch(html,/href="css\/asteria-page-template\.css/);
  const ledger=JSON.parse(read('docs/frontend-overhaul/PHASE-2.5-RETIREMENT-LEDGER.json'));
  const retired=ledger.groups.find(group=>group.id==='disabled-universal-page-template');
  assert.deepEqual(retired.removedFiles,[
    'css/asteria-page-template.css','js/asteria-page-template.js']);
  assert.deepEqual(retired.removedInPhases,{
    'css/asteria-page-template.css':'9.1',
    'js/asteria-page-template.js':'9.2'
  });
});

test('legacy account screen is preserved until React production cutover',()=>{
  const html=read('index.html');
  for(const id of ['asteriaAccountPage','asteriaAccountPanelProfile',
    'asteriaAccountPanelSettings','asteriaAccountPanelAppearance',
    'asteriaAccountPanelSecurity'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.ok(html.includes('css/asteria-account-pages.css'));
  assert.ok(html.includes('js/asteria-account-pages.js'));
  assert.ok(html.includes('css/asteria-solid-navy-surfaces.css'));
  assert.match(html,/data-asteria-account-action="logout"/);
});

test('React PageLayout replaces the template without global DOM controllers',()=>{
  const css=read('frontend/src/components/ui/PageLayout.module.css');
  const jsx=read('frontend/src/components/ui/PageLayout.jsx');
  const main=read('frontend/src/main.jsx');
  assert.match(css,/\.page\s*\{/);
  assert.match(css,/var\(--ast-page-gutter\)/);
  assert.match(jsx,/styles\.page/);
  assert.doesNotMatch(css,/!important|:global\(|@import/);
  assert.doesNotMatch(main,/asteria-page-template|window\.setView/);
});
