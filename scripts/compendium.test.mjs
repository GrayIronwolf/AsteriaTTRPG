import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import canonical from '../data/compendium.js';
import {stackableStorageItem} from '../src/state/liveWorkspaceModel.mjs';
const require=createRequire(import.meta.url);
const {generate}=require('./generate-compendium.js');
const {validate}=require('./validate-compendium.js');
const read=file=>fs.readFileSync(file,'utf8');
function runtime(){
  const context={window:{ASTERIA_UNIVERSAL_COMPENDIUM_INDEX:structuredClone(canonical)},document:{readyState:'loading',addEventListener(){},getElementById(){return null;},querySelectorAll(){return [];},body:{dataset:{}}},URL,URLSearchParams,setTimeout,clearTimeout};
  vm.createContext(context);
  vm.runInContext(read('js/compendium-registry.js'),context);
  const source=read('js/universal-compendium-engine.js').replace(/\}\)\(\);\s*$/,"window.viewerTest={allEntries,search,filters,tree,detail,properties,naturalACLabel,getBySlug,getByRoute,markdownToHtml,tab:(entry,name)=>{activeTab=name;return tabContent(entry);}};})();");
  vm.runInContext(source,context);
  vm.runInContext(read('js/asteria-market-pricing.js'),context);
  vm.runInContext(read('js/asteria-inventory-workflows.js'),context);
  return context.window;
}
test('one deterministic registry covers every canonical source with unique IDs and valid assets',()=>{
  const result=validate(generate({check:true}));
  assert.deepEqual(result.errors,[]);
  assert.equal(result.entries,886);
  const html=read('index.html');
  for(const retired of ['js/wiki-index.js','js/content-manifest.js','js/race-compendium.js','js/codex-compendium.js','data/compendium-index-clean.json','js/compendium-snapshot-v1.1.js']){
    assert.equal(fs.existsSync(retired),false,retired);assert.equal(html.includes(retired),false,retired);
  }
});
test('moved sources and duplicate sample paths resolve to their preserved stable definitions',()=>{
  const {AsteriaContent:content}=runtime();
  const migration=JSON.parse(read('docs/compendium-migration.json'));
  for(const move of migration.moves.filter(row=>row.id)){
    assert.equal(content.resolve(move.id)?.id,move.id);
    if(!move.from.includes('#'))assert.equal(content.resolve(move.from)?.id,move.id,move.from);
  }
  for(const merge of migration.merged)assert.equal(content.resolve(merge.from)?.id,content.resolve(merge.to)?.id,merge.from);
  assert.equal(content.resolve('/minerals/common/ores/iron-ore')?.slug,'iron-ore');
  assert.equal(content.resolve('/materials/common/metals/iron-ingot')?.slug,'iron-ingot');
  assert.equal(content.resolve('/flora/common/flowers/rose')?.slug,'rose');
});
test('same-name talents remain class-specific and ambiguous historical routes do not select a winner',()=>{
  const {AsteriaContent:content}=runtime();
  const talents=content.resolveAll('Mana Well','talent');
  assert.equal(talents.length,2);assert.equal(content.resolve('Mana Well','talent'),null);
  assert.equal(new Set(talents.map(entry=>entry.route)).size,2);
  for(const entry of talents)assert.equal(content.resolve(entry.id),entry);
  assert.equal(content.entries('class').filter(entry=>entry.slug==='fighter').length,1);
  assert.equal(content.entries('talent').filter(entry=>entry.slug==='guarded-stance').length,1);
});
test('inventory, Forge and shared viewer use the same item definitions, including custom name collisions',()=>{
  const window=runtime(),content=window.AsteriaContent;
  const entry=content.item('iron-ore');
  assert.equal(window.AsteriaInventory.catalogEntries().find(item=>item.id===entry.id),entry);
  assert.equal(window.viewerTest.allEntries().find(item=>item.id===entry.id),entry);
  window.ASTERIA_CUSTOM_ITEMS=[{id:'custom-ore',name:'Iron Ore',type:'Resource',marketValue:7,marketPrice:10}];
  const custom=content.item('custom-ore');
  assert.equal(custom.id,'custom-item:custom-ore');
  assert.equal(window.AsteriaInventory.catalogEntries().filter(item=>item.title==='Iron Ore').length,2);
  window.ASTERIA_CUSTOM_ITEMS=[];
  assert.equal(content.item('custom-ore'),null);
});
test('owned item snapshots preserve mechanics and cannot mutate the canonical definition',()=>{
  const window=runtime(),entry=window.AsteriaContent.item('cobalt-warhammer');
  const original=JSON.stringify(entry);
  const snapshot=window.AsteriaInventory.itemSnapshot(entry,3);
  assert.equal(snapshot.definitionId,entry.id);assert.equal(snapshot.catalogId,entry.slug);
  assert.equal(snapshot.qty,3);assert.equal(snapshot.damage,entry.metadata.damage);
  assert.equal(snapshot.weight,entry.metadata.weight);
  snapshot.qty=99;snapshot.tags?.push('changed');snapshot.damage='changed';
  assert.equal(JSON.stringify(entry),original);
});
test('search and category-specific metadata filters use exact values',()=>{
  const {viewerTest:viewer}=runtime();
  const common=viewer.search('',{domain:'item',metadata:{rarity:'Common'}});
  assert.ok(common.length>0);assert.ok(common.every(entry=>entry.filters.rarity==='Common'));
  const ores=viewer.search('iron',{domain:'item',metadata:{collection:'minerals'}});
  assert.ok(ores.some(entry=>entry.slug==='iron-ore'));assert.ok(!ores.some(entry=>entry.slug==='iron-ingot'));
  assert.ok(viewer.filters('talent').className.includes('Cleric'));
});
test('shared viewer preserves racial NAC, complete rank text, metadata, galleries and tab identity',()=>{
  const {AsteriaContent:content,viewerTest:viewer}=runtime();
  const race=content.resolve('cavern-sprite','race');
  assert.match(viewer.tab(race,'Overview'),/Natural Armour Class \(NAC\)/);
  assert.match(viewer.tab(race,'Racial Sheet'),/Natural Armour Class \(NAC\): 5/);
  assert.equal(viewer.naturalACLabel(content.resolve('aasimar','race')),'Not recorded (fallback 1)');
  const cleric=content.resolve('cleric','class');
  assert.match(viewer.tab(cleric,'Talent Tree'),/Channel Divinity/);
  const artificer=content.resolve('Artificer Discipline','talent');
  assert.match(viewer.tab(artificer,'Ranks'),/Rank 5/);
  assert.match(artificer.sections['Rank 1'],/A craftsman learns a trade/);
  for(const domain of ['race','class','creature','item','spell','talent','skill','religion']){
    const entry=content.entries(domain)[0],before=[...entry.tabs];
    assert.match(viewer.detail(entry),/universal-detail-page/);assert.deepEqual([...entry.tabs],before);
  }
});
test('view-level GM filters do not reveal restricted entries to public visitors',()=>{
  const window=runtime();
  window.ASTERIA_CUSTOM_ITEMS=[{id:'hidden-entry',name:'Hidden Entry',gmOnly:true}];
  assert.equal(window.viewerTest.search('Hidden Entry',{includeGM:true}).length,0);
  assert.equal(window.viewerTest.tree('item').count,window.AsteriaContent.items().length-1);
});
test('all original creatures and authored racial mechanics survive consolidation',()=>{
  const {AsteriaContent:content}=runtime();
  assert.equal(content.entries('creature').length,23);assert.equal(content.entries('race').length,201);
  const sprite=content.resolve('cavern-sprite','race');
  assert.ok(sprite.racialTraits.length);assert.ok(sprite.characteristicRows.length);
  assert.ok(sprite.info.racialTraits.length);
  for(const element of ['air','earth','water','fire','life','death','light','dark']){
    const pixie=content.resolve(element+'-pixie','race');assert.equal(pixie.affinityProfile.primaryPercent,100);
  }
});
test('owned items from different definitions cannot stack by display name',()=>{
  const stock={id:'owned-ore',name:'Iron Ore',catalogId:'iron-ore',definitionId:'item:iron-ore',storageId:'pack',identified:true};
  assert.equal(stackableStorageItem([stock],{...stock,id:'other',definitionId:'custom-item:ore'},'pack'),null);
  assert.equal(stackableStorageItem([stock],{...stock,id:'other'},'pack'),stock);
  const legacy={...stock};delete legacy.definitionId;
  assert.equal(stackableStorageItem([legacy],stock,'pack'),legacy);
  assert.equal(stackableStorageItem([legacy],{...stock,definitionId:'custom-item:ore'},'pack'),null);
});
test('shared content safely renders links and unavailable artwork without duplicate decorated tabs',()=>{
  const {AsteriaContent:content,viewerTest:viewer}=runtime();
  const entry=content.item('cobalt-warhammer');
  assert.ok(entry.sections.Overview.includes('warhammer'));
  assert.ok(entry.sections.Crafting);
  assert.equal(Object.keys(entry.sections).some(key=>key.includes('📜')),false);
  const html=viewer.markdownToHtml('[[Iron Ore]] ![[missing.png]] [unsafe](javascript:alert)',entry);
  assert.match(html,/data-universal-link="Iron Ore"/);
  assert.match(html,/Artwork unavailable/);
  assert.equal(html.includes('<img'),false);
  assert.equal(html.includes('href="javascript:'),false);
});
