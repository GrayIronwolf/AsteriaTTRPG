import canonicalCompendium from '../data/compendium.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
import {calculateCharacterAC,resolveNaturalAC,readNaturalAC,previewEquipmentChange} from '../src/systems/armour/armourSystem.mjs';
const context={window:{ASTERIA_UNIVERSAL_COMPENDIUM_INDEX:structuredClone(canonicalCompendium)}};
vm.runInNewContext(fs.readFileSync('js/compendium-registry.js','utf8'),context);
const index=canonicalCompendium;
const options={races:index.entries.filter(entry=>entry.domain==='race'),raceInfo:context.window.ASTERIA_RACE_INFO_DATA};
const expected={'Cavern Sprite':5,'Polaris Ursa':2,'Frostborn Undien':12,'Tempestborn Undien':11,'Tideborn Undien':11,'Flowborn Undien':6,'Chirolin':1,'Craglin':1,'Cavarin Avian':1};

test('all supported source spellings preserve numbers without treating total AC as NAC',()=>{
 for(const alias of ['naturalAC','natural_ac','NAC','Natural Armour Class','Natural Armor Class','Neutral AC'])assert.equal(readNaturalAC({metadata:{stats:{[alias]:'+5'}}}),5,alias);
 for(const invalid of [null,undefined,'', '   ',true,false,'unknown','NaN',Infinity])assert.equal(readNaturalAC({naturalAC:invalid}),null,String(invalid));
 assert.equal(readNaturalAC({ac:19}),null);assert.equal(readNaturalAC({naturalAC:1,naturalACSource:'fallback'}),null);
});
test('current race NAC repairs stale saved ones across every character schema without mutation',()=>{
 for(const [race,nac] of Object.entries(expected)) {
  for(const character of [{race,naturalAC:1,raceInfo:{naturalAC:1}},{race:{title:race,metadata:{naturalAC:1}},naturalAC:1},{raceSlug:race.toLowerCase().replaceAll(' ','-'),character:{naturalAC:1}},{character:{race:{title:race,info:{naturalAC:1}}}}]) {
   const before=JSON.stringify(character);const result=calculateCharacterAC(character,options);assert.equal(result.naturalAC,nac,race);assert.equal(result.finalAC,nac,race);assert.equal(JSON.stringify(character),before);
  }
 }
});
test('NAC is the floor for negative effects and armour, while bonuses and rounding still work',()=>{
 const base={race:'Cavern Sprite',naturalAC:1,acModifiers:[{id:'penalty',type:'AC_MODIFIER',value:-100}]};
 const result=calculateCharacterAC(base,options);assert.equal(result.rawAC,-95);assert.equal(result.finalAC,5);
 const bonus=calculateCharacterAC({...base,acModifiers:[{id:'bonus',type:'AC_MODIFIER',value:2.9}]},options);assert.equal(bonus.finalAC,7);
 const expired=calculateCharacterAC({...base,acModifiers:[{id:'bonus',type:'AC_MODIFIER',value:9,expired:true}]},options);assert.equal(expired.finalAC,5);
 const item={id:'mail',name:'Iron Cuirass',armourPieceType:'cuirass',materialBaseAC:4,quality:'Average',armourType:'Medium Armour'};
 const preview=previewEquipmentChange({race:'Cavern Sprite'},item,'Torso',options);assert.equal(preview.before.finalAC,5);assert.ok(preview.result.finalAC>5);assert.equal(calculateCharacterAC({race:'Cavern Sprite',inventory:[{...item,equipped:false}],equipment:{}},options).finalAC,5);
});
test('unknown races stay flagged and valid personal snapshots still work',()=>{
 const unknown=resolveNaturalAC({race:'Aasimar',naturalAC:1,raceInfo:{naturalAC:1}},options);assert.equal(unknown.configured,false);assert.equal(unknown.value,1);
 assert.equal(resolveNaturalAC({race:'Custom',raceInfo:{stats:{'Neutral AC':7}}},{races:[],raceInfo:{}}).value,7);
 assert.equal(resolveNaturalAC({naturalAC:8},{races:[],raceInfo:{}}).value,8);
 assert.equal(resolveNaturalAC({race:'Frostborn Undien',naturalAC:3},options).value,12);
});
test('browser registry and source pages retain restored NAC and provenance',()=>{
 for(const [race,nac] of Object.entries(expected)){
  const entry=context.window.AsteriaContent.resolve(race,'race');
  assert.equal(entry.metadata.naturalAC,nac);assert.equal(entry.naturalAC,nac);
  assert.match(fs.readFileSync(entry.sourcePath,'utf8'),new RegExp('naturalAC: '+nac+'\\n'));
 }
});
// Overview, sheet and fallback labels are exercised by the shared viewer in compendium.test.mjs.
test('Forge payload uses the same NAC as the dashboard and records fallback provenance',()=>{
 const context={window:{addEventListener(){},AsteriaArmour:{resolveNaturalAC:character=>resolveNaturalAC(character,options)}},document:{readyState:'loading',addEventListener(){}}};
 const code=fs.readFileSync('js/asteria-gameplay-systems.js','utf8').replace(/\}\)\(\);\s*$/, 'window.testNAC={raceInfoPayloadForEntry};})();');vm.runInNewContext(code,context);
 const result=context.window.testNAC.raceInfoPayloadForEntry({title:'Frostborn Undien',metadata:{naturalAC:1}});assert.equal(result.naturalAC,12);assert.equal(result.naturalACSource,'race-compendium');
 const fallback=context.window.testNAC.raceInfoPayloadForEntry({title:'Aasimar',metadata:{naturalAC:1,naturalACSource:'fallback'}});assert.equal(fallback.naturalACSource,'fallback');
});

test('future frontmatter generation preserves canonical NAC casing and legacy labels',()=>{
 const {parseFrontmatter}=require('./generate-universal-compendium-index.js');
 for(const alias of ['naturalAC','natural_ac','NAC','Natural Armour Class','Neutral AC']) {
  const parsed=parseFrontmatter(`---\n${alias}: 7\nnaturalACSource: authored\n---\n`);assert.equal(parsed.naturalAC,7);assert.equal(parsed.naturalACSource,'authored');
 }
});
