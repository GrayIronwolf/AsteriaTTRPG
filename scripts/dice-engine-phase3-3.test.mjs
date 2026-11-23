import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  defaultDiceAppearance,validateDiceAppearance,CAT_PATTERNS,CAT_POSES,TRANSPARENCY
} from '../src/dice/diceAppearanceCatalogue.mjs';
import {
  CAT_POSE_ART,FAMILIAR_COAT_COLORS,FAMILIAR_EYE_COLORS,
  FAMILIAR_PAW_COLORS,FAMILIAR_NUMBER_COLORS,FAMILIAR_DECORATIONS,
  familiarArtworkSvg,familiarArtworkDataUrl
} from '../src/dice/familiarDiceArt.mjs';
import {buildFamiliarDiceSet,familiarVisualAnimationAllowed} from '../src/dice/familiarDiceDesign.mjs';
import {CORE_DICE_TYPES} from '../src/dice/coreDiceDesigns.mjs';
import {prepareCoreDesigns,releaseCoreDesigns} from '../src/dice/coreDiceRegistry.mjs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview,matchesAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';

test('Featured Familiar default keeps white resin, black cat and gold numerals',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  assert.equal(a.familyId,'dice-familiar');
  assert.equal(a.materialId,'resin');
  assert.equal(a.special.kind,'familiar');
  assert.equal(a.special.coatColor,'#111925');
  assert.equal(a.special.resinColor,'#F2F3EE');
  assert.equal(a.numberColor,'#D5B36A');
  assert.equal(a.trim,'gold');
  assert.equal(a.special.decoration,'paw');
  assert.equal(a.special.animation,false);
  assert.equal(buildFamiliarDiceSet(a).numeral.color,'#D5B36A');
});
test('All required colour, coat, pose and icon catalogues exist',()=>{
  assert.equal(FAMILIAR_COAT_COLORS.length,12);
  assert.equal(FAMILIAR_EYE_COLORS.length,8);
  assert.equal(FAMILIAR_PAW_COLORS.length,12);
  assert.equal(FAMILIAR_NUMBER_COLORS.length,12);
  assert.equal(CAT_POSES.length,8);
  assert.equal(CAT_PATTERNS.length,8);
  assert.equal(TRANSPARENCY.length,4);
  assert.equal(FAMILIAR_DECORATIONS.length,12);
  assert.deepEqual(Object.keys(CAT_POSE_ART).sort(),[...CAT_POSES].sort());
});
test('All eight cat poses produce distinct non-empty painted art',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  const art=CAT_POSES.map(pose=>familiarArtworkSvg({...a.special,pose},a.numberColor));
  assert.equal(new Set(art).size,8);
  for(const svg of art){
    assert.match(svg,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(svg,/<clipPath/);
    assert.match(svg,/<ellipse/);
    assert.match(svg,/<\/svg>$/);
    assert.ok(svg.length>1000);
  }
});
test('All eight coat patterns produce distinct texture pixels',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  const art=CAT_PATTERNS.map(coatPattern=>familiarArtworkSvg({...a.special,coatPattern},a.numberColor));
  assert.equal(new Set(art).size,8);
});
test('Eye colour, coat, paw, resin and decorative motif influence output',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  const normal=familiarArtworkSvg(a.special,a.numberColor);
  const variants=[
    {...a.special,coatColor:'#FF00AA'},
    {...a.special,eyeColor:'#00FF00'},
    {...a.special,pawColor:'#CC22DD'},
    {...a.special,resinColor:'#553377'},
    {...a.special,decoration:'moon'}
  ];
  variants.forEach((value,i)=>{
    assert.notEqual(familiarArtworkSvg(value,a.numberColor),normal,'variant '+i);
  });
  assert.ok(familiarArtworkDataUrl(a.special,a.numberColor).startsWith('data:image/svg+xml;charset=utf-8,'));
});
test('Unknown or unsafe SVG-adjacent user values are rejected by schema',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  for(const invalid of [
    {coatColor:'<script>alert(1)</script>'},
    {eyeColor:'red'},
    {pawColor:'url(https://example.com)'},
    {pose:'evil<svg>'},
    {coatPattern:'unknown'},
    {decoration:'<circle>'},
    {transparency:'fully-transparent'},
    {animation:'yes'}
  ])assert.throws(()=>validateDiceAppearance({...a,special:{...a.special,...invalid}}));
});
test('Backwards compatible Familiar visual records without decoration default to paw',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  const {decoration,...legacy}=a.special;
  const result=validateDiceAppearance({...a,special:legacy});
  assert.equal(result.special.decoration,'paw');
});
test('Familiar design makes seven fully-numbered PBR die types',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  for(const dieType of CORE_DICE_TYPES){
    const set=buildFamiliarDiceSet(a,{dieType,id:'asteria-test-'+dieType});
    assert.equal(set.name,'Familiar Dice');
    assert.equal(set.family,'glass');
    assert.equal(set.numeral.style,'engraved');
    assert.equal(set.numeral.color,'#D5B36A');
    assert.ok(set.body.image.src.startsWith('data:image/svg+xml'));
    assert.ok(set.body.clearcoat>0);
    assert.ok(set.body.roughness<1);
    assert.equal(set.swatch.length,3);
  }
});
test('Familiar resin variations change physical material appearance',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  const presets=TRANSPARENCY.map(transparency=>
    buildFamiliarDiceSet({...a,special:{...a.special,transparency}}));
  assert.equal(new Set(presets.map(x=>x.body.roughness)).size,4);
  assert.equal(new Set(presets.map(x=>x.body.vignette)).size,4);
});
test('Numbers remain visible on every die: no numeral replacing emblems or decals',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  for(const pose of CAT_POSES){
    const set=buildFamiliarDiceSet({...a,special:{...a.special,pose}});
    assert.equal(set.emblems,undefined);
    assert.equal(set.decals,undefined);
    assert.ok(set.numeral.outline.width>=.05);
  }
});
test('Familiar registers alongside all twelve core designs with isolated names',()=>{
  const registry=new Map();
  const api={
    registerDiceSet(value,opts){if(registry.has(value.id)&&!opts.replace)throw Error('duplicate');
      registry.set(value.id,value);},
    unregisterDiceSet(id){registry.delete(id);}
  };
  const cat=prepareCoreDesigns(api,defaultDiceAppearance('dice-familiar'),'familiar-unit');
  assert.equal(Object.keys(cat).length,7);
  assert.equal(registry.size,7);
  assert.ok([...registry.values()].every(x=>x.name==='Familiar Dice'));
  const ruby=prepareCoreDesigns(api,defaultDiceAppearance('dice-ruby'),'ruby-unit');
  assert.equal(registry.size,14);
  releaseCoreDesigns(api,cat);releaseCoreDesigns(api,ruby);
  assert.equal(registry.size,0);
  assert.throws(()=>prepareCoreDesigns(api,defaultDiceAppearance('dice-watcher'),'watcher-unit'),
    /Phase 3.4/);
});
test('Optional shimmer respects both setting and reduced motion',()=>{
  const a=defaultDiceAppearance('dice-familiar');
  assert.equal(familiarVisualAnimationAllowed(a),false);
  const enabled={...a,special:{...a.special,animation:true}};
  assert.equal(familiarVisualAnimationAllowed(enabled,false),true);
  assert.equal(familiarVisualAnimationAllowed(enabled,true),false);
  assert.equal(familiarVisualAnimationAllowed(defaultDiceAppearance('dice-ruby')),false);
});
test('Familiar customization never changes Firebase-authoritative critical or percentile results',()=>{
  const record=diceResult({pool:[{count:1,sides:20},{count:1,sides:100}],modifier:3,label:'Familiar'},
    ()=>1,1730000000000,'familiar-server-check');
  const original=prepareAsteriaDicePreview(record);
  const a=defaultDiceAppearance('dice-familiar');
  buildFamiliarDiceSet({...a,special:{...a.special,pose:'pouncing',eyeColor:'#7947B2'}});
  assert.deepEqual(prepareAsteriaDicePreview(record),original);
  assert.equal(record.total,5);
  assert.equal(matchesAsteriaDicePreview(original,{
    results:original.expectedFaces.map(value=>({value,visible:value})),variances:[]}),true);
});
test('Existing React workspace uses same dice engine and Firebase action',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const picker=read('src/dice/CoreDicePicker.jsx');
  const tray=read('src/dice/AsteriaDiceTray.jsx');
  const workspace=read('src/dashboards/AdvancedDiceWorkspace.jsx');
  assert.match(picker,/<FamiliarDiceControls/);
  assert.match(picker,/dice-familiar/);
  assert.match(tray,/prepareCoreDesigns/);
  assert.match(workspace,/firebaseService\.advancedDiceAction/);
  assert.match(workspace,/subscribeDiceWorkspace/);
  assert.doesNotMatch(tray+workspace,/Math\.random/);
});
