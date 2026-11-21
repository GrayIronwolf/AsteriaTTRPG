import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  getPublicEntryTabs, publicEntryFacts, publicEntryArtwork, publicRelationshipTargets,
  publicTalentTiers
} from '../frontend/src/compendium/publicEntryPresentation.mjs';

const section=(title,body)=>({title,body});

test('Handbook Rules collects its published headings while existing heading bookmarks remain selectable',()=>{
  const tabs=getPublicEntryTabs({domain:'handbook',sections:[
    section('Overview','Start here.'), section('Core Rule','Use good judgement.'),
    section('Examples','Discuss the outcome.'), section('GM Notes','Private')
  ]});
  assert.equal(tabs[0].title,'Rules');
  assert.deepEqual(tabs[0].sections.map(item=>item.title),['Overview','Core Rule','Examples']);
  assert.equal(tabs.find(item=>item.title==='Core Rule').sections[0].body,'Use good judgement.');
  assert.ok(!tabs.some(item=>item.title==='GM Notes'));
});

test('existing rank and racial bookmarks coexist with the original grouped views',()=>{
  const ranks=getPublicEntryTabs({domain:'talent',sections:[
    section('Overview','A feat.'),section('Rank 3','Third'),section('Rank 1','First')
  ]});
  assert.deepEqual(ranks.find(item=>item.title==='Ranks').sections.map(item=>item.title),['Rank 1','Rank 3']);
  assert.ok(ranks.some(item=>item.title==='Rank 3'));
  const race=getPublicEntryTabs({domain:'race',details:{naturalAC:2},sections:[
    section('Racial Features','Features'),section('Racial Characteristics','Characteristics'),section('Racial Traits','Traits')
  ]});
  assert.deepEqual(race.find(item=>item.title==='Racial Sheet').sections.map(item=>item.title),
    ['Racial Features','Racial Characteristics','Racial Traits']);
  assert.ok(race.some(item=>item.title==='Racial Traits'));
});

test('public facts use domain labels, retain recorded zero, and never expose arbitrary properties',()=>{
  assert.deepEqual(publicEntryFacts({domain:'race',details:{naturalAC:1,naturalACSource:'fallback',size:'Small'}},'Racial Sheet'),[
    {key:'naturalAC',label:'Natural Armour Class (NAC)',value:'Not recorded (fallback 1)'},
    {key:'size',label:'Size',value:'Small'}
  ]);
  assert.deepEqual(publicEntryFacts({domain:'creature',details:{hp:40,armour:0,hiddenNote:'Unpublished'}},'Stat Sheet'),[
    {key:'hp',label:'HP',value:'40'},{key:'armour',label:'Armour',value:'0'}
  ]);
});

test('entry artwork only accepts local image paths, including relative bundler URLs',()=>{
  const base='https://example.test/asteria/';
  assert.equal(publicEntryArtwork('./assets/cover-C3.png',base),'./assets/cover-C3.png');
  assert.equal(publicEntryArtwork('/asteria/assets/closed.webp',base),'/asteria/assets/closed.webp');
  for(const value of ['https://elsewhere.test/a.png','//elsewhere.test/a.png','data:image/png;base64,AAAA',
    'javascript:alert(1)','/account','./assets/../private/hidden.png','/assets/file.svg']){
    assert.equal(publicEntryArtwork(value,base),null,value);
  }
});

test('ambiguous choices and class talent tiers preserve distinct canonical entry destinations',()=>{
  const entries=[
    {domain:'talent',slug:'paladin-divine-aegis',title:'Divine Aegis',categoryPath:['Paladin'],tier:3},
    {domain:'talent',slug:'cleric-divine-aegis',title:'Divine Aegis',categoryPath:['Cleric'],tier:1},
    {domain:'talent',slug:'../secret',title:'Unsafe',tier:1}
  ];
  assert.deepEqual(publicRelationshipTargets(entries).map(row=>row.href),[
    '#/compendium/talent/paladin-divine-aegis','#/compendium/talent/cleric-divine-aegis'
  ]);
  const tiers=publicTalentTiers(entries);
  assert.deepEqual(tiers.map(tier=>tier.number),[1,2,3,4,5]);
  assert.deepEqual(tiers.map(tier=>tier.talents.map(entry=>entry.slug)),
    [['cleric-divine-aegis'],[],['paladin-divine-aegis'],[],[]]);
});

test('entry and Markdown surfaces use generated relationships and artwork, with no executable HTML',async()=>{
  const read=file=>readFile(new URL('../frontend/src/'+file,import.meta.url),'utf8');
  const [page,markdown]=await Promise.all([read('pages/CompendiumEntryPage.jsx'),read('compendium/PublicMarkdown.jsx')]);
  assert.match(page,/result\.choices/);
  assert.match(page,/recordRecent\(entry\)/);
  assert.match(markdown,/imageReferences/);
  assert.match(markdown,/resolvePublicReference/);
  assert.doesNotMatch(markdown,/dangerouslySetInnerHTML|innerHTML\s*=/);
});
