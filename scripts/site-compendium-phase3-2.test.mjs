import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {isPublishedDefinition} from '../frontend/src/compendium/publicationPolicy.mjs';
import {
  extractPublicSections, isRestrictedSectionTitle
} from '../frontend/src/compendium/publicSections.mjs';
import {
  isValidPublicEntryRoute, resolvePublicEntry, createPublicSectionHref,
  resolveSelectedSection, getSafePublicHref
} from '../frontend/src/compendium/publicEntryModel.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const DOMAINS=['race','class','creature','item','spell','talent','profession',
  'skill','origin','location','religion','faction','lore','handbook'];

test('public entry generator preserves canonical identity, separates public sections and omits GM sections',()=>{
  let safeCount=0, removed=0;
  const sourceFiles=readdirSync(resolve(root,'data/compendium-parts')).filter(x=>/^[a-z]+-[a-f0-9]+\.json$/.test(x));
  const source=new Map(DOMAINS.map(domain=>[domain,[]]));
  for(const filename of sourceFiles) {
    const partition=JSON.parse(read('data/compendium-parts/'+filename));
    for(const entry of partition.entries) {
      if(!isPublishedDefinition(entry)) {
        removed++;continue;
      }
      source.get(partition.domain).push(entry);
    }
  }
  for(const domain of DOMAINS) {
    const data=JSON.parse(read('frontend/src/compendium/public-entry-index/'+domain+'.json'));
    assert.equal(data.domain,domain);
    assert.equal(data.version,1);
    assert.equal(data.entries.length,source.get(domain).length);
    const expected=new Map(source.get(domain).map(entry=>[entry.id,entry]));
    for(const row of data.entries) {
      safeCount++;
      const original=expected.get(row.id);
      assert.ok(original,'Missing canonical definition '+row.id);
      assert.equal(row.slug,original.slug);
      assert.equal(row.title,original.title);
      assert.deepEqual(Object.keys(row).sort(),
        ['id','title','slug','domain','summary','categoryPath','sections'].sort());
      assert.deepEqual(row.sections,extractPublicSections(original.body));
      for(const section of row.sections) {
        assert.equal(isRestrictedSectionTitle(section.title),false,section.title);
        assert.equal(typeof section.body,'string');
        assert.ok(!section.body.includes('GM-only information coming soon.'));
        assert.ok(!section.body.includes('Hidden campaign notes can be added here.'));
      }
      assert.equal(row.metadata,undefined);
      assert.equal(row.sourcePath,undefined);
      assert.equal(row.aliases,undefined);
      assert.equal(row.body,undefined);
    }
  }
  assert.ok(safeCount>200,'Expected useful public Compendium content');
  assert.ok(removed>=0);
  const loader=read('frontend/src/compendium/publicEntryLoader.mjs');
  assert.match(loader,/import\.meta\.glob/);
  assert.match(loader,/public-entry-index/);
  assert.doesNotMatch(loader,/data\/compendium(?:\.js|-parts)/);
});

test('restricted top-level, nested and trailing sections are dropped before publishing',()=>{
  const markdown=[
    '# Asteria Example',
    'Prelude public text',
    '## Overview',
    'Public overview.',
    '### GM Notes',
    'SECRETFORGM01',
    '#### Personal Secrets',
    'SECRETFORGM02',
    '### Public subsection',
    'This paragraph is visible.',
    '## GM Notes',
    'SECRETFORGM03',
    '### More Secrets',
    'SECRETFORGM04',
    '## Lore',
    'Public lore.',
    '## GM-only information',
    'SECRETFORGM05'
  ].join('\n');
  const sections=extractPublicSections(markdown);
  const publicText=JSON.stringify(sections);
  assert.ok(publicText.includes('Public overview.'));
  assert.ok(publicText.includes('Public lore.'));
  assert.ok(publicText.includes('This paragraph is visible.'));
  assert.ok(!publicText.includes('SECRETFORGM'));
  assert.ok(!publicText.includes('GM Notes'));
  assert.ok(!publicText.includes('GM-only information'));
  assert.equal(isRestrictedSectionTitle('**GM Notes**'),true);
  assert.equal(isRestrictedSectionTitle('GM-only information'),true);
  assert.equal(isRestrictedSectionTitle('Lore'),false);
  assert.deepEqual(extractPublicSections('# Title\n## Overview\nSafe\n## GM Notes\nsecret'),[{title:'Overview',body:'Safe'}]);
  const fenced=extractPublicSections('# Title\n## Overview\n~~~\n## GM Notes\nsafe code sample\n~~~\n## GM Notes\nsecret');
  assert.equal(fenced.length,1);
  assert.ok(fenced[0].body.includes('## GM Notes'));
  assert.ok(!fenced[0].body.includes('secret'));
});

test('canonical entry and tabs are strictly allowlisted, preserve browser bookmarks and disambiguate duplicate slugs',()=>{
  assert.equal(isValidPublicEntryRoute('handbook','rule-of-cool'),true);
  assert.equal(isValidPublicEntryRoute('handbook','../secret'),false);
  assert.equal(isValidPublicEntryRoute('not-a-domain','rule-of-cool'),false);
  assert.equal(isValidPublicEntryRoute('race',''),false);
  assert.equal(createPublicSectionHref('handbook','rule-of-cool','Core Rule'),
    '#/compendium/handbook/rule-of-cool?tab=Core+Rule');
  assert.equal(createPublicSectionHref('race','../secret','Overview'),'#/compendium');
  const sections=[{title:'Overview',body:'A'}, {title:'Racial Sheet',body:'B'}];
  assert.equal(resolveSelectedSection(sections,'tab=Racial+Sheet'),'Racial Sheet');
  assert.equal(resolveSelectedSection(sections,'tab=Hidden'),'Overview');
  assert.equal(resolvePublicEntry([{slug:'divine-aegis',id:'one'},{slug:'divine-aegis',id:'two'}],'divine-aegis').state,'ambiguous');
  assert.equal(resolvePublicEntry([{slug:'rule-of-cool',id:'one'}],'rule-of-cool').state,'ready');
  assert.equal(resolvePublicEntry([], 'missing').state,'missing');
});

test('unsafe links and executable HTML are never made executable in Markdown output',()=>{
  for(const unsafe of [
    'javascript:alert(1)','data:text/html,abc','http://example.com',
    '//example.com','/admin','#/react/gm/campaign','https://user:secret@example.com'
  ]) assert.equal(getSafePublicHref(unsafe),null,unsafe);
  assert.equal(getSafePublicHref('https://example.com/read').startsWith('https://example.com'),true);
  assert.equal(getSafePublicHref('#/compendium/race/aasimar'),'#/compendium/race/aasimar');
  const jsx=read('frontend/src/compendium/PublicMarkdown.jsx');
  assert.doesNotMatch(jsx,/dangerouslySetInnerHTML|innerHTML\s*=|document\.write|DOMParser|eval\(/);
  assert.match(jsx,/getSafePublicHref/);
  assert.match(jsx,/noopener noreferrer/);
  const page=read('frontend/src/pages/CompendiumEntryPage.jsx');
  assert.match(page,/resolveSelectedSection/);
  assert.match(page,/createPublicSectionHref/);
  assert.match(page,/data-testid="site-compendium-entry-page"/);
  assert.match(page,/data-testid="site-entry-tabs"/);
  assert.doesNotMatch(page,/window\.AsteriaFirebase|fetch\(/);
});

test('isolated entry build, browser CI and previous phase gates remain enabled',()=>{
  const scripts=JSON.parse(read('package.json')).scripts;
  assert.match(scripts['site:check'],/site-compendium-public-entries\.mjs/);
  assert.match(scripts['site:build'],/site-compendium-public-entries\.mjs/);
  assert.match(scripts['site:dev'],/site-compendium-public-entries\.mjs/);
  assert.match(scripts['site:check'],/site-compendium-phase3-2\.test\.mjs/);
  assert.match(scripts['site:entry-browser'],/site-compendium-entry-browser\.cjs/);
  const workflow=read('.github/workflows/site-foundation.yml');
  assert.match(workflow,/npm run site:entry-browser/);
  assert.match(workflow,/asteria-phase-3-2-entry-evidence/);
  assert.match(workflow,/npm run site:compendium-browser/);
  assert.doesNotMatch(read('index.html'),/frontend\/src\/compendium/);
});
