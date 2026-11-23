import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';
import {
  APPEARANCE_VERSION,DICE_FAMILIES,TRAY_SLOTS,TOWER_SLOTS,MATERIALS,
  PALETTE,EYE_TYPES,CAT_PATTERNS,CAT_POSES,defaultDiceAppearance,
  validateDiceAppearance,validateAppearanceCollections
} from '../src/dice/diceAppearanceCatalogue.mjs';
import {
  PBR_MATERIALS,PBR_TEXTURE_CHANNELS,PBR_ART_ASSET_STATUS,LEGACY_DICE_STYLE,
  resolvePbrMaterial,openDiceAppearanceOptions
} from '../src/dice/diceMaterialEngine.mjs';

test('Fourteen unique dice designs; twelve core and two special',()=>{
  assert.equal(DICE_FAMILIES.length,14);
  assert.equal(DICE_FAMILIES.filter(x=>x.tier==='core').length,12);
  assert.equal(DICE_FAMILIES.filter(x=>x.tier==='special').length,2);
  assert.equal(new Set(DICE_FAMILIES.map(x=>x.id)).size,14);
  assert.equal(APPEARANCE_VERSION,1);
  assert.equal(PALETTE.length,16);
});

test('Trays and towers are deliberately unplanned slots',()=>{
  assert.equal(TRAY_SLOTS.length,6);
  assert.equal(TOWER_SLOTS.length,6);
  for(const slot of [...TRAY_SLOTS,...TOWER_SLOTS]){
    assert.equal(slot.status,'reserved');
    assert.equal(slot.design,null);
  }
});

test('All preset defaults validate and keep correct special kind',()=>{
  for(const family of DICE_FAMILIES){
    const valid=validateDiceAppearance(defaultDiceAppearance(family.id));
    assert.equal(valid.familyId,family.id);
    assert.equal(valid.version,1);
    assert.equal(valid.special?.kind, family.id==='dice-watcher'?'watcher':
      family.id==='dice-familiar'?'familiar':undefined);
  }
  assert.equal(EYE_TYPES.length,6);
  assert.equal(CAT_PATTERNS.length,8);
  assert.equal(CAT_POSES.length,8);
});

test('PBR library covers eight materials with bounded numerical values',()=>{
  assert.deepEqual(Object.keys(PBR_MATERIALS).sort(),[...MATERIALS].sort());
  assert.equal(PBR_TEXTURE_CHANNELS.length,5);
  assert.equal(PBR_ART_ASSET_STATUS,'not-yet-built');
  for(const id of MATERIALS){
    const p=PBR_MATERIALS[id];
    for(const field of ['metalness','roughness','transmission','clearcoat'])
      assert.ok(p[field]>=0&&p[field]<=1);
    assert.ok(p.ior>=1);
    const material=resolvePbrMaterial(defaultDiceAppearance(
      DICE_FAMILIES.find(f=>f.materialId===id).id));
    assert.equal(material.materialId,id);
    assert.equal(material.textureStatus,'not-yet-built');
    assert.ok(Object.values(material.textureChannels).every(x=>x===null));
  }
});

test('Appearance validation rejects unsupported keys, values and shapes',()=>{
  const base=defaultDiceAppearance();
  assert.throws(()=>validateDiceAppearance({...base,version:2}),/version/);
  assert.throws(()=>validateDiceAppearance({...base,rollTotal:20}),/Unsupported/);
  assert.throws(()=>validateDiceAppearance({...base,primaryColor:'blue'}),/HEX/);
  assert.throws(()=>validateDiceAppearance({...base,materialId:'unknown'}),/material/);
  assert.throws(()=>validateDiceAppearance({...base,finish:'brushed',materialId:'wood'}),/metal/);
  assert.throws(()=>validateDiceAppearance({...base,perDie:{d7:{primaryColor:'#FFFFFF'}}}),/die type/);
  assert.throws(()=>validateDiceAppearance({...base,perDie:{d20:{}}}),/Empty/);
  assert.throws(()=>validateDiceAppearance({...base,special:{kind:'watcher'}}),/Core dice/);
  assert.throws(()=>validateDiceAppearance({...base,perDie:[]}),/plain object/);
});

test('Watcher eye and Familiar coat customisation validate independently',()=>{
  const eye=defaultDiceAppearance('dice-watcher');
  const cat=defaultDiceAppearance('dice-familiar');
  assert.equal(validateDiceAppearance({...eye,special:{...eye.special,
    irisColor:'#aabbcc',pupil:'round',blink:'frequent',cursorTracking:true}}).special.irisColor,
  '#AABBCC');
  assert.equal(validateDiceAppearance({...cat,special:{...cat.special,
    coatColor:'#112233',coatPattern:'calico',pose:'pouncing'}}).special.coatPattern,'calico');
  assert.throws(()=>validateDiceAppearance({...eye,special:{...eye.special,
    pupil:'starfish'}}),/pupil/);
  assert.throws(()=>validateDiceAppearance({...cat,special:{...cat.special,
    coatColor:'invalid'}}),/HEX/);
  assert.throws(()=>validateDiceAppearance({...eye,special:{...cat.special}}),/family/);
});

test('Die-specific overrides resolve into rendering colours only',()=>{
  const appearance=defaultDiceAppearance('dice-obsidian');
  appearance.perDie={d20:{primaryColor:'#AABBCC',numberColor:'#112233'}};
  const style=openDiceAppearanceOptions(appearance,20);
  assert.equal(style.diceColor,0xAABBCC);
  assert.equal(style.textColor,'#112233');
  assert.deepEqual(openDiceAppearanceOptions(null),LEGACY_DICE_STYLE);
});

test('Visual configuration does not alter official dice totals',()=>{
  const record=diceResult({pool:[{count:1,sides:20}],modifier:5,label:''},
    ()=>20,1730000000000,'phase31validroll');
  const before=prepareAsteriaDicePreview(record);
  openDiceAppearanceOptions(defaultDiceAppearance('dice-watcher'));
  openDiceAppearanceOptions(defaultDiceAppearance('dice-familiar'));
  const after=prepareAsteriaDicePreview(record);
  assert.deepEqual(after,before);
  assert.equal(record.total,25);
});

test('Collection validation enforces twenty maximum and unique names',()=>{
  const item={version:1,name:'My Familiar',dice:defaultDiceAppearance('dice-familiar')};
  assert.equal(validateAppearanceCollections([item]).length,1);
  assert.throws(()=>validateAppearanceCollections([item,{...item,name:'my familiar'}]),/Duplicate/);
  assert.throws(()=>validateAppearanceCollections(Array(21).fill(item)),/Too many/);
  assert.throws(()=>validateAppearanceCollections([{...item,name:''}]),/Invalid collection/);
});

test('Phase 3.1 keeps previous dice and app architecture unchanged',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const ui=read('src/dashboards/AdvancedDiceWorkspace.jsx');
  const tray=read('src/dice/AsteriaDiceTray.jsx');
  assert.match(ui,/firebaseService\.advancedDiceAction/);
  assert.match(ui,/firebaseService\.subscribeDiceWorkspace/);
  assert.match(ui,/<AsteriaDiceTray/);
  assert.match(tray,/open-dice-dnd/);
  assert.doesNotMatch(ui+tray,/Math\.random/);
});
