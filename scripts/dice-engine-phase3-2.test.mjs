import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview,matchesAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';
import {DICE_FAMILIES,defaultDiceAppearance,validateDiceAppearance} from '../src/dice/diceAppearanceCatalogue.mjs';
import {CORE_DICE_FAMILIES,CORE_DICE_TYPES,CORE_DESIGN_RECIPES,
  buildAsteriaCoreDiceSet,coreDefaultSetDefinitions} from '../src/dice/coreDiceDesigns.mjs';
import {coreSetIds,prepareCoreDesigns,releaseCoreDesigns} from '../src/dice/coreDiceRegistry.mjs';

const record=diceResult({pool:[{count:1,sides:20}],modifier:5,label:'Acceptance'},
  ()=>20,1730000000000,'phase32rollid');

test('12 unique PBR core designs and separate 2 special sets',()=>{
  assert.equal(DICE_FAMILIES.length,14);
  assert.equal(CORE_DICE_FAMILIES.length,12);
  assert.equal(CORE_DICE_TYPES.length,7);
  assert.deepEqual(new Set(Object.keys(CORE_DESIGN_RECIPES)),
    new Set(CORE_DICE_FAMILIES.map(x=>x.id)));
  assert.equal(new Set(coreDefaultSetDefinitions().map(x=>x.id)).size,12);
});
test('Each of twelve designs builds a mapped PBR look for every die type',()=>{
  for(const family of CORE_DICE_FAMILIES){
    const appearance=defaultDiceAppearance(family.id);
    for(const type of CORE_DICE_TYPES){
      const definition=buildAsteriaCoreDiceSet(appearance,{dieType:type});
      assert.equal(definition.name,family.name);
      assert.equal(definition.swatch.length,3);
      assert.equal(typeof definition.body.texture.kind,'string');
      assert.equal(typeof definition.body.roughness,'number');
      assert.ok(definition.body.roughness>=0&&definition.body.roughness<=1);
      assert.ok(definition.body.metalness>=0&&definition.body.metalness<=1);
      assert.ok(['gem','glass','metal','textured'].includes(definition.family));
      assert.ok(definition.numeral.color.startsWith('#'));
      assert.ok(['flat','engraved','inlay','glow'].includes(definition.numeral.style));
      assert.ok(definition.numeral.outline);
    }
  }
});
test('Special sets cannot render through core-only builder',()=>{
  for(const id of ['dice-watcher','dice-familiar']){
    assert.throws(()=>buildAsteriaCoreDiceSet(defaultDiceAppearance(id)),/not a Phase 3.2/);
  }
});
test('Appearance edits produce different PBR material settings',()=>{
  const original=defaultDiceAppearance('dice-sapphire');
  const edited=validateDiceAppearance({...original,materialId:'steel',finish:'brushed',
    primaryColor:'#AABBCC',numberColor:'#112233'});
  const before=buildAsteriaCoreDiceSet(original),after=buildAsteriaCoreDiceSet(edited);
  assert.notDeepEqual(before.body,after.body);
  assert.equal(after.body.color,'#AABBCC');
  assert.equal(after.numeral.color,'#112233');
  assert.equal(after.family,'metal');
});
test('Per-die override changes only that die style',()=>{
  const style=defaultDiceAppearance('dice-obsidian');
  style.perDie={d6:{primaryColor:'#ABCDEF',numberColor:'#112233'}};
  const a=buildAsteriaCoreDiceSet(style,{dieType:'d6'});
  const b=buildAsteriaCoreDiceSet(style,{dieType:'d20'});
  assert.equal(a.body.color,'#ABCDEF');
  assert.equal(b.body.color,style.primaryColor);
  assert.equal(a.numeral.color,'#112233');
  assert.equal(b.numeral.color,style.numberColor);
});
test('Open Dice set registry uses isolated stable instance names',()=>{
  const registry=new Map();
  const api={
    registerDiceSet(value,opts){
      if(registry.has(value.id)&&!opts.replace)throw Error('Duplicate');
      registry.set(value.id,value);
    },
    unregisterDiceSet(id){registry.delete(id);}
  };
  const one=prepareCoreDesigns(api,defaultDiceAppearance('dice-ruby'),'one');
  const two=prepareCoreDesigns(api,defaultDiceAppearance('dice-emerald'),'two');
  assert.equal(registry.size,14);
  assert.notEqual(one.d20,two.d20);
  assert.equal(registry.get(one.d20).name,'Ruby');
  assert.equal(registry.get(two.d20).name,'Emerald');
  releaseCoreDesigns(api,one);
  assert.equal(registry.size,7);
  releaseCoreDesigns(api,two);
  assert.equal(registry.size,0);
  assert.throws(()=>coreSetIds('bad:id'),/Invalid/);
});
test('Core looks keep Firebase critical result and percentile mapping intact',()=>{
  const expected=prepareAsteriaDicePreview(record);
  for(const design of CORE_DICE_FAMILIES)buildAsteriaCoreDiceSet(defaultDiceAppearance(design.id));
  assert.equal(record.total,25);
  assert.equal(record.natural,'natural-20');
  assert.deepEqual(prepareAsteriaDicePreview(record),expected);
  assert.equal(matchesAsteriaDicePreview(expected,{
    results:[{value:20,visible:20}],variances:[]}),true);
});
test('Core dice picker integrates into existing React workspace without server mutations',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const ui=read('src/dashboards/AdvancedDiceWorkspace.jsx');
  const tray=read('src/dice/AsteriaDiceTray.jsx');
  const picker=read('src/dice/CoreDicePicker.jsx');
  assert.match(ui,/<DiceCustomizationStudio/);
  assert.match(read('src/dice/DiceCustomizationStudio.jsx'),/<CoreDicePicker/);
  assert.match(ui,/<AsteriaDiceTray/);
  assert.match(ui,/firebaseService\.advancedDiceAction/);
  assert.match(ui,/firebaseService\.subscribeDiceWorkspace/);
  assert.match(tray,/prepareCoreDesigns/);
  assert.match(picker,/createDie\(/);
  assert.match(picker,/WebGLRenderer/);
  assert.doesNotMatch(ui+tray+picker,/Math\.random/);
});
