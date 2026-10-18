import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import canonical from '../data/compendium.js';
import addHandbook from '../data/compendium-handbook.js';
const complete=addHandbook(structuredClone(canonical));
const read=file=>fs.readFileSync(file,'utf8');
function runtime(fetcher) {
  const requests=[];
  const window={fetch:async url=>{
    requests.push(url);
    if(fetcher)return fetcher(url);
    return {ok:true,json:async()=>JSON.parse(read('data/'+new URL(url).pathname.split('/data/')[1]))};
  }};
  const context={window,document:{currentScript:{src:'https://asteria.invalid/data/compendium-index.js'}},URL,atob,console};
  vm.createContext(context);
  vm.runInContext(read('data/compendium-index.js'),context);
  vm.runInContext(read('js/compendium-registry.js'),context);
  return {api:window.AsteriaContent,data:window.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX,requests};
}

test('Home has all identities, aliases, browsing metadata and full-text search without downloading full pages',()=>{
  const {api,data,requests}=runtime();
  assert.equal(api.entries().length,891);
  assert.equal(data.contentHash,complete.contentHash);
  assert.deepEqual(JSON.parse(JSON.stringify(data.aliases)),complete.aliases);
  assert.equal(requests.length,0);
  for(const original of complete.entries){
    const entry=api.resolve(original.id);
    assert.equal(entry.id,original.id);
    assert.equal(api.resolve(original.route),entry);
    assert.equal(entry.summary,original.summary);
    assert.equal(entry.body,'');
    assert.equal(api.isLoaded(entry),false);
    const term=original.body.toLowerCase().match(/[a-z]{7,}/)?.[0];
    if(term)assert.equal(api.matches(entry,term),true,original.id);
  }
  assert.equal(api.matches(api.resolve('Rule of Cool'),'RULE OF COOL'),true);
  assert.equal(api.matches(api.item('cobalt-warhammer'),'cobalt warhammer'),true);
  assert.equal(api.matches(api.item('cobalt-warhammer'),'thisworddoesnotexist'),false);
  assert.equal(api.item('cobalt-warhammer').metadata.damage,complete.entries.find(e=>e.slug==='cobalt-warhammer').metadata.damage);
  assert.ok(fs.statSync('data/compendium-index.js').size<fs.statSync('data/compendium.js').size*.4);
});

test('concurrent page reads share one request and hydrate the same definition in place',async()=>{
  const {api,requests}=runtime();
  const entry=api.resolve('Rule of Cool');
  const [one,two,copy]=await Promise.all([api.ensureEntry(entry),api.ensureEntry(entry.route),api.ensureEntry({...entry})]);
  assert.equal(one,entry);assert.equal(two,entry);assert.equal(copy,entry);
  assert.equal(requests.length,1);assert.match(requests[0],/handbook-[a-f0-9]+\.json$/);
  assert.equal(api.isLoaded(entry),true);
  assert.match(entry.body,/GM-approved/);
  assert.ok(entry.sections.Overview);
  assert.equal(api.resolve(entry.id),entry);
  await api.ensureEntry(entry);assert.equal(requests.length,1);
  assert.equal(api.isLoaded(api.entries('race')[0]),false);
});

test('every delivered rule, rank, field, artwork reference and stable ID matches the full canonical registry',async()=>{
  const {api,requests}=runtime();
  const held=api.entries();
  await api.ensureDomains(Object.keys(complete.domains));
  assert.equal(api.domainsReady(Object.keys(complete.domains)),true);
  assert.equal(requests.length,new Set(requests).size);
  for(const original of complete.entries){
    const entry=api.resolve(original.id);
    assert.equal(entry,held.find(row=>row.id===entry.id));
    for(const key of ['body','content','sections','metadata','images','imageReferences','aliases','route','sourcePath','related']){
      assert.deepEqual(JSON.parse(JSON.stringify(entry[key])),original[key],`${entry.id}: ${key}`);
    }
    assert.equal(api.matches(entry,'Rule of Cool'),api.matches(entry,'cool rule of'));
  }
});

test('failed or incomplete content leaves shared rules untouched and can be retried',async()=>{
  let fail=true;
  const {api,requests}=runtime(async url=>({ok:!fail,json:async()=>JSON.parse(read('data/'+new URL(url).pathname.split('/data/')[1]))}));
  const entry=api.resolve('Rule of Cool');
  await assert.rejects(api.ensureEntry(entry),/failed/);
  assert.equal(api.isLoaded(entry),false);assert.equal(entry.body,'');
  fail=false;await api.ensureEntry(entry);assert.equal(api.isLoaded(entry),true);assert.equal(requests.length,2);
  const broken=runtime(async()=>({ok:true,json:async()=>({domain:'handbook',entries:[]})}));
  await assert.rejects(broken.api.ensureEntry('Rule of Cool'),/incomplete/);
  assert.equal(broken.api.resolve('Rule of Cool').body,'');
});
